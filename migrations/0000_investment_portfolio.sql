CREATE TABLE IF NOT EXISTS "portfolio_holdings" (
  "id" varchar PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "ticker" varchar(12) NOT NULL,
  "quantity" numeric(18, 6) NOT NULL,
  "average_price" numeric(14, 4) NOT NULL,
  "purchase_date" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "portfolio_holdings_user_id_ticker_key"
  ON "portfolio_holdings" USING btree ("user_id", "ticker");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_holdings_user_id_idx"
  ON "portfolio_holdings" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "investment_reports" (
  "id" varchar PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "ticker" varchar(12) NOT NULL,
  "company_name" text NOT NULL,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "price" numeric(14, 4) NOT NULL,
  "change_percent" numeric(10, 4) NOT NULL,
  "signal" text NOT NULL,
  "summary" text NOT NULL,
  "strengths" jsonb NOT NULL,
  "risks" jsonb NOT NULL,
  "outlook" text NOT NULL,
  "source" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investment_reports_user_ticker_idx"
  ON "investment_reports" USING btree ("user_id", "ticker", "generated_at" DESC);