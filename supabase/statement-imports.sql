-- Additive schema only. Does not enable import writes or real analysis.
BEGIN;
CREATE TABLE IF NOT EXISTS public.invest_statement_imports (
 id uuid PRIMARY KEY,
 user_id text NOT NULL,
 reviewer_subject uuid NOT NULL,
 statement_date date NOT NULL,
 fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
 position_count integer NOT NULL CHECK (position_count BETWEEN 1 AND 2000),
 payload jsonb NOT NULL,
 reviewed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,fingerprint)
);
ALTER TABLE public.invest_statement_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invest_statement_imports FROM PUBLIC,anon,authenticated;
COMMIT;
