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

ALTER TABLE public.invest_sandbox_billing_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invest_sandbox_billing_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invest_sandbox_billing_orders, public.invest_sandbox_billing_payments
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
