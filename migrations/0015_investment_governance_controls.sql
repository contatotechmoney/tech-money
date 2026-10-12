-- Canonical development migration. NOT a production migration script or deploy hook.
-- Verify these objects before enabling reviews; table-only Publish does not prove
-- transport. Any documented manual production edit belongs to the human owner.
CREATE OR REPLACE FUNCTION prevent_investment_review_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Professional review history is append-only'; END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION renew_investment_consultant_authorization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL THEN
    NEW.granted_at = GREATEST(clock_timestamp(),OLD.granted_at + interval '1 microsecond');
    NEW.grant_id = gen_random_uuid();
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='investment_review_immutable' AND tgrelid='investment_professional_reviews'::regclass) THEN
    CREATE TRIGGER investment_review_immutable BEFORE UPDATE OR DELETE ON investment_professional_reviews
      FOR EACH ROW EXECUTE FUNCTION prevent_investment_review_changes();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='investment_assignment_audit_immutable' AND tgrelid='investment_assignment_audit'::regclass) THEN
    CREATE TRIGGER investment_assignment_audit_immutable BEFORE UPDATE OR DELETE ON investment_assignment_audit
      FOR EACH ROW EXECUTE FUNCTION prevent_investment_review_changes();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='investment_authorization_renewal' AND tgrelid='investment_consultant_authorizations'::regclass) THEN
    CREATE TRIGGER investment_authorization_renewal BEFORE UPDATE ON investment_consultant_authorizations
      FOR EACH ROW EXECUTE FUNCTION renew_investment_consultant_authorization();
  END IF;
END;
$$;
