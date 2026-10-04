-- Separate informational runs from verified reports and personalized recommendations.
CREATE TABLE IF NOT EXISTS hermes_analysis_jobs (
  id uuid PRIMARY KEY,
  user_id text NOT NULL,
  idempotency_key uuid NOT NULL,
  ticker text NOT NULL,
  model_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('submitting', 'running', 'completed', 'failed')),
  run_id text,
  output text,
  runtime jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS hermes_analysis_one_active_per_user
  ON hermes_analysis_jobs(user_id) WHERE status IN ('submitting', 'running');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hermes_analysis_owner_history ON hermes_analysis_jobs(user_id, created_at DESC);
