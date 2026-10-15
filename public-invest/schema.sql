-- Additive, isolated interest capture. No user grants, budgets or analysis access.
BEGIN;
CREATE TABLE IF NOT EXISTS invest_interest_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK(length(name) BETWEEN 2 AND 120),
 email text NOT NULL CHECK(length(email) BETWEEN 3 AND 254),
 interest text NOT NULL CHECK(interest IN ('carteira','planejamento','conhecer')),
 contact_consent boolean NOT NULL CHECK(contact_consent=true),
 marketing_opt_in boolean NOT NULL DEFAULT false,
 notice_version text NOT NULL DEFAULT 'invest-interest-v1',
 is_test boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(email,is_test)
);
CREATE TABLE IF NOT EXISTS invest_interest_rate_limits (
 bucket text PRIMARY KEY,
 hits integer NOT NULL CHECK(hits>0),
 expires_at timestamptz NOT NULL
);
ALTER TABLE invest_interest_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE invest_interest_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON invest_interest_requests,invest_interest_rate_limits FROM PUBLIC,anon,authenticated;
COMMIT;
