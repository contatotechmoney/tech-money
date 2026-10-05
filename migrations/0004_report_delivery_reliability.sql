ALTER TABLE "report_delivery_requests"
  ADD COLUMN "idempotency_key" varchar(128),
  ADD COLUMN "processing_started_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "report_delivery_requests"
SET "idempotency_key" = "id"
WHERE "idempotency_key" IS NULL;
--> statement-breakpoint
ALTER TABLE "report_delivery_requests"
  ALTER COLUMN "idempotency_key" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "report_delivery_requests"
  ALTER COLUMN "report_id" DROP NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "report_delivery_requests_user_idempotency_key"
  ON "report_delivery_requests" USING btree ("user_id", "idempotency_key");