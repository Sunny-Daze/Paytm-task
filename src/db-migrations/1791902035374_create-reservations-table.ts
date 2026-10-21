import type { ColumnDefinitions, MigrationBuilder } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    "reservations",
    {
      id: {
        type: "uuid",
        primaryKey: true,
        default: pgm.func("gen_random_uuid()"),
      },
      show_id: {
        type: "uuid",
        notNull: true,
        references: "shows(id)",
        onDelete: "NO ACTION",
      },
      user_id: {
        type: "text",
        notNull: true,
        references: "users(id)",
        onDelete: "NO ACTION",
      },
      amount: {
        type: "numeric",
        notNull: true,
        check: "amount >= 0",
      },
      status: {
        type: "text",
        notNull: true,
        check: "status IN ('held', 'confirmed', 'cancelled', 'expired')",
      },
      // Only set for reservations that start as a time-boxed hold
      hold_expires_at: {
        type: "timestamptz",
      },
      created_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("now()"),
      },
      confirmed_at: {
        type: "timestamptz",
      },
      cancelled_at: {
        type: "timestamptz",
      },
      expired_at: {
        type: "timestamptz",
      },
    },
    {
      constraints: {
        unique: ["id", "show_id"],
      },
    },
  );

  pgm.createIndex("reservations", ["show_id", "status"]);
  pgm.createIndex("reservations", ["show_id", "user_id"]);
  pgm.createIndex("reservations", "hold_expires_at", {
    where: "status = 'held'",
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("reservations");
}
