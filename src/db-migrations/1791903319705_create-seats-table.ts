import type { ColumnDefinitions, MigrationBuilder } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    "seats",
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
      seat_label: {
        type: "text",
        notNull: true,
      },
      status: {
        type: "text",
        notNull: true,
        check: "status IN ('available', 'held', 'confirmed')",
      },
      current_reservation_id: {
        type: "uuid",
        references: "reservations(id)",
        onDelete: "SET NULL",
      },
    },
    {
      constraints: {
        unique: ["show_id", "seat_label"],
        check: "(status = 'available') = (current_reservation_id IS NULL)",
      },
    },
  );

  pgm.createIndex("seats", ["show_id", "seat_label"]);
  pgm.createIndex("seats", ["current_reservation_id"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("seats");
}
