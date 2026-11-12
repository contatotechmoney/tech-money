BEGIN;

CREATE TABLE IF NOT EXISTS public.invest_sandbox_billing_orders (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  offer_id text NOT NULL CHECK (offer_id IN ('avulso', 'essencial', 'avancado')),
  monthly boolean NOT NULL,
  credits integer NOT NULL CHECK (credits > 0),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  customer_id text NOT NULL,
  provider_id text UNIQUE,
  invoice_url text,
  state text NOT NULL DEFAULT 'creating'
    CHECK (state IN ('creating', 'pending', 'confirmed', 'revoked', 'failed', 'review')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS invest_sandbox_open_subscription
  ON public.invest_sandbox_billing_orders (account_id)
  WHERE monthly AND state <> 'failed';

CREATE UNIQUE INDEX IF NOT EXISTS invest_sandbox_open_top_up
  ON public.invest_sandbox_billing_orders (account_id)
  WHERE NOT monthly AND state IN ('creating', 'pending', 'review');

CREATE TABLE IF NOT EXISTS public.invest_sandbox_billing_payments (
  provider_payment_id text PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.invest_sandbox_billing_orders (id),
  due_date date NOT NULL,
  revoked boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invest_sandbox_credit_usage (
  account_id uuid NOT NULL,
  customer_id text NOT NULL,
  id uuid NOT NULL,
  units jsonb NOT NULL,
  monthly_payment_id text REFERENCES public.invest_sandbox_billing_payments (provider_payment_id),
  monthly_debit integer NOT NULL CHECK (monthly_debit >= 0),
  prepaid_debit integer NOT NULL CHECK (prepaid_debit >= 0),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, customer_id, id),
  CHECK (monthly_debit + prepaid_debit > 0),
  CHECK ((monthly_payment_id IS NOT NULL) = (monthly_debit > 0))
);

CREATE INDEX IF NOT EXISTS invest_sandbox_usage_history
  ON public.invest_sandbox_credit_usage (account_id, customer_id, recorded_at DESC, id);

ALTER TABLE public.invest_sandbox_billing_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invest_sandbox_billing_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invest_sandbox_credit_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invest_sandbox_billing_orders, public.invest_sandbox_billing_payments, public.invest_sandbox_credit_usage
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
