import assert from "node:assert/strict";
import { describe, it } from "node:test";
import express from "express";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { runInNewContext } from "node:vm";
import {
  confirmOfficialProductionAccount, productionOwnerReference,
  registerAccountConfirmationRoute, type AccountConfirmationDependencies,
} from "./portfolio-pilot-confirmation";
import type { PortfolioAccountConfirmation } from "../shared/portfolio-pilot-confirmation";
import {
  confirmationResponseSchema, ownerBindingStateSchema, ownerBindingAppliedSchema,
} from "../shared/portfolio-pilot-confirmation";
import { preparePrivatePilot } from "./portfolio-pilot-runtime";

// Same isolated TSX/CSS harness as the access suite. Real presentation source,
// no auth bypass in the app and no DOM/provider/network required for SSR.
function presentationModule(path: string, dependencies: Record<string, unknown>) {
  const compiled = transformSync(readFileSync(path, "utf8"), { loader: "tsx", format: "cjs", jsx: "transform" }).code;
  const module = { exports: {} as Record<string, React.ComponentType<any>> };
  runInNewContext(compiled, { module, exports: module.exports, React,
    require: (name: string) => {
      if (name === "react") return React;
      if (name.endsWith(".css")) return {};
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected presentation import: ${name}`);
    },
  });
  return module.exports;
}
const brand = presentationModule("client/src/components/tech-money-brand.tsx", {});
const AccountConfirmationView = presentationModule("client/src/pages/portfolio-account-confirmation.tsx", {
  "@clerk/react": { useAuth: () => { throw new Error("No fake authentication in presentation"); } },
  "lucide-react": Object.fromEntries(["ArrowLeft", "Check", "CircleAlert", "CircleHelp", "LockKeyhole", "ShieldCheck"]
    .map(name => [name, (props: object) => createElement("svg", props)])),
  "wouter": { Link: ({ children, href, ...props }: any) => createElement("a", { ...props, href }, children) },
  "@/components/tech-money-brand": brand,
  "@/components/ui/button": { Button: ({ children, ...props }: any) => createElement("button", props, children) },
  "@/lib/queryClient": { apiRequest: () => { throw new Error("Presentation cannot query a provider"); } },
  "../../../shared/portfolio-pilot-confirmation": { confirmationResponseSchema, ownerBindingStateSchema, ownerBindingAppliedSchema },
}).AccountConfirmationView;

const actor = { userId: "synthetic-owner", sessionId: "synthetic-session" };
function fixture() {
  const calls: string[] = [];
  const deps: AccountConfirmationDependencies = {
    environment: () => "production",
    ownerReference: () => productionOwnerReference(actor.userId),
    session: async id => { calls.push("session"); return { id, userId: actor.userId, status: "active" }; },
    user: async id => { calls.push("user"); return { id, primaryEmailAddressId: "primary",
      emailAddresses: [{ id: "primary", verification: { status: "verified" } }] }; },
    now: () => Date.parse("2026-10-11T10:00:00Z"),
  };
  return { calls, deps };
}

describe("official account confirmation is private, read-only and never an access grant", () => {
  it("matches only official active session, verified primary and trusted production reference", async () => {
    const f = fixture();
    const result = await confirmOfficialProductionAccount(actor, f.deps);
    assert.equal(result.officialSession, "verified");
    assert.equal(result.primaryEmail, "verified"); assert.equal(result.ownerMatch, "matches");
    assert.deepEqual(f.calls, ["session", "user"]);
    assert.equal(result.ownerBound, false); assert.equal(result.accessGranted, false);
    assert.equal(result.executable, false);
    assert.doesNotMatch(JSON.stringify(result), /synthetic-owner|synthetic-session|primaryEmailAddressId|digest|userId|sessionId/);
  });
  it("never looks up production identities or compares references in development", async () => {
    const f = fixture(); f.deps.environment = () => "development";
    f.deps.ownerReference = () => { throw new Error("DO_NOT_READ_REFERENCE"); };
    const result = await confirmOfficialProductionAccount(actor, f.deps);
    assert.equal(result.ownerMatch, "production_required");
    assert.equal(result.officialSession, "production_required"); assert.equal(result.primaryEmail, "production_required");
    assert.equal(f.calls.length, 0);
  });
  it("rejects a missing signed session without looking up the user", async () => {
    const f = fixture();
    assert.equal((await confirmOfficialProductionAccount({ ...actor, sessionId: null }, f.deps)).officialSession, "inactive");
    assert.equal(f.calls.length, 0);
  });
  for (const session of [
    { id: actor.sessionId, userId: "same-display-name-other-subject", status: "active" },
    { id: "different-session", userId: actor.userId, status: "active" },
    { id: actor.sessionId, userId: actor.userId, status: "revoked" },
  ]) it(`rejects mismatched or revoked official session: ${session.id}/${session.status}/${session.userId}`, async () => {
    const f = fixture(); f.deps.session = async () => session;
    const result = await confirmOfficialProductionAccount(actor, f.deps);
    assert.equal(result.officialSession, "inactive"); assert.equal(result.ownerMatch, "unavailable");
    assert.equal(f.calls.length, 0);
  });
  it("does not accept a verified secondary email in place of the principal", async () => {
    const f = fixture(); f.deps.user = async id => ({ id, primaryEmailAddressId: "p",
      emailAddresses: [{ id: "p", verification: { status: "unverified" } },
        { id: "secondary", verification: { status: "verified" } }] });
    const result = await confirmOfficialProductionAccount(actor, f.deps);
    assert.equal(result.primaryEmail, "unverified"); assert.equal(result.ownerMatch, "unavailable");
  });
  it("rejects another official returned user and never infers from display name", async () => {
    const f = fixture(); f.deps.user = async () => ({ id: "foreign", primaryEmailAddressId: "p",
      emailAddresses: [{ id: "p", verification: { status: "verified" } }] });
    assert.equal((await confirmOfficialProductionAccount(actor, f.deps)).ownerMatch, "unavailable");
  });
  it("clearly distinguishes an unconfigured reference from an account mismatch", async () => {
    const f = fixture(); f.deps.ownerReference = () => undefined;
    assert.equal((await confirmOfficialProductionAccount(actor, f.deps)).ownerMatch, "reference_unavailable");
    f.deps.ownerReference = () => productionOwnerReference("another-synthetic-owner");
    assert.equal((await confirmOfficialProductionAccount(actor, f.deps)).ownerMatch, "different");
    f.deps.ownerReference = () => "invalid-reference";
    assert.equal((await confirmOfficialProductionAccount(actor, f.deps)).ownerMatch, "reference_unavailable");
  });
  it("provider outages remain unavailable and do not leak raw errors or fabricate success", async () => {
    const f = fixture(); f.deps.session = async () => { throw new Error("secret-token-and-private-email"); };
    const result = await confirmOfficialProductionAccount(actor, f.deps);
    assert.equal(result.officialSession, "unavailable"); assert.equal(result.ownerMatch, "unavailable");
    assert.doesNotMatch(JSON.stringify(result), /secret-token|private-email/);
  });
  it("bounded official metadata timeout does not produce success or retry", async () => {
    const f = fixture(); let calls = 0;
    f.deps.metadataTimeoutMs = 5;
    f.deps.session = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 20)); throw new Error("SYNTHETIC_DELAY"); };
    assert.equal((await confirmOfficialProductionAccount(actor, f.deps)).officialSession, "unavailable");
    assert.equal(calls, 1);
  });
  it("authenticated GET ignores client-selected owner/environment and never writes", async () => {
    const f = fixture(), app = express();
    registerAccountConfirmationRoute(app, (req, res, next) => {
      if (req.headers["x-test-auth"] !== "synthetic") { res.sendStatus(401); return; }
      req.userId = actor.userId; next();
    }, (_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); },
    { deps: f.deps, signedActor: () => actor });
    const listener = app.listen(0, "127.0.0.1");
    try {
      await new Promise<void>(resolve => listener.once("listening", resolve));
      const address = listener.address(); assert.ok(address && typeof address !== "string");
      const url = `http://127.0.0.1:${address.port}/api/investments/portfolio-pilot/account-confirmation`;
      assert.equal((await fetch(url)).status, 401); assert.equal(f.calls.length, 0);
      const response = await fetch(`${url}?owner=foreign&environment=development`, { headers: { "x-test-auth": "synthetic" } });
      assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "private, no-store");
      const data = await response.json(); assert.equal(data.ownerMatch, "matches"); assert.equal(data.environment, "production");
      assert.equal((await fetch(url, { method: "POST", headers: { "x-test-auth": "synthetic" } })).status, 404);
    } finally { await new Promise<void>(resolve => listener.close(() => resolve())); }
  });
});

