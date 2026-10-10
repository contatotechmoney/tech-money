-- DEVELOPMENT ONLY. Synthetic fixtures in a single transaction; all rows roll back.
-- No production target, provider, customer lookup, email or durable permission change.
BEGIN;
DO $$
DECLARE
  report_key varchar := gen_random_uuid()::text;
  reviewer text := '__schema_reviewer_' || report_key;
  client text := '__schema_client_' || report_key;
  old_grant uuid;
  new_grant uuid;
  audit_key uuid := gen_random_uuid();
  study_key uuid := gen_random_uuid();
BEGIN
  INSERT INTO investment_reports(id,user_id,ticker,company_name,price,change_percent,signal,summary,strengths,risks,outlook,source)
    VALUES(report_key,client,'BBDC3','Fixture sintética',0,0,'Pendente','Fixture sintética','[]','[]','Pendente','synthetic-validation');
  INSERT INTO investment_consultant_authorizations(reviewer_id,client_id,granted_by,reason)
    VALUES(reviewer,client,'synthetic-validation','Autorização fictícia de teste')
    RETURNING grant_id INTO old_grant;
  BEGIN
    INSERT INTO investment_consultant_authorizations(reviewer_id,client_id,granted_by,reason)
      VALUES(reviewer,reviewer,'synthetic-validation','Autoatribuição fictícia');
    RAISE EXCEPTION 'Self-assignment must fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO investment_professional_reviews(id,reviewer_id,client_id,report_id,report_version,profile_version,decision,reason,reviewed_at)
    VALUES(report_key,reviewer,client,report_key,repeat('a',64),repeat('b',64),'rejected','Documento fictício rejeitado',clock_timestamp());
  BEGIN
    UPDATE investment_professional_reviews SET reason='Alteração não permitida' WHERE id=report_key;
    RAISE EXCEPTION 'Review immutability missing';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Professional review history is append-only' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM investment_professional_reviews WHERE id=report_key;
    RAISE EXCEPTION 'Review delete protection missing';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Professional review history is append-only' THEN RAISE; END IF;
  END;
  INSERT INTO investment_assignment_audit(id,actor_id,reviewer_id,client_id,action,reason,grant_id,granted_at)
    VALUES(audit_key,'synthetic-validation',reviewer,client,'grant','Evento fictício de teste',old_grant,clock_timestamp());
  BEGIN
    UPDATE investment_assignment_audit SET reason='Alteração não permitida' WHERE id=audit_key;
    RAISE EXCEPTION 'Assignment audit immutability missing';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Professional review history is append-only' THEN RAISE; END IF;
  END;
  UPDATE investment_consultant_authorizations SET revoked_at=clock_timestamp() WHERE reviewer_id=reviewer AND client_id=client;
  UPDATE investment_consultant_authorizations SET revoked_at=NULL WHERE reviewer_id=reviewer AND client_id=client
    RETURNING grant_id INTO new_grant;
  IF new_grant=old_grant THEN RAISE EXCEPTION 'Renewal must invalidate the previous grant version'; END IF;
  INSERT INTO investment_simulation_studies(user_id,request_key,ticker) VALUES(client,study_key,'BBDC3');
  BEGIN
    INSERT INTO investment_simulation_studies(user_id,request_key,ticker) VALUES(client,study_key,'BBDC3');
    RAISE EXCEPTION 'Same-user duplicate request must fail';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  INSERT INTO investment_simulation_studies(user_id,request_key,ticker) VALUES(reviewer,study_key,'BBAS3');
  BEGIN
    INSERT INTO investment_simulation_studies(user_id,request_key,ticker) VALUES(client,gen_random_uuid(),'INVALID');
    RAISE EXCEPTION 'Unsupported simulation ticker must fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;
ROLLBACK;
SELECT count(*) AS persistent_fixture_grants FROM investment_consultant_authorizations WHERE reviewer_id LIKE '__schema_reviewer_%';
SELECT count(*) AS persistent_fixture_studies FROM investment_simulation_studies WHERE user_id LIKE '__schema_client_%' OR user_id LIKE '__schema_reviewer_%';
