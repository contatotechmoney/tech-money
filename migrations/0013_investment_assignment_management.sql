-- Intentionally empty registries: no existing account is promoted.
CREATE TABLE investment_assignment_administrators (
  user_id text PRIMARY KEY,
  provisioned_by text NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) >= 10),
  provisioned_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE investment_consultant_authorizations ADD COLUMN grant_id uuid NOT NULL DEFAULT gen_random_uuid();
--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX investment_assignment_audit_client_idx ON investment_assignment_audit(client_id, occurred_at DESC, id);
--> statement-breakpoint
CREATE TRIGGER investment_assignment_audit_immutable BEFORE UPDATE OR DELETE ON investment_assignment_audit
FOR EACH ROW EXECUTE FUNCTION prevent_investment_review_changes();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION renew_investment_consultant_authorization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL THEN
    NEW.granted_at = GREATEST(clock_timestamp(), OLD.granted_at + interval '1 microsecond');
    NEW.grant_id = gen_random_uuid();
  END IF;
  RETURN NEW;
END;
$$;
