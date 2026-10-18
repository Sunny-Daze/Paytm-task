import type { ColumnDefinitions, MigrationBuilder } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Composite FK target so a reservation item's seat must belong to the same show
  pgm.addConstraint("seats", "seats_id_show_id_key", {
    unique: ["id", "show_id"],
  });

  pgm.createTable(
    "reservation_items",
    {
      reservation_id: {
        type: "uuid",
        notNull: true,
      },
      seat_id: {
        type: "uuid",
        notNull: true,
      },
      show_id: {
        type: "uuid",
        notNull: true,
      },
      seat_label_at_reservation: {
        type: "text",
        notNull: true,
      },
      unit_price_paise: {
        type: "numeric",
        notNull: true,
        check: "unit_price_paise >= 0",
      },
    },
    {
      constraints: {
        primaryKey: ["reservation_id", "seat_id"],
        foreignKeys: [
          {
            columns: ["reservation_id", "show_id"],
            references: "reservations(id, show_id)",
          },
          {
            columns: ["seat_id", "show_id"],
            references: "seats(id, show_id)",
          },
        ],
      },
    },
  );

  pgm.createIndex("reservation_items", ["seat_id"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("reservation_items");
  pgm.dropConstraint("seats", "seats_id_show_id_key");
}
