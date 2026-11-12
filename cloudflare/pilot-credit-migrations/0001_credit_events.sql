CREATE TABLE pilot_credit_events (
  sequence INTEGER PRIMARY KEY,
  account_key TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_json TEXT NOT NULL CHECK (json_valid(event_json)),
  prepaid_after INTEGER NOT NULL CHECK (prepaid_after BETWEEN 0 AND 1000000),
  monthly_after INTEGER NOT NULL CHECK (monthly_after BETWEEN 0 AND 1000),
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (account_key, event_id)
) STRICT;

CREATE INDEX pilot_credit_events_account_sequence ON pilot_credit_events(account_key, sequence DESC);
