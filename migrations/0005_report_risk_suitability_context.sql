ALTER TABLE "investment_reports" ADD COLUMN "risk_score" numeric(4, 2);
--> statement-breakpoint
ALTER TABLE "suitability_terms" ADD COLUMN "report_id" varchar;
--> statement-breakpoint
CREATE INDEX "suitability_terms_report_context_idx" ON "suitability_terms" USING btree ("user_id","ticker","report_id","assinado_em");