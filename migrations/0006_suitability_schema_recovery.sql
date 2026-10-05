CREATE TABLE IF NOT EXISTS "suitability_profiles" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "perfil" varchar(12) NOT NULL,
  "pontuacao_media" numeric(4, 2) NOT NULL,
  "respostas" jsonb NOT NULL,
  "data_avaliacao" timestamp with time zone DEFAULT now() NOT NULL,
  "data_proxima_reavaliacao" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suitability_profiles_user_idx"
  ON "suitability_profiles" USING btree ("user_id", "data_avaliacao");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "suitability_terms" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "ticker" varchar(12) NOT NULL,
  "tipo" varchar(20) NOT NULL,
  "divergencia" text NOT NULL,
  "assinado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suitability_terms_user_ticker_idx"
  ON "suitability_terms" USING btree ("user_id", "ticker");
--> statement-breakpoint
ALTER TABLE "suitability_terms"
  ADD COLUMN IF NOT EXISTS "risco" numeric(4, 2) DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "suitability_terms"
  ADD COLUMN IF NOT EXISTS "perfil_exigido" varchar(12) DEFAULT 'CONSERVADOR' NOT NULL;
--> statement-breakpoint
ALTER TABLE "suitability_terms"
  ALTER COLUMN "risco" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "suitability_terms"
  ALTER COLUMN "perfil_exigido" DROP DEFAULT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suitability_terms_context_idx"
  ON "suitability_terms" USING btree
  ("user_id", "ticker", "tipo", "risco", "perfil_exigido", "assinado_em");
--> statement-breakpoint
ALTER TABLE "investment_reports"
  ADD COLUMN IF NOT EXISTS "risk_score" numeric(4, 2);
--> statement-breakpoint
ALTER TABLE "suitability_terms"
  ADD COLUMN IF NOT EXISTS "report_id" varchar;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suitability_terms_report_context_idx"
  ON "suitability_terms" USING btree ("user_id", "ticker", "report_id", "assinado_em");