CREATE TABLE report_delivery_provider_events (
  id bigserial PRIMARY KEY,
  channel varchar(16) NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  provider_message_id varchar(512) NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('sent', 'delivered', 'failed')),
  error_code varchar(128),
  error_message varchar(1000),
  received_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (channel, provider_message_id, status)
);
--> statement-breakpoint
CREATE INDEX report_delivery_provider_events_received_idx
  ON report_delivery_provider_events (received_at);
