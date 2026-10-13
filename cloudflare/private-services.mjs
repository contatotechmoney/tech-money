import pg from 'pg';
import { createClerkClient } from '@clerk/backend';
import { supabaseDatabaseConfig } from './database-config.mjs';

function clerk(env) {
  if (!env.CLERK_SECRET_KEY?.startsWith('sk_live_') || !env.CLERK_PUBLISHABLE_KEY?.startsWith('pk_live_'))
    throw new Error('PRODUCTION_CLERK_CONFIGURATION_REQUIRED');
  return createClerkClient({ secretKey: env.CLERK_SECRET_KEY, publishableKey: env.CLERK_PUBLISHABLE_KEY });
}

export const privateServices = {
  async authenticate(request, env) {
    const state = await clerk(env).authenticateRequest(request, {
      acceptsToken: 'session_token', authorizedParties: [env.INVEST_MIGRATION_ORIGIN],
    });
    return state.isSignedIn ? state.toAuth() : null;
  },
  session(id, env) { return clerk(env).sessions.getSession(id); },
  user(id, env) { return clerk(env).users.getUser(id); },
  async binding(actor, fingerprint, env) {
    // Never share a socket/pool between Worker requests. No Replit fallback.
    const config = supabaseDatabaseConfig(env);
    const client = new pg.Client({ ...config, connectionTimeoutMillis: 5000,
      query_timeout: 5000, application_name: 'invest-migration-readonly' });
    try {
      await client.connect();
      await client.query('BEGIN READ ONLY');
      await client.query("SET LOCAL statement_timeout='5s'");
      const result = await client.query(`SELECT 1 FROM portfolio_pilot_owner_bindings b
        WHERE singleton=true AND clerk_user_id=$1 AND clerk_environment='production'
        AND revoked_at IS NULL AND verified_at <= now()
        AND verification_method='official_clerk_owner_attestation' AND evidence_digest=$2
        AND EXISTS (SELECT 1 FROM portfolio_pilot_accounts p WHERE p.user_id=b.clerk_user_id)
        AND EXISTS (SELECT 1 FROM portfolio_pilot_audit a WHERE a.user_id=b.clerk_user_id
          AND a.event->>'type'='identity_verified:production' AND a.event->>'fingerprint'=b.evidence_digest)
        AND EXISTS (SELECT 1 FROM portfolio_pilot_audit a WHERE a.user_id=b.clerk_user_id
          AND a.event->>'type'='owner_binding_confirmed:production')`, [actor, fingerprint]);
      await client.query('COMMIT');
      return result.rowCount === 1;
    } finally {
      await client.end();
    }
  },
};
