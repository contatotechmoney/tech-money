-- Run only on original production database, with a reviewed production connection.
-- READ ONLY export of the sole active production binding and its original account/audit.
-- Result is private. Download securely; never paste into chat, logs or Git.
BEGIN READ ONLY;
SET LOCAL statement_timeout='5s';
WITH owner AS (
 SELECT * FROM portfolio_pilot_owner_bindings
 WHERE singleton=true AND clerk_environment='production' AND revoked_at IS NULL
 AND verification_method='official_clerk_owner_attestation'
), account AS (
 SELECT a.* FROM portfolio_pilot_accounts a JOIN owner b ON b.clerk_user_id=a.user_id
), audit AS (
 SELECT a.* FROM portfolio_pilot_audit a JOIN owner b ON b.clerk_user_id=a.user_id
)
SELECT jsonb_build_object(
 'format','invest-owner-transfer-v1',
 'binding',(SELECT to_jsonb(b) FROM owner b),
 'account',(SELECT to_jsonb(a) FROM account a),
 'audit',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY event_index) FROM audit a),'[]'::jsonb)
) AS private_owner_archive
WHERE (SELECT count(*) FROM owner)=1 AND (SELECT count(*) FROM account)=1;
COMMIT;
