import { desc, sql } from "drizzle-orm";
import { boolean, check, date, foreignKey, index, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import type { AnalysisQuality } from "./report-quality";

export const investmentConsultantAuthorizations = pgTable("investment_consultant_authorizations", {
  reviewerId: text("reviewer_id").notNull(),
  clientId: text("client_id").notNull(),
  grantedBy: text("granted_by").notNull(),
  reason: text("reason").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, table => [
  primaryKey({ columns: [table.reviewerId, table.clientId] }),
  check("investment_consultant_authorizations_check", sql`${table.reviewerId} <> ${table.clientId}`),
  check("investment_consultant_authorizations_reason_check", sql`length(trim(${table.reason})) >= 10`),
]);

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
  riskScore: numeric("risk_score", { precision: 4, scale: 2 }),
  outlook: text("outlook").notNull(),
  source: text("source").notNull(),
  analysisQuality: jsonb("analysis_quality").$type<AnalysisQuality>(),
}, (table) => [
  index("investment_reports_user_ticker_idx").on(table.userId, table.ticker, desc(table.generatedAt)),
]);

export const investmentProfessionalReviews = pgTable("investment_professional_reviews", {
  id: varchar("id").primaryKey(),
  reviewerId: text("reviewer_id").notNull(),
  clientId: text("client_id").notNull(),
  reportId: varchar("report_id").notNull().references(() => investmentReports.id),
  reportVersion: varchar("report_version", { length: 64 }).notNull(),
  profileVersion: varchar("profile_version", { length: 64 }).notNull(),
  decision: varchar("decision", { length: 8 }).notNull(),
  reason: text("reason").notNull(),
  recommendationText: text("recommendation_text"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull(),
}, table => [
  index("investment_professional_reviews_context_idx").on(table.clientId, table.reportId, desc(table.reviewedAt)),
  foreignKey({ columns: [table.reviewerId, table.clientId], foreignColumns: [investmentConsultantAuthorizations.reviewerId, investmentConsultantAuthorizations.clientId] }),
  check("investment_professional_reviews_decision_check", sql`${table.decision} IN ('approved', 'rejected')`),
  check("investment_professional_reviews_reason_check", sql`length(trim(${table.reason})) >= 10`),
  check("investment_professional_reviews_check", sql`${table.decision} <> 'approved' OR length(trim(${table.recommendationText})) >= 10`),
]);

export const reportDeliveryRequests = pgTable("report_delivery_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  reportId: varchar("report_id"),
  professionalReviewId: varchar("professional_review_id").references(() => investmentProfessionalReviews.id),
  idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
  ticker: varchar("ticker", { length: 12 }).notNull(),
  channel: varchar("channel", { length: 10 }).notNull(),
  contact: text("contact").notNull(),
  useRegisteredContact: boolean("use_registered_contact").notNull().default(false),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  providerMessageId: text("provider_message_id"),
  attemptCount: numeric("attempt_count", { precision: 5, scale: 0 }).notNull().default("0"),
  errorCode: varchar("error_code", { length: 80 }),
  errorMessage: text("error_message"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  confirmationOverdueAt: timestamp("confirmation_overdue_at", { withTimezone: true }),
}, (table) => [
  index("report_delivery_requests_user_idx").on(table.userId, table.requestedAt),
  index("report_delivery_requests_status_idx").on(table.status, table.updatedAt),
  index("report_delivery_requests_provider_message_idx").on(table.providerMessageId),
  index("report_delivery_requests_unconfirmed_idx").on(table.sentAt)
    .where(sql`${table.status} = 'sent' AND ${table.confirmationOverdueAt} IS NULL`),
  uniqueIndex("report_delivery_requests_user_idempotency_key").on(table.userId, table.idempotencyKey),
]);

export const suitabilityProfiles = pgTable("suitability_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  perfil: varchar("perfil", { length: 12 }).notNull(),
  pontuacaoMedia: numeric("pontuacao_media", { precision: 4, scale: 2 }).notNull(),
  respostas: jsonb("respostas").$type<Record<string, number>>().notNull(),
  dataAvaliacao: timestamp("data_avaliacao", { withTimezone: true }).defaultNow().notNull(),
  dataProximaReavaliacao: timestamp("data_proxima_reavaliacao", { withTimezone: true }).notNull(),
}, (table) => [
  index("suitability_profiles_user_idx").on(table.userId, table.dataAvaliacao),
]);

export const suitabilityTerms = pgTable("suitability_terms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  ticker: varchar("ticker", { length: 12 }).notNull(),
  tipo: varchar("tipo", { length: 20 }).notNull(),
  reportId: varchar("report_id"),
  risco: numeric("risco", { precision: 4, scale: 2 }).notNull(),
  perfilExigido: varchar("perfil_exigido", { length: 12 }).notNull(),
  divergencia: text("divergencia").notNull(),
  assinadoEm: timestamp("assinado_em", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("suitability_terms_user_ticker_idx").on(table.userId, table.ticker),
  index("suitability_terms_context_idx").on(
    table.userId,
    table.ticker,
    table.tipo,
    table.risco,
    table.perfilExigido,
    table.assinadoEm,
  ),
]);
