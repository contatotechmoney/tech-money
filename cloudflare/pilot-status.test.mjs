import test from 'node:test';
import assert from 'node:assert/strict';
import { pilotMigrationStatus } from './pilot-status.mjs';

const env = { INVEST_MIGRATION_ORIGIN: 'https://migration.example.test',
  PORTFOLIO_PILOT_PRODUCTION_OWNER_REFERENCE: 'user_synthetic_owner' };
const request = (options = {}) => new Request(env.INVEST_MIGRATION_ORIGIN + '/api/migration/pilot-status', options);
function services(overrides = {}) {
  return { authenticate: async () => ({ userId: 'user_synthetic_owner', sessionId: 'synthetic_session' }),
    session: async () => ({ id: 'synthetic_session', userId: 'user_synthetic_owner', status: 'active' }),
    user: async () => ({ id: 'user_synthetic_owner', primaryEmailAddressId: 'synthetic_email',
      emailAddresses: [{ id: 'synthetic_email', verification: { status: 'verified' } }] }),
    binding: async () => true, ...overrides };
}
test('configuration absent and writes cannot reach authentication or database', async () => {
  const unreachable = services({ authenticate: () => { throw new Error('should not run'); } });
  assert.equal((await pilotMigrationStatus(request(), {}, unreachable)).status, 503);
  assert.equal((await pilotMigrationStatus(request({ method: 'POST' }), env, unreachable)).status, 405);
});
test('untrusted origin is refused before services', async () => {
  const response = await pilotMigrationStatus(request({ headers: { Origin: 'https://evil.example' } }), env, services());
  assert.equal(response.status, 403);
});
test('anonymous and another owner cannot query the database', async () => {
  for (const auth of [null, { userId: 'user_other', sessionId: 'synthetic_session' }]) {
    let queried = false;
    const response = await pilotMigrationStatus(request(), env, services({ authenticate: async () => auth,
      binding: () => { queried = true; } }));
    assert.equal(response.status, auth ? 403 : 401);
    assert.equal(queried, false);
  }
});
test('revoked official session and unverified email block binding lookup', async () => {
  let queried = false;
  const binding = () => { queried = true; };
  assert.equal((await pilotMigrationStatus(request(), env, services({ binding,
    session: async () => ({ id: 'synthetic_session', userId: 'user_synthetic_owner', status: 'revoked' }) }))).status, 401);
  assert.equal((await pilotMigrationStatus(request(), env, services({ binding,
    user: async () => ({ id: 'user_synthetic_owner', primaryEmailAddressId: null, emailAddresses: [] }) }))).status, 403);
  assert.equal(queried, false);
});
test('missing restored binding is visible and cannot grant execution', async () => {
  const response = await pilotMigrationStatus(request(), env, services({ binding: async () => false }));
  const body = await response.json();
  assert.equal(body.ownerBound, false);
  assert.equal(body.migrationState, 'OWNER_BINDING_NOT_RESTORED');
  assert.equal(body.executable, false);
});
test('verified binding never bypasses cost approval or real-analysis block', async () => {
  const response = await pilotMigrationStatus(request(), env, services());
  const body = await response.json();
  assert.equal(body.ownerBound, true);
  assert.equal(body.realAnalysisEnabled, false);
  assert.equal(body.executable, false);
  assert.equal(body.costApprovalRequired, true);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(JSON.stringify(body).includes('synthetic_owner'), false);
});
test('database/SDK error messages never expose secrets', async () => {
  const response = await pilotMigrationStatus(request(), env, services({ binding: async () => {
    throw new Error('postgres://secret:password@private-host');
  } }));
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes('password'), false);
});
