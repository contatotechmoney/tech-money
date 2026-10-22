-- Separate mapping only. Never rewrite Clerk subjects, original audit, budgets or approvals.
BEGIN;
CREATE TABLE IF NOT EXISTS invest_auth_identity_links (
 legacy_user_id text PRIMARY KEY REFERENCES portfolio_pilot_accounts(user_id),
 supabase_user_id uuid NOT NULL UNIQUE,
 verified_email text NOT NULL,
 linked_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS invest_auth_migration_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 legacy_user_id text NOT NULL REFERENCES portfolio_pilot_accounts(user_id),
 supabase_user_id uuid NOT NULL,
 event text NOT NULL CHECK(event='verified_owner_link_confirmed'),
 recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE invest_auth_identity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE invest_auth_migration_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON invest_auth_identity_links,invest_auth_migration_audit FROM PUBLIC,anon,authenticated;
COMMIT;
