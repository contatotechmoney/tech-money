ALTER TABLE "report_delivery_requests"
  ADD COLUMN "report_id" varchar,
  ADD COLUMN "provider_message_id" text,
  ADD COLUMN "attempt_count" numeric(5, 0) DEFAULT 0 NOT NULL,
  ADD COLUMN "error_code" varchar(80),
  ADD COLUMN "error_message" text,
  ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  ADD COLUMN "sent_at" timestamp with time zone,
  ADD COLUMN "delivered_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "report_delivery_requests" d
SET "report_id" = (
  SELECT "id"
  FROM "investment_reports"
  WHERE "user_id" = d."user_id" AND "ticker" = d."ticker"
  ORDER BY "generated_at" DESC
  LIMIT 1
)
WHERE d."report_id" IS NULL;
--> statement-breakpoint
CREATE INDEX "report_delivery_requests_status_idx"
  ON "report_delivery_requests" USING btree ("status", "updated_at");