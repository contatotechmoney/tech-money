-- NEW EMPTY MIGRATION PROJECT ONLY. Not an incremental production migration.
-- Historical SQL includes internal table rebuilds: never run against existing data.
-- Apply only after isolated replay and verified backup/restore. No credentials or owner grants.
BEGIN;

-- Source: migrations/0000_investment_portfolio.sql; SHA256: 521891d6da22e771d0d3ca1654a5242145ed54b51661bb8cf773d949724d51bb
CREATE TABLE IF NOT EXISTS "portfolio_holdings" (
  "id" varchar PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "ticker" varchar(12) NOT NULL,
  "quantity" numeric(18, 6) NOT NULL,
  "average_price" numeric(14, 4) NOT NULL,
  "purchase_date" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "portfolio_holdings_user_id_ticker_key"
  ON "portfolio_holdings" USING btree ("user_id", "ticker");

CREATE INDEX IF NOT EXISTS "portfolio_holdings_user_id_idx"
  ON "portfolio_holdings" USING btree ("user_id");

CREATE TABLE IF NOT EXISTS "investment_reports" (
  "id" varchar PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "ticker" varchar(12) NOT NULL,
  "company_name" text NOT NULL,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "price" numeric(14, 4) NOT NULL,
  "change_percent" numeric(10, 4) NOT NULL,
  "signal" text NOT NULL,
  "summary" text NOT NULL,
  "strengths" jsonb NOT NULL,
  "risks" jsonb NOT NULL,
  "outlook" text NOT NULL,
  "source" text NOT NULL
);

CREATE INDEX IF NOT EXISTS "investment_reports_user_ticker_idx"
  ON "investment_reports" USING btree ("user_id", "ticker", "generated_at" DESC);

-- Source: migrations/0001_portfolio_transactions.sql; SHA256: a336a92582e7452d44950a706bbb510272f495648403f3b75756e581c4150bd2
CREATE TABLE IF NOT EXISTS "portfolio_transactions" (
  "id" varchar PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "ticker" varchar(12) NOT NULL,
  "transaction_type" varchar(4) NOT NULL,
  "quantity" numeric(18, 6) NOT NULL,
  "price" numeric(14, 4) NOT NULL,
  "operation_date" date NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "portfolio_transactions_type_check" CHECK ("transaction_type" IN ('buy', 'sell'))
);

CREATE INDEX IF NOT EXISTS "portfolio_transactions_user_idx"
  ON "portfolio_transactions" USING btree ("user_id");

CREATE INDEX IF NOT EXISTS "portfolio_transactions_user_ticker_date_idx"
  ON "portfolio_transactions" USING btree ("user_id", "ticker", "operation_date");

INSERT INTO "portfolio_transactions"
  ("id", "user_id", "ticker", "transaction_type", "quantity", "price", "operation_date")
SELECT gen_random_uuid(), h."user_id", h."ticker", 'buy', h."quantity", h."average_price",
       COALESCE(h."purchase_date", CURRENT_DATE)
FROM "portfolio_holdings" h
WHERE NOT EXISTS (
  SELECT 1 FROM "portfolio_transactions" t
  WHERE t."user_id" = h."user_id" AND t."ticker" = h."ticker"
);

-- Source: migrations/0002_fat_nighthawk.sql; SHA256: 56e1bb2027bb1ce9578d3a2296e17bc90193375bc9ade8812b07a01321964690
CREATE TABLE "report_delivery_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"ticker" varchar(12) NOT NULL,
	"channel" varchar(10) NOT NULL,
	"contact" text NOT NULL,
	"use_registered_contact" boolean DEFAULT false NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "report_delivery_requests_user_idx" ON "report_delivery_requests" USING btree ("user_id","requested_at");

-- Source: migrations/0003_suitability.sql; SHA256: 17772896b31579d76dceacd9f67813f74f2809f608cf4215d0ee7cec5560674b
CREATE TABLE "suitability_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"perfil" varchar(12) NOT NULL,
	"pontuacao_media" numeric(4, 2) NOT NULL,
	"respostas" jsonb NOT NULL,
	"data_avaliacao" timestamp with time zone DEFAULT now() NOT NULL,
	"data_proxima_reavaliacao" timestamp with time zone NOT NULL
);

CREATE INDEX "suitability_profiles_user_idx" ON "suitability_profiles" USING btree ("user_id","data_avaliacao");

