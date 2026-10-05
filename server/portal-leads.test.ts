import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { BUSINESS_EMAIL_MESSAGE, normalizeBusinessEmail } from "../shared/business-email";
import { createPortalLeadHandlers, registerPortalLeadRoutes, SupabaseLeadStore, verifiedBusinessIdentity, type CaptureInput, type LeadStore } from "./portal-leads";

const user = (email = "diretoria@techmoney.com.br", status = "verified") => ({
  id: "user_businessA", primaryEmailAddressId: "email_primary",
  emailAddresses: [{ id: "email_primary", emailAddress: email, verification: { status } }],
  firstName: "Pessoa", lastName: "Teste", createdAt: Date.UTC(2026, 9, 1),
});
function fixture(options: { email?: string; verification?: string; authenticated?: boolean; outage?: boolean } = {}) {
  const records = new Map<string, CaptureInput>();
  const calls: CaptureInput[] = [];
  let queries = 0;
  const store: LeadStore = {
    async profile(id) { queries++; if(options.outage) throw Error("simulated failure containing PRIVATE_KEY");
      const lead = records.get(id); return { registered: Boolean(lead), nome: lead?.nome ?? null, marketing_opt_in: lead?.marketingOptIn ?? false }; },
    async capture(input) { queries++; if(options.outage) throw Error("simulated failure containing PRIVATE_KEY");
      calls.push(input); records.set(input.userId, input); return this.profile(input.userId); },
  };
  const handlers = createPortalLeadHandlers({ store,
    userId: req => options.authenticated === false ? null : req.header("x-test-owner") ?? "user_businessA",
    getUser: async id => ({ ...user(options.email, options.verification), id }),
  });
  const app = express(); app.use(express.json());
  app.get("/api/leads/profile", handlers.profile); app.post("/api/leads/profile", handlers.capture);
  app.use("/api/investments", handlers.requireRegistration);
  app.get("/api/investments/protected", (_req, res) => res.json({ allowed: true }));
  app.post("/api/investments/billing/webhook", (_req, res) => res.json({ separateSignatureHandler: true }));
  app.get("/api/investments/billing/webhook", (_req, res) => res.json({ shouldBeProtected: true }));
  return { app, records, calls, queries: () => queries };
}
async function withServer(f: ReturnType<typeof fixture>, callback: (url: string) => Promise<void>) {
  const server = f.app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  try { await callback(`http://127.0.0.1:${(server.address() as { port: number }).port}`); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}
const capture = (url: string, extra: Record<string, unknown> = {}, owner?: string) => fetch(url + "/api/leads/profile", {
  method: "POST", headers: { "Content-Type": "application/json", ...(owner ? { "x-test-owner": owner } : {}) },
  body: JSON.stringify({ nome: "Nome Empresarial", marketingOptIn: false, ...extra }),
});

test("rejects personal, temporary and provider subdomains without matching lookalike corporate domains", () => {
  for (const email of ["x@gmail.com", "x@HOTMAIL.COM", "x@icloud.com", "x@proton.me", "x@mail.gmail.com", "x@foo.yopmail.com", "x@yopmail.com", "x@example.com", "x@test.invalid"])
    assert.equal(normalizeBusinessEmail(email), null, email);
  assert.equal(normalizeBusinessEmail("  Diretor+finance@TechMoney.com.br  "), "diretor+finance@techmoney.com.br");
  assert.equal(normalizeBusinessEmail("x@gmail-business.com.br"), "x@gmail-business.com.br");
});
test("rejects malformed domains and e-mail separators", () => {
  for (const email of ["x@@empresa.com", "x@-empresa.com", "x@empresa..com", ".x@empresa.com", "x..y@empresa.com", "x\r\n@empresa.com", "x@empresa", "x@127.0.0.1"])
    assert.equal(normalizeBusinessEmail(email), null, email);
});
test("secondary verified business address cannot bypass personal or unverified primary email", () => {
  const identity = user("x@gmail.com"); identity.emailAddresses.push({ id: "email_secondary", emailAddress: "x@techmoney.com.br", verification: { status: "verified" } });
  assert.throws(() => verifiedBusinessIdentity(identity), /domínio próprio/);
  assert.throws(() => verifiedBusinessIdentity(user(undefined, "unverified")), /Confirme/);
});
test("anonymous profile and capture cannot write a lead", async () => {
  const f = fixture({ authenticated: false }); await withServer(f, async url => {
    assert.equal((await fetch(url + "/api/leads/profile")).status, 401);
    assert.equal((await capture(url)).status, 401); assert.equal(f.queries(), 0);
  });
});
test("personal address is refused server-side even when bypassing sign-up screen", async () => {
  const f = fixture({ email: "x@gmail.com" }); await withServer(f, async url => {
    const response = await capture(url); assert.equal(response.status, 403);
    assert.equal((await response.json()).error, BUSINESS_EMAIL_MESSAGE); assert.equal(f.queries(), 0);
    assert.equal((await fetch(url + "/api/investments/protected")).status, 403);
  });
});
test("unverified corporate email is refused before any storage", async () => {
  const f = fixture({ verification: "unverified" }); await withServer(f, async url => {
    const response = await capture(url); assert.equal(response.status, 403); assert.equal((await response.json()).code, "email_unverified"); assert.equal(f.queries(), 0);
  });
});
test("client cannot inject owner, email, source or registration date", async () => {
  const f = fixture(); await withServer(f, async url => {
    for (const extra of [{ userId: "user_victim" }, { email: "victim@other.com" }, { origem: "coop" }, { registeredAt: "2000-01-01" }])
      assert.equal((await capture(url, extra)).status, 400);
    assert.equal(f.calls.length, 0);
  });
});
test("business session requires a persisted profile before financial endpoints", async () => {
  const f = fixture(); await withServer(f, async url => {
    assert.equal((await fetch(url + "/api/investments/protected")).status, 403);
    const result = await capture(url); assert.equal(result.status, 200);
    assert.equal(f.calls[0].email, "diretoria@techmoney.com.br"); assert.equal(f.calls[0].registeredAt, "2026-10-01T00:00:00.000Z");
    assert.equal(f.calls[0].marketingOptIn, false);
    assert.equal((await fetch(url + "/api/investments/protected")).status, 200);
  });
});
test("retries and concurrent captures refer to one identity rather than append-only leads", async () => {
  const f = fixture(); await withServer(f, async url => {
    const results = await Promise.all(Array.from({ length: 6 }, () => capture(url)));
    assert.ok(results.every(result => result.status === 200)); assert.equal(f.records.size, 1);
    const get = await fetch(url + "/api/leads/profile"); assert.equal(get.headers.get("cache-control"), "no-store");
  });
});
test("second user never sees the first user profile", async () => {
  const f = fixture(); await withServer(f, async url => {
    await capture(url);
    const response = await fetch(url + "/api/leads/profile", { headers: { "x-test-owner": "user_businessB" } });
    assert.equal((await response.json()).registered, false);
    assert.equal((await fetch(url + "/api/investments/protected", { headers: { "x-test-owner": "user_businessB" } })).status, 403);
  });
});
test("marketing opt-in is explicit, optional, and cannot be string-coerced", async () => {
  const f = fixture(); await withServer(f, async url => {
    assert.equal((await capture(url, { marketingOptIn: "true" })).status, 400);
    assert.equal((await capture(url, { marketingOptIn: true })).status, 200);
    assert.equal(f.records.get("user_businessA")?.marketingOptIn, true);
    await capture(url, { marketingOptIn: false }); assert.equal(f.records.get("user_businessA")?.marketingOptIn, false);
  });
});
test("storage failure blocks use and never returns internal error details", async () => {
  const f = fixture({ outage: true }); await withServer(f, async url => {
    const response = await capture(url); assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes("PRIVATE_KEY"));
    assert.equal((await fetch(url + "/api/investments/protected")).status, 503);
  });
});
test("only exact POST Stripe webhook bypasses Clerk profile gate", async () => {
  const f = fixture({ authenticated: false }); await withServer(f, async url => {
    assert.equal((await fetch(url + "/api/investments/billing/webhook", { method: "POST" })).status, 200);
    assert.equal((await fetch(url + "/api/investments/billing/webhook")).status, 401);
    assert.equal((await fetch(url + "/api/investments/billing/webhook-extra", { method: "POST" })).status, 401);
  });
});
test("RPC adapter sends server identity only to configured HTTPS Supabase and handles configuration failures", async () => {
  let sent: { url: string; init: RequestInit } | undefined;
  const fake = (async (url, init) => { sent = { url: String(url), init: init! }; return Response.json({ registered: true, nome: "Nome", marketing_opt_in: false }); }) as typeof fetch;
  const store = new SupabaseLeadStore({ SUPABASE_LEADS_URL: "https://testproject.supabase.co", SUPABASE_LEADS_SERVER_KEY: "sb_secret_" + "x".repeat(40) }, fake);
  await store.capture({ userId: "user_businessA", email: "x@empresa.com", nome: "Nome", registeredAt: "2026-10-01T00:00:00Z", marketingOptIn: false });
  assert.equal(sent?.url, "https://testproject.supabase.co/rest/v1/rpc/techmoney_capture_portal_lead");
  assert.equal(JSON.parse(sent!.init.body as string).p_marketing_opt_in, false);
  assert.equal(sent!.init.redirect, "error");
  assert.equal((sent!.init.headers as Record<string,string>).Authorization, undefined);
  const bad = new SupabaseLeadStore({ SUPABASE_LEADS_URL: "http://attacker.example", SUPABASE_LEADS_SERVER_KEY: "x".repeat(40) }, fake);
  await assert.rejects(() => bad.profile("user_businessA"), /not configured/);
});
test("legacy service-role keys use JWT bearer; anon and publishable keys are rejected", async () => {
  const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({role})).toString("base64url")}.testSignatureOnly`;
  let headers: Record<string,string> = {};
  const send = (async (_url, init) => { headers=init!.headers as Record<string,string>; return Response.json({registered:false,nome:null,marketing_opt_in:false}); }) as typeof fetch;
  await new SupabaseLeadStore({SUPABASE_LEADS_URL:"https://testproject.supabase.co",SUPABASE_LEADS_SERVER_KEY:jwt("service_role")},send).profile("user_businessA");
  assert.equal(headers.Authorization, `Bearer ${jwt("service_role")}`);
  for (const key of [jwt("anon"),"sb_publishable_"+"x".repeat(40)])
    await assert.rejects(()=>new SupabaseLeadStore({SUPABASE_LEADS_URL:"https://testproject.supabase.co",SUPABASE_LEADS_SERVER_KEY:key},send).profile("user_businessA"));
});
test("feature activation is explicit; enabled capture never falls back to open access on failure", async () => {
  let enabled=false;
  const app=express();app.use(express.json());
  const unavailable=createPortalLeadHandlers({store:{profile:async()=>{throw Error("offline");},capture:async()=>{throw Error("offline");}},userId:()=>"user_businessA",getUser:async()=>user()});
  registerPortalLeadRoutes(app,{enabled:()=>enabled,handlers:unavailable});
  app.get("/api/investments/protected",(_req,res)=>res.json({allowed:true}));
  app.get("/api/suitability/protected",(_req,res)=>res.json({allowed:true}));
  const f={...fixture(),app};
  await withServer(f,async url=>{
    assert.deepEqual(await (await fetch(url+"/api/leads/profile")).json(),{enabled:false});
    assert.equal((await capture(url)).status,503);
    assert.equal((await fetch(url+"/api/investments/protected")).status,200);
    enabled=true;
    assert.equal((await fetch(url+"/api/investments/protected")).status,503);
    assert.equal((await fetch(url+"/api/suitability/protected")).status,503);
    assert.equal((await capture(url)).status,503);
  });
});
