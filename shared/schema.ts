import { desc, sql } from "drizzle-orm";
import { boolean, date, index, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const portfolioHoldings = pgTable("portfolio_holdings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  ticker: varchar("ticker", { length: 12 }).notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 6 }).notNull(),
  averagePrice: numeric("average_price", { precision: 14, scale: 4 }).notNull(),
  purchaseDate: date("purchase_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("portfolio_holdings_user_id_ticker_key").on(table.userId, table.ticker),
  index("portfolio_holdings_user_id_idx").on(table.userId),
]);

export const portfolioTransactions = pgTable("portfolio_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  ticker: varchar("ticker", { length: 12 }).notNull(),
  transactionType: varchar("transaction_type", { length: 4 }).notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 6 }).notNull(),
  price: numeric("price", { precision: 14, scale: 4 }).notNull(),
  operationDate: date("operation_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("portfolio_transactions_user_idx").on(table.userId),
  index("portfolio_transactions_user_ticker_date_idx").on(table.userId, table.ticker, table.operationDate),
]);

export const investmentReports = pgTable("investment_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  ticker: varchar("ticker", { length: 12 }).notNull(),
  companyName: text("company_name").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
  price: numeric("price", { precision: 14, scale: 4 }).notNull(),
  changePercent: numeric("change_percent", { precision: 10, scale: 4 }).notNull(),
  signal: text("signal").notNull(),
  summary: text("summary").notNull(),
  strengths: jsonb("strengths").$type<string[]>().notNull(),
  risks: jsonb("risks").$type<string[]>().notNull(),
  outlook: text("outlook").notNull(),
  source: text("source").notNull(),
}, (table) => [
  index("investment_reports_user_ticker_idx").on(table.userId, table.ticker, desc(table.generatedAt)),
]);

export const reportDeliveryRequests = pgTable("report_delivery_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  ticker: varchar("ticker", { length: 12 }).notNull(),
  channel: varchar("channel", { length: 10 }).notNull(),
  contact: text("contact").notNull(),
  useRegisteredContact: boolean("use_registered_contact").notNull().default(false),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("report_delivery_requests_user_idx").on(table.userId, table.requestedAt),
]);