CREATE TABLE "suitability_terms" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"ticker" varchar(12) NOT NULL,
	"tipo" varchar(20) NOT NULL,
	"divergencia" text NOT NULL,
	"assinado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "suitability_terms_user_ticker_idx" ON "suitability_terms" USING btree ("user_id","ticker");

-- Source: migrations/0004_suitability_term_context.sql; SHA256: 9144cac5517154c6f61a51539895859d1c3a20e3d2169822ec8f4c7d7cced147
ALTER TABLE "suitability_terms" ADD COLUMN "risco" numeric(4, 2) DEFAULT 0 NOT NULL;

ALTER TABLE "suitability_terms" ADD COLUMN "perfil_exigido" varchar(12) DEFAULT 'CONSERVADOR' NOT NULL;

ALTER TABLE "suitability_terms" ALTER COLUMN "risco" DROP DEFAULT;

ALTER TABLE "suitability_terms" ALTER COLUMN "perfil_exigido" DROP DEFAULT;

CREATE INDEX "suitability_terms_context_idx" ON "suitability_terms" USING btree ("user_id","ticker","tipo","risco","perfil_exigido","assinado_em");

-- Source: migrations/0005_report_risk_suitability_context.sql; SHA256: 8874614343fecfe9512a144c003480f8960d54d3910fc0f32fc04fbd063e03ce
ALTER TABLE "investment_reports" ADD COLUMN "risk_score" numeric(4, 2);

ALTER TABLE "suitability_terms" ADD COLUMN "report_id" varchar;

CREATE INDEX "suitability_terms_report_context_idx" ON "suitability_terms" USING btree ("user_id","ticker","report_id","assinado_em");

-- Source: migrations/0003_report_delivery_processing.sql; SHA256: 771f21d4d1682dca02025f21c1eaf8bf508d45dc1ebae9193029d3cb0bc11f38
ALTER TABLE "report_delivery_requests"
  ADD COLUMN "report_id" varchar,
  ADD COLUMN "provider_message_id" text,
  ADD COLUMN "attempt_count" numeric(5, 0) DEFAULT 0 NOT NULL,
  ADD COLUMN "error_code" varchar(80),
  ADD COLUMN "error_message" text,
  ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  ADD COLUMN "sent_at" timestamp with time zone,
  ADD COLUMN "delivered_at" timestamp with time zone;

UPDATE "report_delivery_requests" d
SET "report_id" = (
  SELECT "id"
  FROM "investment_reports"
  WHERE "user_id" = d."user_id" AND "ticker" = d."ticker"
  ORDER BY "generated_at" DESC
  LIMIT 1
)
WHERE d."report_id" IS NULL;

CREATE INDEX "report_delivery_requests_status_idx"
  ON "report_delivery_requests" USING btree ("status", "updated_at");

-- Source: migrations/0004_report_delivery_reliability.sql; SHA256: a80deedc90e039ab3380a729cc3ac89edb030f7dc528b6a3375f3a33f7881477
ALTER TABLE "report_delivery_requests"
  ADD COLUMN "idempotency_key" varchar(128),
  ADD COLUMN "processing_started_at" timestamp with time zone;

UPDATE "report_delivery_requests"
SET "idempotency_key" = "id"
WHERE "idempotency_key" IS NULL;

ALTER TABLE "report_delivery_requests"
  ALTER COLUMN "idempotency_key" SET NOT NULL;

ALTER TABLE "report_delivery_requests"
  ALTER COLUMN "report_id" DROP NOT NULL;

CREATE UNIQUE INDEX "report_delivery_requests_user_idempotency_key"
  ON "report_delivery_requests" USING btree ("user_id", "idempotency_key");

-- Source: migrations/0006_suitability_schema_recovery.sql; SHA256: 411e3a0c34cb33507923ff68efaf2c8d37b288f95ca989414b33e5c042858119
CREATE TABLE IF NOT EXISTS "suitability_profiles" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "perfil" varchar(12) NOT NULL,
  "pontuacao_media" numeric(4, 2) NOT NULL,
  "respostas" jsonb NOT NULL,
  "data_avaliacao" timestamp with time zone DEFAULT now() NOT NULL,
  "data_proxima_reavaliacao" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "suitability_profiles_user_idx"
  ON "suitability_profiles" USING btree ("user_id", "data_avaliacao");

CREATE TABLE IF NOT EXISTS "suitability_terms" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "ticker" varchar(12) NOT NULL,
  "tipo" varchar(20) NOT NULL,
  "divergencia" text NOT NULL,
  "assinado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "suitability_terms_user_ticker_idx"
  ON "suitability_terms" USING btree ("user_id", "ticker");

