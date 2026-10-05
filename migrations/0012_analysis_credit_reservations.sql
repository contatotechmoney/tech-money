CREATE TABLE analysis_credit_entries (
  id uuid PRIMARY KEY,
  user_id text NOT NULL,
  event_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('grant','reserve','consume','refund')),
  delta integer NOT NULL,
  job_id uuid REFERENCES hermes_analysis_jobs(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,event_key),
  CHECK ((kind IN ('grant','refund') AND delta > 0) OR (kind = 'reserve' AND delta < 0) OR (kind = 'consume' AND delta = 0))
);
--> statement-breakpoint
CREATE INDEX analysis_credit_owner_history ON analysis_credit_entries(user_id,created_at DESC);
--> statement-breakpoint
ALTER TABLE hermes_analysis_jobs ADD COLUMN credit_price integer NOT NULL DEFAULT 0 CHECK (credit_price >= 0);
--> statement-breakpoint
ALTER TABLE hermes_analysis_jobs ADD COLUMN cost_ceiling_micro_usd bigint NOT NULL DEFAULT 0 CHECK (cost_ceiling_micro_usd >= 0);
--> statement-breakpoint
ALTER TABLE hermes_analysis_jobs ADD COLUMN execution_fingerprint text NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE FUNCTION analysis_credit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Credit history is append-only'; END; $$;
--> statement-breakpoint
CREATE TRIGGER analysis_credit_immutable BEFORE UPDATE OR DELETE ON analysis_credit_entries
FOR EACH ROW EXECUTE FUNCTION analysis_credit_append_only();
