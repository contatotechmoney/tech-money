BEGIN;
CREATE TABLE IF NOT EXISTS invest_interest_notifications (
 interest_id uuid PRIMARY KEY REFERENCES invest_interest_requests(id),
 attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE invest_interest_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON invest_interest_notifications FROM PUBLIC,anon,authenticated;
COMMIT;
