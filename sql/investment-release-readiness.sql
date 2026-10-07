-- READ ONLY. Safe metadata inspection in development or production.
-- All rows must be ready before a release is approved. No account/client data.
WITH expected_functions(name, digest) AS (VALUES
  ('prevent_investment_review_changes', '0dddf10721235c2ccc76ea98db4ebcf7'),
  ('renew_investment_consultant_authorization', '71df38ab7630d24fd1fb8a5e73b48534')
), expected_triggers(name, relation, function_name, event_bits) AS (VALUES
  ('investment_review_immutable', 'investment_professional_reviews', 'prevent_investment_review_changes', 27),
  ('investment_assignment_audit_immutable', 'investment_assignment_audit', 'prevent_investment_review_changes', 27),
  ('investment_authorization_renewal', 'investment_consultant_authorizations', 'renew_investment_consultant_authorization', 19)
), checks AS (
  SELECT 'table:' || name AS control, to_regclass('public.' || name) IS NOT NULL AS ready
  FROM unnest(ARRAY['investment_professional_reviews','investment_consultant_authorizations',
    'investment_review_professional','investment_assignment_administrators',
    'investment_assignment_audit','investment_simulation_studies',
    'investment_reports','report_delivery_requests']) name
  UNION ALL
  SELECT 'function:' || e.name, EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
    WHERE p.oid=to_regprocedure('public.' || e.name || '()')
      AND p.prorettype='trigger'::regtype AND l.lanname='plpgsql'
      AND NOT p.prosecdef AND md5(p.prosrc)=e.digest
  ) FROM expected_functions e
  UNION ALL
  SELECT 'trigger:' || e.name, EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid=to_regclass('public.' || e.relation) AND t.tgname=e.name
      AND t.tgfoid=to_regprocedure('public.' || e.function_name || '()')
      AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')
      AND t.tgtype=e.event_bits AND t.tgqual IS NULL AND t.tgnargs=0
  ) FROM expected_triggers e
  UNION ALL
  SELECT 'index:' || name, EXISTS (
    SELECT 1 FROM pg_index i WHERE i.indexrelid=to_regclass('public.' || name)
      AND i.indisvalid AND i.indisready
      AND (name <> 'investment_simulation_request_idx' OR i.indisunique)
  ) FROM unnest(ARRAY['investment_simulation_request_idx','investment_simulation_history_idx',
    'investment_professional_reviews_context_idx','investment_assignment_audit_client_idx']) name
  UNION ALL
  SELECT 'fk:' || relation || '->' || target, EXISTS (
    SELECT 1 FROM pg_constraint c WHERE c.conrelid=to_regclass('public.' || relation)
      AND c.confrelid=to_regclass('public.' || target) AND c.contype='f'
      AND c.convalidated AND c.confdeltype='a' AND c.confupdtype='a'
  ) FROM (VALUES
    ('investment_professional_reviews','investment_reports'),
    ('investment_professional_reviews','investment_consultant_authorizations'),
    ('investment_assignment_audit','investment_consultant_authorizations'),
    ('report_delivery_requests','investment_professional_reviews')
  ) refs(relation,target)
)
SELECT control, ready FROM checks ORDER BY control;
