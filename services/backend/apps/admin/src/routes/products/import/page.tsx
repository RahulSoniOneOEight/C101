import {
  Button,
  Container,
  Heading,
  StatusBadge,
  Table,
  Text,
} from "@medusajs/ui";
import { useState } from "react";
import { Link } from "react-router-dom";

declare const __BACKEND_URL__: string;

const TEMPLATE_COLUMNS = [
  "product_title",
  "card_subtitle",
  "description",
  "category",
  "brand",
  "manufacturer",
  "model_number",
  "product_type",
  "hsn_code",
  "unit_of_measure",
  "image_url",
  "tags",
  "specifications",
  "variant_name",
  "variant_sku",
  "variant_description",
  "variant_image_url",
  "seller",
  "b2c_list_price",
  "b2c_selling_price",
  "b2b_list_price",
  "b2b_selling_price",
  "b2b_moq",
];

const SAMPLE = [
  "AquaTek PPR Pipe 25mm 3m",
  "Hot-water PPR pipe",
  "Three-metre PPR pipe for hot and cold water lines.",
  "Basin Mixers & Taps",
  "AquaTek",
  "AquaTek Industries",
  "AT-PPR-25",
  "Pipe",
  "3917",
  "piece",
  "https://example.com/image.jpg",
  "plumbing;pipe",
  "Material=PPR|Length=3 m|Diameter=25 mm",
  "Default",
  "AQUATEK-PPR-25-3M",
  "Three-metre length",
  "",
  "BuildMaster Supplies",
  "1200",
  "999",
  "1100",
  "950",
  "5",
];

type RowResult = {
  row: number;
  sku: string;
  status: "ready" | "created" | "failed";
  product_id?: string;
  errors: string[];
};

type ImportResponse = {
  mode: "validate" | "apply";
  totals: { rows: number; created: number; ready: number; failed: number };
  results: RowResult[];
};

