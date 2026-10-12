-- Additive and isolated. Do not change real holdings, reviews or the existing 21 governance controls.
CREATE TABLE IF NOT EXISTS portfolio_simulation_studies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  request_key uuid NOT NULL,
  scenario_version varchar(32) NOT NULL CONSTRAINT portfolio_simulation_scenario_check CHECK (scenario_version = 'portfolio-demo-v1'),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS portfolio_simulation_request_idx
  ON portfolio_simulation_studies(user_id,request_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS portfolio_simulation_history_idx
  ON portfolio_simulation_studies(user_id,created_at DESC,id);
