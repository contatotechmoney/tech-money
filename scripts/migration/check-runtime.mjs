import assert from 'node:assert/strict';

// Only a local runtime may be tested by this script. Never probe production writes.
const base = 'http://127.0.0.1:19623';
const checks = [];
for (const [method, expected] of [['GET', 503], ['POST', 405]]) {
  const response = await fetch(base + '/api/migration/pilot-status', { method });
  assert.equal(response.status, expected);
  const body = await response.json();
  assert.equal(body.executable, false);
  assert.equal(body.realAnalysisEnabled, false);
  assert.equal(body.costApprovalRequired, true);
  checks.push({ path: '/api/migration/pilot-status', method, status: response.status });
}
for (const path of ['/api/migration/runtime', '/api/migration/health']) {
  const response = await fetch(base + path);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.realAnalysisEnabled, false);
  assert.equal(body.authenticationReady, false);
  assert.equal(body.databaseReady, false);
  checks.push({ path, status: response.status });
}
for (const path of ['/api/investments/agents/run', '/api/billing/checkout', '/api/__clerk', '/api/investments/portfolio/pilot/execute']) {
  for (const method of ['GET', 'POST']) {
    const response = await fetch(base + path, { method });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, path === '/api/__clerk' ? 'MIGRATION_AUTH_NOT_CONFIGURED' : 'MIGRATION_NOT_READY');
    checks.push({ path, method, status: response.status });
  }
}
assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
const page = await fetch(base + '/investments/portfolio/simulation');
assert.equal(page.status, 200);
assert.match(await page.text(), /<html/);
console.log(JSON.stringify({ runtime: 'workerd', passed: 14, checks }, null, 2));