ALTER TABLE "suitability_terms"
  ADD COLUMN IF NOT EXISTS "risco" numeric(4, 2) DEFAULT 0 NOT NULL;

ALTER TABLE "suitability_terms"
  ADD COLUMN IF NOT EXISTS "perfil_exigido" varchar(12) DEFAULT 'CONSERVADOR' NOT NULL;

ALTER TABLE "suitability_terms"
  ALTER COLUMN "risco" DROP DEFAULT;

ALTER TABLE "suitability_terms"
  ALTER COLUMN "perfil_exigido" DROP DEFAULT;

CREATE INDEX IF NOT EXISTS "suitability_terms_context_idx"
  ON "suitability_terms" USING btree
  ("user_id", "ticker", "tipo", "risco", "perfil_exigido", "assinado_em");

ALTER TABLE "investment_reports"
  ADD COLUMN IF NOT EXISTS "risk_score" numeric(4, 2);

ALTER TABLE "suitability_terms"
  ADD COLUMN IF NOT EXISTS "report_id" varchar;

CREATE INDEX IF NOT EXISTS "suitability_terms_report_context_idx"
  ON "suitability_terms" USING btree ("user_id", "ticker", "report_id", "assinado_em");

-- Source: migrations/0007_report_delivery_provider_index.sql; SHA256: 97c7046d180671d5e0e8aa4c38c6b385288404d9a22ee0b5680d1adfb9e78655
CREATE INDEX "report_delivery_requests_provider_message_idx"
  ON "report_delivery_requests" USING btree ("provider_message_id");

-- Source: migrations/0008_report_analysis_quality.sql; SHA256: 503e782550af65526be42b096b78aca080428539492d1d09cf464f198fcc4a78
-- Add metadata only. Do not backfill, overwrite or approve historical reports.
ALTER TABLE investment_reports ADD COLUMN IF NOT EXISTS analysis_quality jsonb;

-- Source: migrations/0009_hermes_analysis_jobs.sql; SHA256: 01345b9f5af5cf955b7a04664bd86d873082d252c87b0248b8207cf0b69fa528
-- Separate informational runs from verified reports and personalized recommendations.
CREATE TABLE IF NOT EXISTS hermes_analysis_jobs (
  id uuid PRIMARY KEY,
  user_id text NOT NULL,
  idempotency_key uuid NOT NULL,
  ticker text NOT NULL,
  model_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('submitting', 'running', 'completed', 'failed')),
  run_id text,
  output text,
  runtime jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS hermes_analysis_one_active_per_user
  ON hermes_analysis_jobs(user_id) WHERE status IN ('submitting', 'running');

CREATE INDEX IF NOT EXISTS hermes_analysis_owner_history ON hermes_analysis_jobs(user_id, created_at DESC);


-- Source: migrations/0010_report_delivery_confirmation_alert.sql; SHA256: ff107ffb592f4f9a2deb4c44ade5710ec8f949bc447fb01867844e688ffcaf42
ALTER TABLE report_delivery_requests
  ADD COLUMN IF NOT EXISTS confirmation_overdue_at timestamptz;

CREATE INDEX IF NOT EXISTS report_delivery_requests_unconfirmed_idx
  ON report_delivery_requests(sent_at)
  WHERE status = 'sent' AND confirmation_overdue_at IS NULL;

-- Source: migrations/0011_investment_professional_review.sql; SHA256: f66dd6e7d4cfe0039bea914919589ed64cdff62926ccfd19ae2d81117d1f5091
CREATE TABLE investment_consultant_authorizations (
  reviewer_id text NOT NULL,
  client_id text NOT NULL,
  granted_by text NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) >= 10),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (reviewer_id, client_id),
  CHECK (reviewer_id <> client_id)
);

CREATE TABLE investment_professional_reviews (
  id varchar PRIMARY KEY,
  reviewer_id text NOT NULL,
  client_id text NOT NULL,
  report_id varchar NOT NULL REFERENCES investment_reports(id),
  report_version varchar(64) NOT NULL,
  profile_version varchar(64) NOT NULL,
  decision varchar(8) NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason text NOT NULL CHECK (length(trim(reason)) >= 10),
  recommendation_text text,
  reviewed_at timestamptz NOT NULL,
  FOREIGN KEY (reviewer_id, client_id) REFERENCES investment_consultant_authorizations(reviewer_id, client_id),
  CHECK (decision <> 'approved' OR length(trim(recommendation_text)) >= 10)
);

