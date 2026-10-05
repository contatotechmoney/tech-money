-- Apply to the SAME Supabase project as Coop, using its SQL editor.
-- Separate records: inserting an Invest contact must never grant a Coop trial.
BEGIN;
CREATE TABLE IF NOT EXISTS public.techmoney_portal_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL UNIQUE CHECK (clerk_user_id ~ '^user_[A-Za-z0-9]+$'),
  email text NOT NULL UNIQUE CHECK (email = lower(trim(email)) AND length(email) <= 254),
  nome text NOT NULL CHECK (length(trim(nome)) BETWEEN 2 AND 120),
  origem text NOT NULL DEFAULT 'invest' CHECK (origem = 'invest'),
  registered_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  marketing_opt_in boolean NOT NULL DEFAULT false,
  marketing_consent_at timestamptz,
  marketing_consent_version text,
  CHECK ((marketing_opt_in AND marketing_consent_at IS NOT NULL AND marketing_consent_version IS NOT NULL)
    OR (NOT marketing_opt_in AND marketing_consent_at IS NULL AND marketing_consent_version IS NULL))
);
ALTER TABLE public.techmoney_portal_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.techmoney_portal_leads FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.techmoney_portal_lead_profile(p_clerk_user_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT jsonb_build_object('registered',true,'nome',l.nome,'marketing_opt_in',l.marketing_opt_in)
    FROM public.techmoney_portal_leads l WHERE l.clerk_user_id=p_clerk_user_id),
    jsonb_build_object('registered',false,'nome',NULL,'marketing_opt_in',false))
$$;
REVOKE ALL ON FUNCTION public.techmoney_portal_lead_profile(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.techmoney_portal_lead_profile(text) TO service_role;

CREATE OR REPLACE FUNCTION public.techmoney_capture_portal_lead(
  p_clerk_user_id text, p_email text, p_nome text, p_registered_at timestamptz, p_marketing_opt_in boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_email text := lower(trim(p_email));
BEGIN
  IF p_clerk_user_id IS NULL OR p_clerk_user_id !~ '^user_[A-Za-z0-9]+$'
    OR p_nome IS NULL OR length(trim(p_nome)) NOT BETWEEN 2 AND 120
    OR p_nome ~ '[[:cntrl:]]' OR p_email IS NULL OR length(v_email)>254
    OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR p_registered_at IS NULL OR p_registered_at > now()+interval '5 minutes'
    OR p_marketing_opt_in IS NULL THEN
    RAISE EXCEPTION 'Cadastro inválido' USING ERRCODE='22023';
  END IF;
  -- The trusted backend obtains these identifiers directly from Clerk.
  -- Same authenticated identity updates its profile; unique e-mail rejects
  -- binding another account to an existing contact without reconciliation.
  INSERT INTO public.techmoney_portal_leads(clerk_user_id,email,nome,registered_at,
    marketing_opt_in,marketing_consent_at,marketing_consent_version)
  VALUES(p_clerk_user_id,v_email,trim(p_nome),p_registered_at,p_marketing_opt_in,
    CASE WHEN p_marketing_opt_in THEN now() ELSE NULL END,
    CASE WHEN p_marketing_opt_in THEN 'invest-insights-v1' ELSE NULL END)
  ON CONFLICT(clerk_user_id) DO UPDATE SET
    email=EXCLUDED.email,nome=EXCLUDED.nome,updated_at=now(),
    marketing_opt_in=EXCLUDED.marketing_opt_in,
    marketing_consent_at=CASE
      WHEN NOT EXCLUDED.marketing_opt_in THEN NULL
      WHEN techmoney_portal_leads.marketing_opt_in THEN techmoney_portal_leads.marketing_consent_at
      ELSE EXCLUDED.marketing_consent_at END,
    marketing_consent_version=EXCLUDED.marketing_consent_version;
  RETURN public.techmoney_portal_lead_profile(p_clerk_user_id);
END $$;
REVOKE ALL ON FUNCTION public.techmoney_capture_portal_lead(text,text,text,timestamptz,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.techmoney_capture_portal_lead(text,text,text,timestamptz,boolean) TO service_role;

-- Administrative consolidated view. Same email is one contact with both origins.
-- Never expose this view to unauthenticated clients or use it to grant access.
CREATE OR REPLACE VIEW public.techmoney_leads_consolidados AS
SELECT coalesce(lower(trim(c.email)), i.email) AS email,
  coalesce(i.nome,c.nome) AS nome,
  array_remove(ARRAY[CASE WHEN c.email IS NOT NULL THEN 'coop' END,
    CASE WHEN i.email IS NOT NULL THEN i.origem END],NULL) AS origens,
  c.cooperativa, c.cargo, c.whatsapp,
  least(c.created_at,i.created_at) AS primeiro_cadastro,
  coalesce(i.marketing_opt_in,false) AS invest_marketing_opt_in
FROM public.leads c FULL JOIN public.techmoney_portal_leads i ON lower(trim(c.email))=i.email;
REVOKE ALL ON public.techmoney_leads_consolidados FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.techmoney_leads_consolidados TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