/** Minimal RFC4180-ish CSV parser: quotes, escaped quotes, embedded commas. */
function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (quoted) {
      if (char === '"' && normalized[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((entry) => entry.some((cell) => cell.trim()));
  if (!header) return [];
  return body.map((cells) =>
    Object.fromEntries(
      header.map((column, index) => [column.trim(), (cells[index] ?? "").trim()]),
    ),
  );
}

const download = (name: string, content: string) => {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
};

export default function ProductImportPage() {
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [busy, setBusy] = useState<"validate" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const backend = __BACKEND_URL__.replace(/\/$/, "");

  async function run(mode: "validate" | "apply") {
    if (rows.length === 0) {
      setError("Choose a CSV file first.");
      return;
    }
    setBusy(mode);
    setError(null);
    try {
      const response = await fetch(`${backend}/admin/buildkart/product-import`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, rows }),
      });
      const body = (await response.json().catch(() => ({}))) as
        | ImportResponse
        | { message?: string };
      if (!response.ok) {
        throw new Error(
          (body as { message?: string }).message ?? `Request failed (${response.status}).`,
        );
      }
      setResult(body as ImportResponse);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const failures = result?.results.filter((row) => row.status === "failed") ?? [];
  // Failed rows are skipped; valid rows can still be imported.
  const canImport = result?.mode === "validate" && result.totals.ready > 0;

  return (
    <div className="flex flex-col gap-y-3 pb-24">
      <Container className="p-0">
        <div className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <Heading level="h1">Import products</Heading>
            <Text size="small" className="mt-1 max-w-2xl text-ui-fg-subtle">
              Download the template, fill one row per product, validate it, then
              import. Imported products follow the same publish, channel, seller
              offer and pricing rules as the Product Studio.
            </Text>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/products">
              <Button size="small" variant="secondary">
                Back to products
              </Button>
            </Link>
          </div>
        </div>
      </Container>

      <Container className="p-0">
        <div className="flex flex-col gap-4 px-6 py-5">
          <div>
            <Heading level="h2">1. Template</Heading>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              One row creates one product with one variant. Existing SKUs are
              rejected; edit those in the studio.
            </Text>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="small"
                variant="secondary"
                onClick={() =>
                  download("product-import-template.csv", TEMPLATE_COLUMNS.join(",") + "\n")
                }
              >
                Download empty template
              </Button>
              <Button
                size="small"
                variant="secondary"
                onClick={() =>
                  download(
                    "product-import-example.csv",
                    `${TEMPLATE_COLUMNS.join(",")}\n${SAMPLE.map((value) =>
                      /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value,
                    ).join(",")}\n`,
                  )
                }
              >
                Download with example row
              </Button>
            </div>
          </div>

          <div className="border-t border-ui-border-base pt-4">
            <Heading level="h2">2. Upload</Heading>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setResult(null);
                  setError(null);
                  const text = await file.text();
                  const parsed = parseCsv(text);
                  setRows(parsed);
                  setFileName(file.name);
                }}
                className="text-sm text-ui-fg-base"
              />
              {fileName ? (
                <Text size="small" className="text-ui-fg-subtle">
                  {fileName} · {rows.length} row{rows.length === 1 ? "" : "s"}
                </Text>
              ) : null}
            </div>
            {rows.length > 0 ? (
              <div className="mt-3 overflow-x-auto rounded-lg border border-ui-border-base">
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>Row</Table.HeaderCell>
                      <Table.HeaderCell>Product</Table.HeaderCell>
                      <Table.HeaderCell>SKU</Table.HeaderCell>
                      <Table.HeaderCell>Seller</Table.HeaderCell>
                      <Table.HeaderCell>B2C</Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {rows.slice(0, 20).map((row, index) => (
                      <Table.Row key={index}>
                        <Table.Cell>{index + 2}</Table.Cell>
                        <Table.Cell>{row.product_title || "—"}</Table.Cell>
                        <Table.Cell>{row.variant_sku || "—"}</Table.Cell>
                        <Table.Cell>{row.seller || "—"}</Table.Cell>
                        <Table.Cell>
                          {row.b2c_selling_price ? `₹${row.b2c_selling_price}` : "—"}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="small"
                variant="secondary"
                isLoading={busy === "validate"}
                disabled={rows.length === 0 || busy !== null}
                onClick={() => void run("validate")}
              >
                Validate
              </Button>
              <Button
                size="small"
                isLoading={busy === "apply"}
                disabled={!canImport || busy !== null}
                onClick={() => void run("apply")}
              >
                Import{" "}
                {result?.mode === "validate" ? result.totals.ready : ""} product
                {result?.mode === "validate" && result.totals.ready === 1 ? "" : "s"}
              </Button>
            </div>
            {error ? (
              <p className="mt-2 text-sm text-ui-fg-error">{error}</p>
            ) : null}
          </div>

          {result ? (
            <div className="border-t border-ui-border-base pt-4">
              <div className="flex flex-wrap items-center gap-3">
                <Heading level="h2">3. Results</Heading>
                <StatusBadge color="grey">
                  {result.totals.created} created · {result.totals.ready} ready ·{" "}
                  {result.totals.failed} failed
                </StatusBadge>
                {failures.length > 0 ? (
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={() =>
                      download(
                        "product-import-errors.csv",
                        `row,sku,errors\n${failures
                          .map(
                            (row) =>
                              `${row.row},${row.sku},"${row.errors.join("; ").replace(/"/g, '""')}"`,
                          )
                          .join("\n")}\n`,
                      )
                    }
                  >
                    Download errors
                  </Button>
                ) : null}
              </div>
              <div className="mt-3 overflow-x-auto rounded-lg border border-ui-border-base">
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>Row</Table.HeaderCell>
                      <Table.HeaderCell>SKU</Table.HeaderCell>
                      <Table.HeaderCell>Status</Table.HeaderCell>
                      <Table.HeaderCell>Detail</Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {result.results.map((row) => (
                      <Table.Row key={`${row.row}-${row.sku}`}>
                        <Table.Cell>{row.row}</Table.Cell>
                        <Table.Cell>{row.sku || "—"}</Table.Cell>
                        <Table.Cell>
                          <StatusBadge
                            color={
                              row.status === "failed"
                                ? "red"
                                : row.status === "created"
                                  ? "green"
                                  : "blue"
                            }
                          >
                            {row.status}
                          </StatusBadge>
                        </Table.Cell>
                        <Table.Cell>
                          {row.errors.length > 0 ? (
                            <span className="text-xs text-ui-fg-error">
                              {row.errors.join("; ")}
                            </span>
                          ) : row.product_id ? (
                            <Link
                              to={`/product-studio/${row.product_id}`}
                              className="text-xs font-medium text-ui-fg-interactive hover:underline"
                            >
                              Open product
                            </Link>
                          ) : (
                            "—"
                          )}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              </div>
            </div>
          ) : null}
        </div>
      </Container>
    </div>
  );
}
