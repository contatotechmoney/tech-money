import assert from "node:assert/strict";
import test from "node:test";
import { customerPilotResponse } from "./customer-pilot.mjs";
import { OWNER_SUPABASE_PROJECT_URL } from "./identity.mjs";

const origin = "https://invest-customer-pilot.techmoney.workers.dev";
const project = "https://demoabcdefghijklmnop.supabase.co";
const email = "convidado@example.invalid";
const cookieName = "__Host-invest-customer-pilot";
const token = "fixture.header.verified_token";
const denyProvider = () => assert.fail("Unexpected provider call");
const env = {
  INVEST_PORTAL_MODE: "customer-pilot",
  INVEST_CUSTOMER_PILOT_ORIGIN: origin,
  INVEST_CUSTOMER_PILOT_SUPABASE_URL: project,
  INVEST_CUSTOMER_PILOT_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
  INVEST_CUSTOMER_PILOT_EMAILS: ` ${email.toUpperCase()} ,second@example.invalid`,
  INVEST_CUSTOMER_PILOT_RATE: { limit: async () => ({ success: true }) },
  INVEST_CUSTOMER_PILOT_RATE_KEY: "only-a-fixture-key-for-tests-over-32-chars",
};
const user = { id: "e5b98144-fc85-48ca-8815-ced8543a9839", email, role: "authenticated", email_confirmed_at: "2026-01-01T00:00:00Z" };
const session = "/api/migration/session";
const auth = path => "/api/migration/customer-pilot/" + path;
const read = (path, cookie, target = origin) => new Request(target + path, { headers: cookie ? { Cookie: cookie } : {} });
const post = (path, body, caller = origin) => new Request(origin + auth(path), { method: "POST",
  headers: { Origin: caller, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.1" }, body: JSON.stringify(body) });

test("pilot is available only on the dedicated HTTPS Worker with a separate Supabase project", async () => {
  assert.equal(await customerPilotResponse(read(session), { ...env, INVEST_PORTAL_MODE: "owner-production" }, denyProvider), null);
  assert.equal((await customerPilotResponse(read("/piloto/entrar"), { ...env, INVEST_PORTAL_MODE: "owner-production" }, denyProvider)).status, 404);
  for (const settings of [
    { INVEST_CUSTOMER_PILOT_SUPABASE_URL: OWNER_SUPABASE_PROJECT_URL },
    { INVEST_SUPABASE_URL: project },
    { INVEST_CUSTOMER_PILOT_ORIGIN: "https://invest.techmoney.com.br" },
    { INVEST_MIGRATION_ORIGIN: origin },
    { INVEST_CUSTOMER_PILOT_RATE: undefined },
  ]) assert.equal((await customerPilotResponse(read(session), { ...env, ...settings }, denyProvider)).status, 503);
  assert.equal((await customerPilotResponse(read(session, "", "https://invest.techmoney.com.br"), env, denyProvider)).status, 503);
  const root = await customerPilotResponse(read("/"), env, denyProvider);
  assert.equal(root.headers.get("Location"), "/piloto/entrar");
  const page = await customerPilotResponse(read("/piloto/entrar"), env, denyProvider);
  assert.match(await page.text(), /Entre no piloto do Invest/);
  assert.match(page.headers.get("Content-Security-Policy"), /frame-ancestors 'none'/);
});

test("only invited email requests reach Supabase and the request cannot create accounts", async () => {
  const seen = [];
  const keys = [];
  const settings = { ...env, INVEST_CUSTOMER_PILOT_RATE: { limit: async ({ key }) => {
    keys.push(key); return { success: true };
  } } };
  const provider = async (url, options) => {
    seen.push([url, JSON.parse(options.body)]);
    assert.equal(options.redirect, "manual");
    assert.equal(options.headers.apikey, env.INVEST_CUSTOMER_PILOT_SUPABASE_PUBLISHABLE_KEY);
    return Response.json({ private: "error from provider" }, { status: 400 });
  };
  const denied = await customerPilotResponse(post("request-code", { email: "uninvited@example.invalid" }), settings, provider);
  const invited = await customerPilotResponse(post("request-code", { email: email.toUpperCase() }), settings, provider);
  assert.equal(denied.status, 202);
  assert.equal(invited.status, 202);
  assert.deepEqual(await denied.json(), await invited.json());
  assert.deepEqual(seen, [[project + "/auth/v1/otp", { email, create_user: false }]]);
  assert.equal(keys.length, 4);
  assert.ok(keys.every(key => /^[a-f\d]{64}$/.test(key)));
  assert.equal(keys[1], keys[3]);
});

test("cross-origin requests, malformed bodies, non-invited users, and throttled attempts cannot authenticate", async () => {
  assert.equal((await customerPilotResponse(post("request-code", { email }, "https://evil.invalid"), env, denyProvider)).status, 403);
  assert.equal((await customerPilotResponse(post("verify-code", { email, code: "bad" }), env, denyProvider)).status, 400);
  assert.equal((await customerPilotResponse(post("verify-code", { email, code: "123456", role: "owner" }), env, denyProvider)).status, 400);
  assert.equal((await customerPilotResponse(post("verify-code", { email: "other@example.invalid", code: "123456" }), env, denyProvider)).status, 401);
  const limited = { ...env, INVEST_CUSTOMER_PILOT_RATE: { limit: async () => ({ success: false }) } };
  assert.equal((await customerPilotResponse(post("request-code", { email }), limited, denyProvider)).status, 429);
});

test("valid code opens a private pilot session with only demonstration privileges", async () => {
  let verified = 0;
  const provider = async (url, options) => {
    if (url.endsWith("/verify")) {
      assert.equal(url, project + "/auth/v1/verify");
      assert.deepEqual(JSON.parse(options.body), { email, type: "email", token: "123456" });
      return Response.json({ access_token: token, refresh_token: "never-return-this", expires_in: 2700 });
    }
    assert.equal(url, project + "/auth/v1/user");
    assert.equal(options.headers.Authorization, "Bearer " + token);
    verified++;
    return Response.json(user);
  };
  const signed = await customerPilotResponse(post("verify-code", { email, code: "123456" }), env, provider);
  assert.equal(signed.status, 200);
  assert.match(signed.headers.get("Set-Cookie"), /^__Host-invest-customer-pilot=.*; Max-Age=2700; Path=\/; Secure; HttpOnly; SameSite=Strict$/);
  assert.doesNotMatch(await signed.text(), /fixture|refresh|never-return-this/);
  const cookie = signed.headers.get("Set-Cookie").split(";")[0];
  const loggedIn = await (await customerPilotResponse(read(session, cookie), env, provider)).json();
  assert.equal(loggedIn.authenticated, true);
  assert.equal(loggedIn.accessMode, "customer-pilot");
  assert.equal(loggedIn.realAnalysisEnabled, false);
  assert.equal(loggedIn.canViewInternalCosts, false);
  assert.equal(loggedIn.user.id, user.id);
  assert.equal(verified, 2);
  for (const path of [
    "/api/migration/confirm-owner", "/api/migration/asaas-sandbox/webhook", "/api/investments/equity-budget",
    "/api/investments/reports", "/api/investments/statement-imports", "/api/investments/portfolio",
    "/api/investments/billing/sandbox", "/api/investments/agents/run", "/api/suitability/perfil",
  ]) assert.equal((await customerPilotResponse(read(path, cookie), env, denyProvider)).status, 403);

  const revoked = await (await customerPilotResponse(read(session, cookie),
    { ...env, INVEST_CUSTOMER_PILOT_EMAILS: "second@example.invalid" }, provider)).json();
  assert.equal(revoked.authenticated, false);
  const duplicate = await (await customerPilotResponse(read(session, cookie + "; " + cookie), env, denyProvider)).json();
  assert.equal(duplicate.authenticated, false);
  const ownerCookie = await (await customerPilotResponse(read(session, "__Host-invest-migration=" + token), env, denyProvider)).json();
  assert.equal(ownerCookie.authenticated, false);
  const loggedOut = await customerPilotResponse(post("logout", {}), env, denyProvider);
  assert.match(loggedOut.headers.get("Set-Cookie"), new RegExp("^" + cookieName + "=; Max-Age=0"));
});

test("provider token cannot open a session for a different email or an unverified identity", async () => {
  for (const person of [{ ...user, email: "second@example.invalid" }, { ...user, email_confirmed_at: null }]) {
    const response = await customerPilotResponse(post("verify-code", { email, code: "123456" }), env, async url =>
      Response.json(url.endsWith("/verify") ? { access_token: token, expires_in: 3600 } : person));
    assert.equal(response.status, 401);
    assert.equal(response.headers.has("Set-Cookie"), false);
  }
});
