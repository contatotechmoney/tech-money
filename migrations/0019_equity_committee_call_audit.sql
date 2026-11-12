-- Additive, applied separately from Worker deployment. No access for browser roles.
CREATE TABLE IF NOT EXISTS equity_committee_call_audit (
  user_id text NOT NULL,
  run_id uuid NOT NULL,
  quote_digest text NOT NULL CHECK (length(quote_digest) = 64),
  ticker text NOT NULL CHECK (ticker ~ '^[A-Z0-9]{1,12}$'),
  agent_id text NOT NULL,
  model_id text NOT NULL,
  price_version text NOT NULL CHECK (length(price_version) = 64),
  simulated boolean NOT NULL,
  status text NOT NULL CHECK (status IN ('reserved','usage_unknown','metered','limit_violation')),
  stage text GENERATED ALWAYS AS (CASE WHEN status = 'reserved' THEN 'reservation' ELSE 'result' END) STORED,
  input_limit integer NOT NULL CHECK (input_limit > 0),
  output_limit integer NOT NULL CHECK (output_limit > 0),
  max_usd_micros bigint NOT NULL CHECK (max_usd_micros >= 0),
  input_tokens integer,
  output_tokens integer,
  cost_usd_micros bigint,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, run_id, agent_id, stage),
  CHECK (
    (status IN ('reserved','usage_unknown') AND input_tokens IS NULL AND output_tokens IS NULL AND cost_usd_micros IS NULL)
    OR (status IN ('metered','limit_violation') AND input_tokens IS NOT NULL AND input_tokens > 0
      AND output_tokens IS NOT NULL AND output_tokens >= 0 AND cost_usd_micros IS NOT NULL AND cost_usd_micros >= 0)
  )
);

ALTER TABLE equity_committee_call_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON equity_committee_call_audit FROM PUBLIC, anon, authenticated;
