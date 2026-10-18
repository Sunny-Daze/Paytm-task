import z from "zod";

export const authSchema = z.object({
  username: z.string().min(3),
  role: z.enum(["admin", "user"]).default("user"),
});
