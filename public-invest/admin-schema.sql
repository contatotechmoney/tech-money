-- Additive contact management only. Does not change identity or real-analysis permissions.
BEGIN;
ALTER TABLE invest_interest_requests ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','contatado','reuniao','proposta','concluido','arquivado'));
ALTER TABLE invest_interest_requests ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000);
ALTER TABLE invest_interest_requests ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;
ALTER TABLE invest_interest_requests ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS invest_interest_management_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), interest_id uuid NOT NULL REFERENCES invest_interest_requests(id), actor text NOT NULL, previous_status text NOT NULL, next_status text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE invest_interest_management_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON invest_interest_management_audit FROM PUBLIC,anon,authenticated;
COMMIT;
