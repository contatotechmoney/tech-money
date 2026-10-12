CREATE INDEX "report_delivery_requests_provider_message_idx"
  ON "report_delivery_requests" USING btree ("provider_message_id");