CREATE INDEX investment_professional_reviews_context_idx ON investment_professional_reviews(client_id, report_id, reviewed_at DESC);

ALTER TABLE report_delivery_requests ADD COLUMN professional_review_id varchar REFERENCES investment_professional_reviews(id);

CREATE FUNCTION prevent_investment_review_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Professional review history is append-only'; END;
$$;

CREATE TRIGGER investment_review_immutable BEFORE UPDATE OR DELETE ON investment_professional_reviews
FOR EACH ROW EXECUTE FUNCTION prevent_investment_review_changes();

CREATE FUNCTION renew_investment_consultant_authorization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL THEN
    NEW.granted_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER investment_authorization_renewal BEFORE UPDATE ON investment_consultant_authorizations
FOR EACH ROW EXECUTE FUNCTION renew_investment_consultant_authorization();

-- Source: migrations/0012_report_delivery_provider_events.sql; SHA256: 4c2c750ca85086c2c11b3bc000873b1da1140b5f9fcde392bf17d4ee83ac0c3a
CREATE TABLE report_delivery_provider_events (
  id bigserial PRIMARY KEY,
  channel varchar(16) NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  provider_message_id varchar(512) NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('sent', 'delivered', 'failed')),
  error_code varchar(128),
  error_message varchar(1000),
  received_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (channel, provider_message_id, status)
);

CREATE INDEX report_delivery_provider_events_received_idx
  ON report_delivery_provider_events (received_at);


-- Source: migrations/0013_investment_assignment_management.sql; SHA256: 1f354d002a0ff9baa43f26fa3809383ff451f6f5a9d001f9ca66d0a3d745e49b
-- Intentionally empty registries: no existing account is promoted.
CREATE TABLE investment_assignment_administrators (
  user_id text PRIMARY KEY,
  provisioned_by text NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) >= 10),
  provisioned_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

-- The module has one consultant (the owner), not a consultant team.
CREATE TABLE investment_review_professional (
  reviewer_id text PRIMARY KEY,
  singleton boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton),
  credential_reference text NOT NULL CHECK (length(trim(credential_reference)) >= 10),
  verified_by text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz NOT NULL CHECK (valid_until > verified_at),
  revoked_at timestamptz
);

ALTER TABLE investment_consultant_authorizations ADD COLUMN grant_id uuid NOT NULL DEFAULT gen_random_uuid();

CREATE TABLE investment_assignment_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id text NOT NULL,
  reviewer_id text NOT NULL,
  client_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('grant', 'revoke')),
  reason text NOT NULL CHECK (length(trim(reason)) >= 10),
  grant_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  granted_at timestamptz NOT NULL,
  revoked_at timestamptz,
  credential_reference text,
  credential_valid_until timestamptz,
  CHECK (reviewer_id <> client_id),
  FOREIGN KEY (reviewer_id, client_id) REFERENCES investment_consultant_authorizations(reviewer_id, client_id)
);

CREATE INDEX investment_assignment_audit_client_idx ON investment_assignment_audit(client_id, occurred_at DESC, id);

CREATE TRIGGER investment_assignment_audit_immutable BEFORE UPDATE OR DELETE ON investment_assignment_audit
FOR EACH ROW EXECUTE FUNCTION prevent_investment_review_changes();

CREATE OR REPLACE FUNCTION renew_investment_consultant_authorization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL THEN
    NEW.granted_at = GREATEST(clock_timestamp(), OLD.granted_at + interval '1 microsecond');
    NEW.grant_id = gen_random_uuid();
  END IF;
  RETURN NEW;
END;
$$;


