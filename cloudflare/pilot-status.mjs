import { createHash } from 'node:crypto';

const closed = { realAnalysisEnabled: false, costApprovalRequired: true, executable: false };
const json = (body, status = 200) => Response.json({ ...body, ...closed }, {
  status, headers: { 'Cache-Control': 'no-store' },
});

// Read-only migration verification. No grants, owner discovery, execution,
// budget creation, or implicit binding occur here.
export async function pilotMigrationStatus(request, env, services) {
  if (request.method !== 'GET') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  if (!env.INVEST_MIGRATION_ORIGIN || !env.PORTFOLIO_PILOT_PRODUCTION_OWNER_REFERENCE)
    return json({ error: 'MIGRATION_CONFIGURATION_REQUIRED' }, 503);
  const origin = env.INVEST_MIGRATION_ORIGIN;
  if (new URL(request.url).origin !== origin ||
      (request.headers.has('Origin') && request.headers.get('Origin') !== origin))
    return json({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
  try {
    const auth = await services.authenticate(request, env);
    if (!auth?.userId || !auth.sessionId) return json({ error: 'SIGN_IN_REQUIRED' }, 401);
    if (auth.userId !== env.PORTFOLIO_PILOT_PRODUCTION_OWNER_REFERENCE)
      return json({ error: 'OWNER_ONLY' }, 403);
    const session = await services.session(auth.sessionId, env);
    if (session.id !== auth.sessionId || session.userId !== auth.userId || session.status !== 'active')
      return json({ error: 'ACTIVE_SESSION_REQUIRED' }, 401);
    const user = await services.user(auth.userId, env);
    if (user.id !== auth.userId || !user.primaryEmailAddressId ||
        !user.emailAddresses.some(email => email.id === user.primaryEmailAddressId && email.verification?.status === 'verified'))
      return json({ error: 'VERIFIED_IDENTITY_REQUIRED' }, 403);
    const fingerprint = createHash('sha256').update(JSON.stringify({
      issuer: 'official_clerk_api', subject: auth.userId, environment: 'production',
      primaryEmailId: user.primaryEmailAddressId, emailVerified: true,
    })).digest('hex');
    const binding = await services.binding(auth.userId, fingerprint, env);
    return json({ authenticationReady: true, databaseReady: true,
      ownerBound: binding === true,
      migrationState: binding === true ? 'OWNER_VERIFIED_EXECUTION_BLOCKED' : 'OWNER_BINDING_NOT_RESTORED' });
  } catch {
    // SDK/database errors can contain credentials or identifiers: never relay/log them.
    return json({ error: 'MIGRATION_VERIFICATION_UNAVAILABLE', authenticationReady: false,
      databaseReady: false }, 503);
  }
}
