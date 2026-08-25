CREATE TABLE "report_delivery_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"ticker" varchar(12) NOT NULL,
	"channel" varchar(10) NOT NULL,
	"contact" text NOT NULL,
	"use_registered_contact" boolean DEFAULT false NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "report_delivery_requests_user_idx" ON "report_delivery_requests" USING btree ("user_id","requested_at");