import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  authProviderId: text("auth_provider_id").unique(),
  accountType: text("account_type").notNull().default("client_user"),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  platformRole: text("platform_role"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
