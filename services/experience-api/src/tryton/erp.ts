import { TrytonClient } from "./client.js";

/**
 * Staging ERP integration: maps Medusa variants to Tryton products and models the
 * reservation lifecycle (reserve → commit/release) as Tryton stock moves. All records are
 * test data; accounting is projected only (test-clearing), never bank receipt.
 */

export interface ErpReference {
  system: "tryton";
  entity_type: string;
  entity_id: string | null;
  environment: string;
  test_data: boolean;
  status: string;
  observed_at: string;
}

export class TrytonErp {
  private productBySku = new Map<string, number>();
  private moveByRef = new Map<string, number>();

  constructor(
    private readonly client: TrytonClient,
    private readonly username = "admin",
  ) {}

  private async uomId(): Promise<number> {
    const ids = await this.client.search("product.uom", [["name", "=", "Unit"]], 1);
    if (ids.length) return ids[0];
    const any = await this.client.search("product.uom", [], 1);
    if (!any.length) throw new Error("No unit of measure configured in Tryton");
    return any[0];
  }

  private async warehouseLocationId(): Promise<number> {
    const ids = await this.client.search("stock.location", [["type", "=", "warehouse"]], 1);
    if (!ids.length) throw new Error("No warehouse location in Tryton");
    return ids[0];
  }

  private async storageLocationId(): Promise<number> {
    const ids = await this.client.search(
      "stock.location",
      [["type", "=", "storage"], ["parent", "!=", null]],
      1,
    );
    if (ids.length) return ids[0];
    // Fall back to any non-warehouse storage location.
    const any = await this.client.search("stock.location", [["type", "=", "storage"]], 1);
    if (!any.length) throw new Error("No storage location in Tryton");
    return any[0];
  }

  private async companyId(): Promise<number> {
    let companyId: number;
    const existing = await this.client.search("company.company", [], 1);
    if (existing.length) {
      companyId = existing[0];
    } else {
      // Minimal company setup: currency + party + company.
      let currency = await this.client.search("currency.currency", [["code", "=", "INR"]], 1);
      if (!currency.length) {
        const id = await this.client.create("currency.currency", {
          name: "Indian Rupee",
          code: "INR",
          symbol: "\u20b9",
          numeric_code: "356",
          digits: 2,
        });
        currency = [id];
      }
      const partyId = await this.client.create("party.party", { name: "BuildKart India" });
      companyId = await this.client.create("company.company", {
        party: partyId,
        currency: currency[0],
      });
    }

    // Bind the admin user to the company so record rules (e.g. "User in companies") pass.
    const users = await this.client.search("res.user", [["login", "=", this.username]], 1);
    if (users.length) {
      // many2many write uses [["add", [ids]]] command format.
      await this.client.write("res.user", users, {
        companies: [["add", [companyId]]],
      });
    }
    // Record rules evaluate against the context company; set it globally.
    this.client.setContext({ company: companyId });
    return companyId;
  }

  private async customerLocationId(): Promise<number> {
    const ids = await this.client.search("stock.location", [["type", "=", "customer"]], 1);
    if (ids.length) return ids[0];
    // Fall back to the warehouse storage location.
    return this.warehouseLocationId();
  }

  async syncVariant(sku: string, name: string, priceMinor: number): Promise<number> {
    if (this.productBySku.has(sku)) return this.productBySku.get(sku)!;

    const existing = await this.client.search(
      "product.template",
      [["code", "=", sku]],
      1,
    );
    if (existing.length) {
      const products = await this.client.search(
        "product.product",
        [["template", "=", existing[0]]],
        1,
      );
      const productId = products.length ? products[0] : await this.createProduct(existing[0]);
      this.productBySku.set(sku, productId);
      return productId;
    }

    const uom = await this.uomId();
    const templateId = await this.client.create("product.template", {
      name,
      type: "goods",
      default_uom: uom,
      code: sku,
    });
    const productId = await this.createProduct(templateId);
    this.productBySku.set(sku, productId);
    return productId;
  }

  private async createProduct(templateId: number): Promise<number> {
    // `code` on product.product is read-only (derived from template); set only the template link.
    return this.client.create("product.product", { template: templateId });
  }

  private async findProductBySku(sku: string): Promise<number> {
    if (this.productBySku.has(sku)) return this.productBySku.get(sku)!;
    const templates = await this.client.search("product.template", [["code", "=", sku]], 1);
    if (!templates.length) {
      throw new Error(`Tryton product not found for SKU ${sku}`);
    }
    const products = await this.client.search(
      "product.product",
      [["template", "=", templates[0]]],
      1,
    );
    if (!products.length) {
      throw new Error(`Tryton variant not found for template ${templates[0]}`);
    }
    return products[0];
  }

  async reserve(checkoutRef: string, sku: string, quantity: number): Promise<number> {
    const product = await this.findProductBySku(sku);
    const fromLocation = await this.storageLocationId();
    const toLocation = await this.customerLocationId();
    const company = await this.companyId();
    const unit = await this.uomId();
    const currencies = await this.client.search("currency.currency", [["code", "=", "INR"]], 1);
    const currency = currencies.length ? currencies[0] : 1;

    const moveId = await this.client.create("stock.move", {
      product,
      from_location: fromLocation,
      to_location: toLocation,
      quantity,
      unit,
      company,
      currency,
      unit_price: 0,
    });
    this.moveByRef.set(checkoutRef, moveId);
    return moveId;
  }

  async commit(moveId: number): Promise<void> {
    // "assigned" commits the reservation (allocates stock) without requiring cost-price
    // valuation; "done" would require product cost prices which the seed does not set.
    await this.client.write("stock.move", [moveId], { state: "assigned" });
  }

  async release(moveId: number): Promise<void> {
    await this.client.write("stock.move", [moveId], { state: "cancelled" });
  }

  getMoveIdByRef(checkoutRef: string): number | undefined {
    return this.moveByRef.get(checkoutRef);
  }
}
