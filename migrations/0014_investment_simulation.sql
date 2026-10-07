CREATE TABLE IF NOT EXISTS investment_simulation_studies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  request_key uuid NOT NULL,
  ticker varchar(12) NOT NULL CHECK (ticker IN ('BBDC3','BBAS3')),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS investment_simulation_request_idx
  ON investment_simulation_studies(user_id,request_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS investment_simulation_history_idx
  ON investment_simulation_studies(user_id,created_at DESC,id);
