-- DEVELOPMENT ONLY. Reviewed additive preparation for the managed Publish schema diff.
-- Never run at server startup/build or against a production connection.
-- No account is promoted; existing documents, decisions and permissions are untouched.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS investment_consultant_authorizations (
  grant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  reviewer_id text NOT NULL,
  client_id text NOT NULL,
  granted_by text NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) >= 10),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (reviewer_id,client_id),
  CHECK (reviewer_id <> client_id)
);
ALTER TABLE investment_consultant_authorizations
  ADD COLUMN IF NOT EXISTS grant_id uuid NOT NULL DEFAULT gen_random_uuid();

CREATE TABLE IF NOT EXISTS investment_professional_reviews (
  id varchar PRIMARY KEY,
  reviewer_id text NOT NULL,
  client_id text NOT NULL,
  report_id varchar NOT NULL REFERENCES investment_reports(id),
  report_version varchar(64) NOT NULL,
  profile_version varchar(64) NOT NULL,
  decision varchar(8) NOT NULL CHECK (decision IN ('approved','rejected')),
  reason text NOT NULL CHECK (length(trim(reason)) >= 10),
  recommendation_text text,
  reviewed_at timestamptz NOT NULL,
  FOREIGN KEY (reviewer_id,client_id) REFERENCES investment_consultant_authorizations(reviewer_id,client_id),
  CHECK (decision <> 'approved' OR length(trim(recommendation_text)) >= 10)
);
CREATE INDEX IF NOT EXISTS investment_professional_reviews_context_idx
  ON investment_professional_reviews(client_id,report_id,reviewed_at DESC);

CREATE TABLE IF NOT EXISTS investment_assignment_administrators (
  user_id text PRIMARY KEY,
  provisioned_by text NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) >= 10),
  provisioned_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS investment_review_professional (
  reviewer_id text PRIMARY KEY,
  singleton boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton = true),
  credential_reference text NOT NULL CHECK (length(trim(credential_reference)) >= 10),
  verified_by text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz NOT NULL CHECK (valid_until > verified_at),
  revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS investment_assignment_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id text NOT NULL,
  reviewer_id text NOT NULL,
  client_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('grant','revoke')),
  reason text NOT NULL CHECK (length(trim(reason)) >= 10),
  grant_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  granted_at timestamptz NOT NULL,
  revoked_at timestamptz,
  credential_reference text,
  credential_valid_until timestamptz,
  CHECK (reviewer_id <> client_id),
  FOREIGN KEY (reviewer_id,client_id) REFERENCES investment_consultant_authorizations(reviewer_id,client_id)
);
CREATE INDEX IF NOT EXISTS investment_assignment_audit_client_idx
  ON investment_assignment_audit(client_id,occurred_at DESC,id);

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

ALTER TABLE investment_reports ADD COLUMN IF NOT EXISTS risk_score numeric(4,2);
ALTER TABLE investment_reports ADD COLUMN IF NOT EXISTS analysis_quality jsonb;
ALTER TABLE report_delivery_requests ADD COLUMN IF NOT EXISTS professional_review_id varchar REFERENCES investment_professional_reviews(id);

CREATE TABLE IF NOT EXISTS investment_simulation_studies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  request_key uuid NOT NULL,
  ticker varchar(12) NOT NULL CHECK (ticker IN ('BBDC3','BBAS3')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS investment_simulation_request_idx ON investment_simulation_studies(user_id,request_key);
CREATE INDEX IF NOT EXISTS investment_simulation_history_idx ON investment_simulation_studies(user_id,created_at DESC,id);
COMMIT;
