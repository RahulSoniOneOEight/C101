import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261012122147 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "settlement_statement" drop constraint if exists "settlement_statement_statement_number_unique";`,
    );
    this.addSql(
      `create table if not exists "settlement_statement" ("id" text not null, "statement_number" text not null, "seller_id" text not null, "seller_name" text not null, "period_start" timestamptz not null, "period_end" timestamptz not null, "generated_at" timestamptz not null, "currency_code" text not null, "gross_amount_minor" integer not null, "refund_amount_minor" integer not null default 0, "commission_amount_minor" integer not null, "adjustment_amount_minor" integer not null default 0, "payable_amount_minor" integer not null, "status" text check ("status" in ('calculated', 'reviewed', 'held')) not null, "lines" jsonb not null, "policy_snapshot" jsonb not null, "test_data" boolean not null default true, "payment_mode" text not null default 'simulated', "payout_execution_authorized" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "settlement_statement_pkey" primary key ("id"));`,
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_settlement_statement_statement_number_unique" ON "settlement_statement" ("statement_number") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_settlement_statement_deleted_at" ON "settlement_statement" ("deleted_at") WHERE deleted_at IS NULL;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "settlement_statement" cascade;`);
  }
}
