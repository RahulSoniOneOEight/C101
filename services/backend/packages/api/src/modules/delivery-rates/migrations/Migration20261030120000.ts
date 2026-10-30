import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261030120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "seller_delivery_rate" (` +
        `"id" text not null, ` +
        `"seller_id" text not null, ` +
        `"pincode" char(6) not null, ` +
        `"flat_fee_minor" integer not null, ` +
        `"currency_code" text not null default 'inr', ` +
        `"active" boolean not null default true, ` +
        `"updated_by" text check ("updated_by" in ('admin', 'seller')) not null, ` +
        `"created_at" timestamptz not null default now(), ` +
        `"updated_at" timestamptz not null default now(), ` +
        `"deleted_at" timestamptz null, ` +
        `constraint "seller_delivery_rate_pkey" primary key ("id"), ` +
        `constraint "seller_delivery_rate_fee_non_negative" check ("flat_fee_minor" >= 0)` +
        `);`,
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_seller_delivery_rate_seller_pincode_unique" ` +
        `ON "seller_delivery_rate" ("seller_id", "pincode") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_seller_delivery_rate_pincode_active" ` +
        `ON "seller_delivery_rate" ("pincode", "active") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_seller_delivery_rate_seller" ` +
        `ON "seller_delivery_rate" ("seller_id") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_seller_delivery_rate_deleted_at" ` +
        `ON "seller_delivery_rate" ("deleted_at") WHERE deleted_at IS NULL;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "seller_delivery_rate" cascade;`);
  }
}