describe("confirmation screen accessibility and honesty", () => {
  const render = (result: PortfolioAccountConfirmation | null, extra = {}) => renderToStaticMarkup(createElement(
    AccountConfirmationView, { result, pending: false, error: "", signedIn: true, onCheck: () => {}, ...extra }));
  it("initial view requires an explicit button and contains no console instructions", () => {
    const html = render(null);
    assert.match(html, /Conferir minha conta/); assert.match(html, /não vincula a conta/);
    assert.doesNotMatch(html, /console do navegador|User ID/);
  });
  it("rejects malformed responses, personal fields or claimed access", async () => {
    const data = await confirmOfficialProductionAccount(actor, fixture().deps);
    assert.equal(confirmationResponseSchema.safeParse(data).success, true);
    assert.equal(confirmationResponseSchema.safeParse({ ...data, userId: "synthetic" }).success, false);
    assert.equal(confirmationResponseSchema.safeParse({ ...data, accessGranted: true }).success, false);
    assert.equal(confirmationResponseSchema.safeParse({ ...data, officialSession: "invented" }).success, false);
  });
  it("a fully positive diagnostic still does not claim access granted", async () => {
    const result = await confirmOfficialProductionAccount(actor, fixture().deps);
    const html = render(result);
    assert.match(html, /Sessão oficial confirmada/); assert.match(html, /E-mail principal confirmado/);
    assert.match(html, /Conta correspondente à referência/); assert.match(html, /Acesso de execução não concedido/);
    assert.doesNotMatch(html, /Vínculo exclusivo confirmado/);
    assert.match(html, /inferência real continua bloqueada/); assert.doesNotMatch(html, /synthetic-owner|synthetic-session/);
  });
  it("development, service error, inactive auth and pending state are distinct", async () => {
    const f = fixture(); f.deps.environment = () => "development";
    assert.match(render(await confirmOfficialProductionAccount(actor, f.deps)), /não é possível confirmar aqui/);
    assert.match(render(null, { error: "Serviço indisponível" }), /role="alert"/);
    assert.match(render(null, { pending: true }), /disabled=""|disabled/);
    assert.match(render(null, { signedIn: false }), /Entrar para confirmar a conta/);
  });
  it("query remains manual, non-polling and isolated on auth changes", () => {
    const source = readFileSync("client/src/pages/portfolio-account-confirmation.tsx", "utf8");
    assert.equal((source.match(/apiRequest\("GET"/g) ?? []).length, 2);
    assert.match(source, /pendingRef\.current/); assert.match(source, /requestNumber\.current !== requestId/);
    assert.match(source, /currentIdentity\.current !== identity/); assert.match(source, /setResult\(null\)/);
    assert.doesNotMatch(source, /setInterval|refetchInterval|window\.Clerk/);
    assert.match(source, /prefers-reduced-motion/);
    assert.match(readFileSync("client/src/App.tsx", "utf8"), /Route path="\/investments\/portfolio\/pilot\/confirm-account"/);
  });
  it("offers explicit binding only after positive production proof and separate unchecked consent", async () => {
    const proof = await confirmOfficialProductionAccount(actor, fixture().deps);
    const state = { environment: "production", ownerBound: false, revoked: false, auditRecorded: false, executable: false };
    const html = render(proof, { binding: state });
    assert.match(html, /Confirmar vínculo exclusivo/);
    assert.doesNotMatch(html, /checked=""/);
    assert.match(html, /disabled/);
    const enabled = render(proof, { binding: state, consent: true, onBind: () => {} });
    assert.match(enabled, /Confirmar vínculo exclusivo/);
    assert.match(enabled, /orçamento/);
    assert.doesNotMatch(enabled, /synthetic-owner|synthetic-session|synthetic-primary/);
  });
  it("shows revoked and applied binding separately from blocked inference", async () => {
    const proof = await confirmOfficialProductionAccount(actor, fixture().deps);
    const state = { environment: "production", ownerBound: false, revoked: true, auditRecorded: false, executable: false };
    assert.match(render(proof, { binding: state }), /revogado/);
    const applied = { ...state, ownerBound: true, revoked: false, auditRecorded: true };
    const html = render(proof, { binding: applied, bindingApplied: applied });
    assert.match(html, /confirmado|aplicado/);
    assert.match(html, /bloquead/);
  });
  it("uses one explicit boolean-only POST and resets consent on account/session checks", () => {
    const source = readFileSync("client/src/pages/portfolio-account-confirmation.tsx", "utf8");
    assert.equal((source.match(/apiRequest\("POST"/g) ?? []).length, 1);
    assert.match(source, /confirmExclusiveOwner: true/);
    assert.match(source, /setConsent\(false\)/);
    assert.match(source, /bindingPendingRef\.current/);
    assert.match(source, /ownerBindingAppliedSchema\.parse/);
  });
});

describe("Nous model-specific counter readiness — metadata fake only", () => {
  const model = "deepseek/deepseek-v4.1-flash";
  it("rejects an unverified methodology or another model counter before reading positions or dispatching", async () => {
    for (const counter of [
      { modelId: model, methodology: " ", count: () => 20 },
      { modelId: "different-model", methodology: "synthetic", count: () => 20 },
    ]) {
      let posts = 0, positions = 0;
      const pilot = await preparePrivatePilot({
        ownerId: actor.userId, credential: () => "synthetic-not-a-key", armed: false,
        tokenCounter: counter, ledger: null, positions: async () => { positions++; return []; },
        transport: async (_url, init) => {
          if (init.method === "POST") posts++;
          return Response.json({ data: [{ id: model, name: "Synthetic model", canonical_slug: model,
            supported_parameters: ["max_tokens"], pricing: { prompt: "0.0000001060", completion: "0.0000005130" } }] });
        },
      });
      const key = pilot.status(actor.userId).models[0].key;
      await assert.rejects(pilot.selectModel(actor.userId, { modelKey: key }), /TOKENIZER_UNVERIFIED/);
      assert.equal(posts, 0); assert.equal(positions, 0); assert.equal(pilot.status(actor.userId).executable, false);
    }
  });
});
