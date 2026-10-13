import test from 'node:test';
import assert from 'node:assert/strict';
import { migrationClerkProxy } from './clerk-proxy.mjs';
const env = { CLERK_SECRET_KEY: 'sk_live_synthetic', CLERK_PUBLISHABLE_KEY: 'pk_live_synthetic',
  INVEST_MIGRATION_ORIGIN: 'https://migration.example.test' };
const request = (url = env.INVEST_MIGRATION_ORIGIN + '/api/__clerk/v1/environment', headers = {}) => new Request(url, { headers });
test('missing production configuration never transmits to Clerk', async () => {
  let called = false;
  const response = await migrationClerkProxy(request(), {}, () => { called = true; });
  assert.equal(response.status, 503); assert.equal(called, false);
});
test('foreign hosts, forged origins and plaintext configuration cannot send the secret', async () => {
  let called = false;
  const upstream = () => { called = true; };
  for (const req of [request('https://evil.example/api/__clerk/v1/environment'),
    request(undefined, { Origin: 'https://evil.example' })])
    assert.equal((await migrationClerkProxy(req, env, upstream)).status, 403);
  assert.equal((await migrationClerkProxy(request(), { ...env, INVEST_MIGRATION_ORIGIN: 'http://migration.example.test' }, upstream)).status, 403);
  assert.equal(called, false);
});
test('upstream destination and proxy identity cannot be supplied by the browser', async () => {
  const response = await migrationClerkProxy(request(undefined, {
    'Clerk-Secret-Key': 'attacker', 'Clerk-Proxy-Url': 'https://evil.example',
    'X-Forwarded-Host': 'evil.example', 'X-Forwarded-For': 'attacker',
  }), env, async (url, options) => {
    assert.equal(url, 'https://frontend-api.clerk.dev/v1/environment');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.get('Clerk-Secret-Key'), env.CLERK_SECRET_KEY);
    assert.equal(options.headers.get('Clerk-Proxy-Url'), env.INVEST_MIGRATION_ORIGIN + '/api/__clerk');
    assert.equal(options.headers.has('X-Forwarded-Host'), false);
    assert.equal(options.headers.has('X-Forwarded-For'), false);
    return new Response('{}', { headers: { 'Clerk-Secret-Key': 'do-not-return' } });
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.has('Clerk-Secret-Key'), false);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
