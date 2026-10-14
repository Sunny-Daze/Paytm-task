import type { ColumnDefinitions, MigrationBuilder } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    "shows",
    {
      id: {
        type: "uuid",
        primaryKey: true,
        default: pgm.func("gen_random_uuid()"),
      },
      name: {
        type: "text",
        notNull: true,
      },
      price: {
        type: "numeric",
        notNull: true,
        check: "price >= 0",
      },
      total_seats: {
        type: "integer",
        notNull: true,
        check: "total_seats > 0",
      },
      per_user_limit: {
        type: "integer",
        notNull: true,
        default: 4,
        check: "per_user_limit > 0",
      },
      created_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("now()"),
      },
    },
    {
      constraints: {
        check: "per_user_limit <= total_seats",
      },
    },
  );
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("shows");
}
