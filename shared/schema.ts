import { desc, sql } from "drizzle-orm";
import { bigserial, boolean, check, date, foreignKey, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import type { AnalysisQuality } from "./report-quality";

export const investmentConsultantAuthorizations = pgTable("investment_consultant_authorizations", {
  grantId: uuid("grant_id").defaultRandom().notNull(),
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

export const investmentAssignmentAdministrators = pgTable("investment_assignment_administrators", {
  userId: text("user_id").primaryKey(),
  provisionedBy: text("provisioned_by").notNull(),
  reason: text("reason").notNull(),
  provisionedAt: timestamp("provisioned_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, t => [check("investment_assignment_administrators_reason_check", sql`length(trim(${t.reason})) >= 10`)]);

export const investmentReviewProfessional = pgTable("investment_review_professional", {
  reviewerId: text("reviewer_id").primaryKey(),
  singleton: boolean("singleton").default(true).notNull().unique(),
  credentialReference: text("credential_reference").notNull(),
  verifiedBy: text("verified_by").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).defaultNow().notNull(),
  validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, t => [
  check("investment_review_professional_singleton_check", sql`${t.singleton} = true`),
  check("investment_review_professional_credential_reference_check", sql`length(trim(${t.credentialReference})) >= 10`),
  check("investment_review_professional_check", sql`${t.validUntil} > ${t.verifiedAt}`),
]);

export const investmentAssignmentAudit = pgTable("investment_assignment_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: text("actor_id").notNull(),
  reviewerId: text("reviewer_id").notNull(),
  clientId: text("client_id").notNull(),
  action: text("action").notNull(),
  reason: text("reason").notNull(),
  grantId: uuid("grant_id").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).default(sql`clock_timestamp()`).notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  credentialReference: text("credential_reference"),
  credentialValidUntil: timestamp("credential_valid_until", { withTimezone: true }),
}, t => [
  index("investment_assignment_audit_client_idx").on(t.clientId, desc(t.occurredAt), t.id),
  check("investment_assignment_audit_action_check", sql`${t.action} IN ('grant', 'revoke')`),
  check("investment_assignment_audit_reason_check", sql`length(trim(${t.reason})) >= 10`),
  check("investment_assignment_audit_check", sql`${t.reviewerId} <> ${t.clientId}`),
  foreignKey({ columns: [t.reviewerId, t.clientId], foreignColumns: [investmentConsultantAuthorizations.reviewerId, investmentConsultantAuthorizations.clientId] }),
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

export const investmentSimulationStudies = pgTable("investment_simulation_studies", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  requestKey: uuid("request_key").notNull(),
  ticker: varchar("ticker", { length: 12 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [
  uniqueIndex("investment_simulation_request_idx").on(t.userId, t.requestKey),
  index("investment_simulation_history_idx").on(t.userId, desc(t.createdAt), t.id),
  check("investment_simulation_ticker_check", sql`${t.ticker} IN ('BBDC3','BBAS3')`),
]);

export const portfolioSimulationStudies = pgTable("portfolio_simulation_studies", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  requestKey: uuid("request_key").notNull(),
  scenarioVersion: varchar("scenario_version", { length: 32 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [
  uniqueIndex("portfolio_simulation_request_idx").on(t.userId, t.requestKey),
  index("portfolio_simulation_history_idx").on(t.userId, desc(t.createdAt), t.id),
  check("portfolio_simulation_scenario_check", sql`${t.scenarioVersion} = 'portfolio-demo-v1'`),
]);

export const portfolioPilotAccounts = pgTable("portfolio_pilot_accounts", {
  userId: text("user_id").primaryKey(),
  state: jsonb("state").notNull().default(sql`'{"budgets":[],"events":[],"runs":[]}'::jsonb`),
  revision: integer("revision").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [check("portfolio_pilot_revision_check", sql`${t.revision} >= 0`)]);
export const portfolioPilotAudit = pgTable("portfolio_pilot_audit", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: text("user_id").notNull().references(() => portfolioPilotAccounts.userId),
  eventIndex: integer("event_index").notNull(),
  event: jsonb("event").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("portfolio_pilot_audit_user_id_event_index_key").on(t.userId, t.eventIndex),
  check("portfolio_pilot_event_index_check", sql`${t.eventIndex} >= 0`),
]);
export const portfolioPilotOwnerBindings = pgTable("portfolio_pilot_owner_bindings", {
  singleton: boolean("singleton").primaryKey().default(true),
  clerkUserId: text("clerk_user_id").notNull(),
  clerkEnvironment: text("clerk_environment").notNull(),
  evidenceDigest: text("evidence_digest").notNull(),
  verificationMethod: text("verification_method").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, t => [
  check("portfolio_pilot_owner_singleton_check", sql`${t.singleton}`),
  check("portfolio_pilot_owner_environment_check", sql`${t.clerkEnvironment} IN ('development','production')`),
  check("portfolio_pilot_owner_evidence_check", sql`length(${t.evidenceDigest}) = 64`),
  check("portfolio_pilot_owner_method_check", sql`${t.verificationMethod} = 'official_clerk_owner_attestation'`),
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

export const reportDeliveryProviderEvents = pgTable("report_delivery_provider_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  channel: varchar("channel", { length: 16 }).notNull(),
  providerMessageId: varchar("provider_message_id", { length: 512 }).notNull(),
  status: varchar("status", { length: 16 }).notNull(),
  errorCode: varchar("error_code", { length: 128 }),
  errorMessage: varchar("error_message", { length: 1000 }),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("report_delivery_provider_events_channel_provider_message_id_status_key")
    .on(table.channel, table.providerMessageId, table.status),
  index("report_delivery_provider_events_received_idx").on(table.receivedAt),
  check("report_delivery_provider_events_channel_check", sql`${table.channel} IN ('email', 'whatsapp')`),
  check("report_delivery_provider_events_status_check", sql`${table.status} IN ('sent', 'delivered', 'failed')`),
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
