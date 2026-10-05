CREATE TABLE investment_consultant_authorizations (
  reviewer_id text NOT NULL,
  client_id text NOT NULL,
  granted_by text NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) >= 10),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (reviewer_id, client_id),
  CHECK (reviewer_id <> client_id)
);
--> statement-breakpoint
CREATE TABLE investment_professional_reviews (
  id varchar PRIMARY KEY,
  reviewer_id text NOT NULL,
  client_id text NOT NULL,
  report_id varchar NOT NULL REFERENCES investment_reports(id),
  report_version varchar(64) NOT NULL,
  profile_version varchar(64) NOT NULL,
  decision varchar(8) NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason text NOT NULL CHECK (length(trim(reason)) >= 10),
  recommendation_text text,
  reviewed_at timestamptz NOT NULL,
  FOREIGN KEY (reviewer_id, client_id) REFERENCES investment_consultant_authorizations(reviewer_id, client_id),
  CHECK (decision <> 'approved' OR length(trim(recommendation_text)) >= 10)
);
--> statement-breakpoint
CREATE INDEX investment_professional_reviews_context_idx ON investment_professional_reviews(client_id, report_id, reviewed_at DESC);
--> statement-breakpoint
ALTER TABLE report_delivery_requests ADD COLUMN professional_review_id varchar REFERENCES investment_professional_reviews(id);
--> statement-breakpoint
CREATE FUNCTION prevent_investment_review_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Professional review history is append-only'; END;
$$;
--> statement-breakpoint
CREATE TRIGGER investment_review_immutable BEFORE UPDATE OR DELETE ON investment_professional_reviews
FOR EACH ROW EXECUTE FUNCTION prevent_investment_review_changes();
--> statement-breakpoint
CREATE FUNCTION renew_investment_consultant_authorization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL THEN
    NEW.granted_at = now();
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER investment_authorization_renewal BEFORE UPDATE ON investment_consultant_authorizations
FOR EACH ROW EXECUTE FUNCTION renew_investment_consultant_authorization();