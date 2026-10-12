ALTER TABLE report_delivery_requests
  ADD COLUMN IF NOT EXISTS confirmation_overdue_at timestamptz;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS report_delivery_requests_unconfirmed_idx
  ON report_delivery_requests(sent_at)
  WHERE status = 'sent' AND confirmation_overdue_at IS NULL;