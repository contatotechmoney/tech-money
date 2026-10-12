-- Additive only. No identity/model grants and no startup-time DDL.
CREATE TABLE IF NOT EXISTS portfolio_pilot_accounts (
  user_id text PRIMARY KEY,
  state jsonb NOT NULL DEFAULT '{"budgets":[],"events":[],"runs":[]}'::jsonb,
  revision integer NOT NULL DEFAULT 0 CONSTRAINT portfolio_pilot_revision_check CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS portfolio_pilot_audit (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL REFERENCES portfolio_pilot_accounts(user_id),
  event_index integer NOT NULL CONSTRAINT portfolio_pilot_event_index_check CHECK (event_index >= 0),
  event jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, event_index)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS portfolio_pilot_owner_bindings (
  singleton boolean PRIMARY KEY DEFAULT true CONSTRAINT portfolio_pilot_owner_singleton_check CHECK (singleton),
  clerk_user_id text NOT NULL,
  clerk_environment text NOT NULL CONSTRAINT portfolio_pilot_owner_environment_check CHECK (clerk_environment IN ('development','production')),
  evidence_digest text NOT NULL CONSTRAINT portfolio_pilot_owner_evidence_check CHECK (length(evidence_digest) = 64),
  verification_method text NOT NULL CONSTRAINT portfolio_pilot_owner_method_check CHECK (verification_method = 'official_clerk_owner_attestation'),
  verified_at timestamptz NOT NULL,
  revoked_at timestamptz
);
