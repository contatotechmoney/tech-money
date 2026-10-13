// Supabase PostgreSQL must be server-only. Never accepts browser-supplied connection strings.
export const INVEST_SUPABASE_PROJECT = 'igxtlcbyucshupsldijj';
export function supabaseDatabaseConfig(bindings) {
  const value = bindings?.INVEST_DATABASE_URL;
  if (!value) throw new Error('INVEST_DATABASE_NOT_CONFIGURED');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('INVALID_DATABASE_PROTOCOL');
  const direct = url.hostname === `db.${INVEST_SUPABASE_PROJECT}.supabase.co`;
  const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname)
    && decodeURIComponent(url.username) === `postgres.${INVEST_SUPABASE_PROJECT}`;
  if (!direct && !pooler) throw new Error('WRONG_DATABASE_PROJECT');
  if (!url.password || !url.username || url.pathname !== '/postgres') throw new Error('INVALID_DATABASE_CREDENTIALS');
  if (url.searchParams.get('sslmode') !== 'verify-full') throw new Error('DATABASE_TLS_VERIFICATION_REQUIRED');
  return {connectionString: value, max: 2, ssl: {rejectUnauthorized: true}};
}
