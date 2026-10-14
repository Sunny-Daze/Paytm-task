import type { ColumnDefinitions, MigrationBuilder } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    "idempotency_requests",
    {
      user_id: {
        type: "uuid",
        notNull: true,
        references: "users(id)",
      },
      operation: {
        type: "text",
        notNull: true,
        check: "operation IN ('reserve', 'confirm', 'cancel')",
      },
      idempotency_key: {
        type: "text",
        notNull: true,
      },
      request_hash: {
        type: "text",
        notNull: true,
      },
      reservation_id: {
        type: "uuid",
        references: "reservations(id)",
      },
      response_status: {
        type: "int",
      },
      response_body: {
        type: "jsonb",
        notNull: true,
      },
      created_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("now()"),
      },
    },
    {
      constraints: {
        primaryKey: ["user_id", "operation", "idempotency_key"],
        check: [
          "(response_status IS NULL) = (response_body IS NOT NULL)",
          "(completed_at IS NULL) = (response_status IS NULL)",
        ],
      },
    },
  );

  pgm.createIndex("idempotency_requests", ["created_at"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("idempotency_requests");
}