-- Source: migrations/0014_investment_simulation.sql; SHA256: 37945a6dfa566047368075c0eb2b4d6b4ed6d4e9ca971bd16fdafdb12978f276
CREATE TABLE IF NOT EXISTS investment_simulation_studies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  request_key uuid NOT NULL,
  ticker varchar(12) NOT NULL CHECK (ticker IN ('BBDC3','BBAS3')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS investment_simulation_request_idx
  ON investment_simulation_studies(user_id,request_key);

CREATE INDEX IF NOT EXISTS investment_simulation_history_idx
  ON investment_simulation_studies(user_id,created_at DESC,id);


-- Source: migrations/0015_investment_governance_controls.sql; SHA256: 491b4c684ef2f765e97ec60755590576a43d0be830fc351808a3d28281d5b0f3
-- Canonical development migration. NOT a production migration script or deploy hook.
-- Verify these objects before enabling reviews; table-only Publish does not prove
-- transport. Any documented manual production edit belongs to the human owner.
CREATE OR REPLACE FUNCTION prevent_investment_review_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Professional review history is append-only'; END;
$$;

CREATE OR REPLACE FUNCTION renew_investment_consultant_authorization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL THEN
    NEW.granted_at = GREATEST(clock_timestamp(),OLD.granted_at + interval '1 microsecond');
    NEW.grant_id = gen_random_uuid();
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='investment_review_immutable' AND tgrelid='investment_professional_reviews'::regclass) THEN
    CREATE TRIGGER investment_review_immutable BEFORE UPDATE OR DELETE ON investment_professional_reviews
      FOR EACH ROW EXECUTE FUNCTION prevent_investment_review_changes();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='investment_assignment_audit_immutable' AND tgrelid='investment_assignment_audit'::regclass) THEN
    CREATE TRIGGER investment_assignment_audit_immutable BEFORE UPDATE OR DELETE ON investment_assignment_audit
      FOR EACH ROW EXECUTE FUNCTION prevent_investment_review_changes();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='investment_authorization_renewal' AND tgrelid='investment_consultant_authorizations'::regclass) THEN
    CREATE TRIGGER investment_authorization_renewal BEFORE UPDATE ON investment_consultant_authorizations
      FOR EACH ROW EXECUTE FUNCTION renew_investment_consultant_authorization();
  END IF;
END;
$$;


-- Source: migrations/0016_portfolio_simulation.sql; SHA256: 9058af9f0c7927cac0b68b3a1429e32806f227c093f580a23cd76d7b8a3e65e2
-- Additive and isolated. Do not change real holdings, reviews or the existing 21 governance controls.
CREATE TABLE IF NOT EXISTS portfolio_simulation_studies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  request_key uuid NOT NULL,
  scenario_version varchar(32) NOT NULL CONSTRAINT portfolio_simulation_scenario_check CHECK (scenario_version = 'portfolio-demo-v1'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS portfolio_simulation_request_idx
  ON portfolio_simulation_studies(user_id,request_key);

CREATE INDEX IF NOT EXISTS portfolio_simulation_history_idx
  ON portfolio_simulation_studies(user_id,created_at DESC,id);


-- Source: migrations/0017_portfolio_pilot.sql; SHA256: 70c3eb926c174c95d02d8f081dc91c8d4ccc71a2d6e417f0b617e9ae3e7d81a8
-- Additive only. No identity/model grants and no startup-time DDL.
CREATE TABLE IF NOT EXISTS portfolio_pilot_accounts (
  user_id text PRIMARY KEY,
  state jsonb NOT NULL DEFAULT '{"budgets":[],"events":[],"runs":[]}'::jsonb,
  revision integer NOT NULL DEFAULT 0 CONSTRAINT portfolio_pilot_revision_check CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portfolio_pilot_audit (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL REFERENCES portfolio_pilot_accounts(user_id),
  event_index integer NOT NULL CONSTRAINT portfolio_pilot_event_index_check CHECK (event_index >= 0),
  event jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, event_index)
);

CREATE TABLE IF NOT EXISTS portfolio_pilot_owner_bindings (
  singleton boolean PRIMARY KEY DEFAULT true CONSTRAINT portfolio_pilot_owner_singleton_check CHECK (singleton),
  clerk_user_id text NOT NULL,
  clerk_environment text NOT NULL CONSTRAINT portfolio_pilot_owner_environment_check CHECK (clerk_environment IN ('development','production')),
  evidence_digest text NOT NULL CONSTRAINT portfolio_pilot_owner_evidence_check CHECK (length(evidence_digest) = 64),
  verification_method text NOT NULL CONSTRAINT portfolio_pilot_owner_method_check CHECK (verification_method = 'official_clerk_owner_attestation'),
  verified_at timestamptz NOT NULL,
  revoked_at timestamptz
);


-- Source: migrations/0018_portfolio_pilot_singleton_publish_compat.sql; SHA256: f809e4531b64f25f05c2ddf8533154362f5e71d6d399f154e6e20fccc55d0c7f
-- Development migration only. Production receives the additive official publish diff.
-- Preserve the existing restriction atomically; do not change bindings or copy rows.
ALTER TABLE "public"."portfolio_pilot_owner_bindings"
  DROP CONSTRAINT "portfolio_pilot_owner_singleton_check",
  ADD CONSTRAINT "portfolio_pilot_owner_singleton_check" CHECK ("singleton" = true);

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
COMMIT;
