import assert from "node:assert/strict";
import test from "node:test";
import { customerPilotWorker } from "./customer-pilot-worker.mjs";

const origin = "https://pilot.example.workers.dev";
const issuer = "https://pilot-example.cloudflareaccess.com";
const audience = "customer-pilot-audience";
const email = "invited@example.invalid";
const env = {
  INVEST_CUSTOMER_PILOT_ORIGIN: origin,
  INVEST_CUSTOMER_PILOT_ACCESS_ISSUER: issuer,
  INVEST_CUSTOMER_PILOT_ACCESS_AUDIENCE: audience,
  INVEST_CUSTOMER_PILOT_ACCESS_EMAIL: email,
};

test("only the invited signed identity can open the demonstration, and operational APIs stay blocked", async () => {
  const algorithm = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };
  const keys = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);
  const jwk = { ...await crypto.subtle.exportKey("jwk", keys.publicKey), kid: "test-key" };
  const certs = async url => {
    assert.equal(url, issuer + "/cdn-cgi/access/certs");
    return Response.json({ keys: [jwk] });
  };
  const encode = object => Buffer.from(JSON.stringify(object)).toString("base64url");
  async function token(overrides) {
    const now = Math.floor(Date.now() / 1000);
    const message = encode({ alg: "RS256", kid: jwk.kid }) + "." + encode({
      iss: issuer, aud: [audience], sub: "test-user", email, iat: now, exp: now + 600, ...overrides,
    });
    const signature = await crypto.subtle.sign(algorithm.name, keys.privateKey, new TextEncoder().encode(message));
    return message + "." + Buffer.from(signature).toString("base64url");
  }
  let assetRequests = 0;
  const config = { ...env, ASSETS: { async fetch() { assetRequests++; return new Response("fictional demo"); } } };
  const run = (path, assertion, init = {}) => customerPilotWorker(new Request(origin + path, {
    ...init, headers: { "Cf-Access-Jwt-Assertion": assertion ?? "", ...init.headers },
  }), config, certs);

  assert.equal((await customerPilotWorker(new Request(origin), {}, certs)).status, 503);
  assert.equal((await run("/investments/inicio")).status, 403);
  assert.equal((await run("/investments/inicio", await token({ email: "other@example.invalid" }))).status, 403);
  assert.equal((await run("/investments/inicio", await token({ aud: ["owner-application"] }))).status, 403);
  assert.equal(assetRequests, 0);

  const valid = await token();
  assert.equal((await run("/", valid)).headers.get("Location"), "/investments/inicio");
  const session = await (await run("/api/migration/session", valid)).json();
  assert.equal(session.authenticated, true);
  assert.equal(session.accessMode, "customer-pilot");
  assert.equal(session.canViewInternalCosts, false);
  const page = await run("/investments/inicio", valid);
  assert.equal(await page.text(), "fictional demo");
  assert.equal(page.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.equal(assetRequests, 1);
  for (const path of [
    "/api/investments/agents/run", "/api/investments/billing/checkout", "/api/investments/billing/sandbox",
    "/api/migration/asaas-sandbox/webhook", "/api/investments/portfolio-pilot/execute", "/api/suitability/perfil",
  ]) {
    const denied = await run(path, valid, { method: "POST" });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).realAnalysisEnabled, false);
  }
  const logout = "/api/migration/customer-pilot/logout";
  assert.equal((await run(logout, valid, { method: "POST" })).status, 403);
  const signedOut = await run(logout, valid, { method: "POST", headers: { Origin: origin } });
  assert.equal((await signedOut.json()).signOutPath, "/cdn-cgi/access/logout");
});
