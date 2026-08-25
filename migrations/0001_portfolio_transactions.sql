CREATE TABLE IF NOT EXISTS "portfolio_transactions" (
  "id" varchar PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "ticker" varchar(12) NOT NULL,
  "transaction_type" varchar(4) NOT NULL,
  "quantity" numeric(18, 6) NOT NULL,
  "price" numeric(14, 4) NOT NULL,
  "operation_date" date NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "portfolio_transactions_type_check" CHECK ("transaction_type" IN ('buy', 'sell'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_transactions_user_idx"
  ON "portfolio_transactions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_transactions_user_ticker_date_idx"
  ON "portfolio_transactions" USING btree ("user_id", "ticker", "operation_date");
--> statement-breakpoint
INSERT INTO "portfolio_transactions"
  ("id", "user_id", "ticker", "transaction_type", "quantity", "price", "operation_date")
SELECT gen_random_uuid(), h."user_id", h."ticker", 'buy', h."quantity", h."average_price",
       COALESCE(h."purchase_date", CURRENT_DATE)
FROM "portfolio_holdings" h
WHERE NOT EXISTS (
  SELECT 1 FROM "portfolio_transactions" t
  WHERE t."user_id" = h."user_id" AND t."ticker" = h."ticker"
);