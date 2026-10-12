import assert from "node:assert/strict";
import { describe, it } from "node:test";
import express from "express";
import {
  productionOwnerReference, type AccountConfirmationDependencies,
} from "./portfolio-pilot-confirmation";
import { registerOwnerBindingAction, type OwnerBindingActionDependencies } from "./portfolio-pilot-owner-binding-action";
import { ownerBindingAppliedSchema, ownerBindingStateSchema } from "../shared/portfolio-pilot-confirmation";

function fixture() {
  const actor = { userId: "synthetic-owner", sessionId: "synthetic-session" };
  const calls = { metadata: 0, reads: 0, writes: 0 };
  const metadata: AccountConfirmationDependencies = {
    environment: () => "production",
    ownerReference: () => productionOwnerReference("synthetic-owner"),
    now: () => 1_791_744_000_000,
    session: async id => { calls.metadata++; return { id, userId: actor.userId, status: "active" }; },
    user: async id => { calls.metadata++; return { id, primaryEmailAddressId: "synthetic-primary",
      emailAddresses: [{ id: "synthetic-primary", verification: { status: "verified" } }] }; },
  };
  const deps: OwnerBindingActionDependencies = {
    metadata, signedActor: () => actor,
    read: async () => { calls.reads++; return {
      environment: "production", ownerBound: false, revoked: false, auditRecorded: false, executable: false,
    }; },
    bind: async () => { calls.writes++; return {
      environment: "production", ownerBound: true, revoked: false, auditRecorded: true, executable: false,
    }; },
  };
  return { actor, calls, deps };
}

async function server(
  f: ReturnType<typeof fixture>,
  work: (url: string, request: (body?: unknown, headers?: Record<string, string>) => Promise<Response>) => Promise<void>,
) {
  const app = express();
  app.use(express.json());
  registerOwnerBindingAction(app, (req, res, next) => {
    if (req.get("x-synthetic-auth") !== "authenticated") { res.sendStatus(401); return; }
    req.userId = f.actor.userId; next();
  }, (_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); }, f.deps);
  const listener = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => listener.once("listening", resolve));
  const address = listener.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/api/investments/portfolio-pilot/account-binding`;
  try {
    await work(url, (body = { confirmExclusiveOwner: true }, headers = {}) => fetch(url, {
      method: "POST", headers: { "content-type": "application/json", "x-synthetic-auth": "authenticated",
        origin: `https://127.0.0.1:${address.port}`, "sec-fetch-site": "same-origin", ...headers },
      body: JSON.stringify(body),
    }));
  } finally { await new Promise<void>(resolve => listener.close(() => resolve())); }
}

describe("explicit exclusive production binding — synthetic official service only", () => {
  it("refuses unsigned requests before reading or writing", async () => {
    const f = fixture();
    await server(f, async (url, request) => {
      assert.equal((await fetch(url)).status, 401);
      assert.equal((await request(undefined, { "x-synthetic-auth": "absent" })).status, 401);
    });
    assert.deepEqual(f.calls, { metadata: 0, reads: 0, writes: 0 });
  });
  it("authenticated GET returns sanitized state and never binds", async () => {
    const f = fixture();
    await server(f, async url => {
      const response = await fetch(url + "?userId=foreign&environment=development", {
        headers: { "x-synthetic-auth": "authenticated" },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      const result = await response.json();
      assert.equal(ownerBindingStateSchema.safeParse(result).success, true);
      assert.doesNotMatch(JSON.stringify(result), /synthetic-owner|synthetic-session|synthetic-primary/);
    });
    assert.deepEqual(f.calls, { metadata: 2, reads: 1, writes: 0 });
  });
  it("requires explicit literal consent and rejects all client-selected identities or permissions", async () => {
    const f = fixture();
    await server(f, async (_url, request) => {
      for (const body of [{}, { confirmExclusiveOwner: false }, { confirmExclusiveOwner: "true" },
        { confirmExclusiveOwner: true, userId: "foreign" },
        { confirmExclusiveOwner: true, sessionId: "chosen" },
        { confirmExclusiveOwner: true, environment: "production" },
        { confirmExclusiveOwner: true, reference: "a".repeat(64) },
        { confirmExclusiveOwner: true, approveBudget: true }]) {
        assert.equal((await request(body)).status, 400);
      }
    });
    assert.equal(f.calls.metadata + f.calls.reads + f.calls.writes, 0);
  });
  it("requires same-origin HTTPS and rejects missing/spoofed origin or cross-site Fetch Metadata", async () => {
    const f = fixture();
    await server(f, async (_url, request) => {
      for (const headers of [
        { origin: "" }, { origin: "https://attacker.invalid" }, { origin: "null" },
        { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" },
        { origin: "https://attacker.invalid", "x-forwarded-host": "attacker.invalid" },
      ]) assert.equal((await request(undefined, headers)).status, 403);
    });
    assert.equal(f.calls.metadata + f.calls.writes, 0);
  });
  it("cannot transfer a production reference into development", async () => {
    const f = fixture(); f.deps.metadata.environment = () => "development";
    await server(f, async (_url, request) => assert.equal((await request()).status, 403));
    assert.equal(f.calls.metadata + f.calls.writes, 0);
  });
  it("fails closed without a valid private server reference", async () => {
    for (const reference of [undefined, "", "not-a-digest"]) {
      const f = fixture(); f.deps.metadata.ownerReference = () => reference;
      await server(f, async (_url, request) => assert.equal((await request()).status, 503));
      assert.equal(f.calls.metadata + f.calls.writes, 0);
    }
  });
  it("rejects another signed account, regardless of display name or client flags", async () => {
    const f = fixture(); f.actor.userId = "synthetic-homonym";
    await server(f, async (url, request) => {
      assert.equal((await fetch(url, { headers: { "x-synthetic-auth": "authenticated" } })).status, 403);
      assert.equal((await request()).status, 403);
    });
    assert.equal(f.calls.metadata + f.calls.reads + f.calls.writes, 0);
  });
  it("rejects disagreement between the auth middleware and signed Clerk subject", async () => {
    const f = fixture(); f.deps.signedActor = () => ({ userId: "foreign", sessionId: "synthetic-session" });
    await server(f, async (_url, request) => assert.equal((await request()).status, 401));
    assert.equal(f.calls.metadata + f.calls.writes, 0);
  });
  it("rechecks active official session on every write, not the previous GET diagnosis", async () => {
    const f = fixture();
    await server(f, async (url, request) => {
      assert.equal((await fetch(url, { headers: { "x-synthetic-auth": "authenticated" } })).status, 200);
      f.deps.metadata.session = async id => ({ id, userId: f.actor.userId, status: "revoked" });
      assert.equal((await request()).status, 403);
    });
    assert.equal(f.calls.writes, 0);
  });
  it("rejects another session/user returned by official service", async () => {
    for (const change of ["id", "userId"] as const) {
      const f = fixture();
      f.deps.metadata.session = async id => ({ id, userId: f.actor.userId, status: "active", [change]: "foreign" });
      await server(f, async (_url, request) => assert.equal((await request()).status, 403));
      assert.equal(f.calls.writes, 0);
    }
  });
  it("requires a matching official user and verified primary email, never a secondary email", async () => {
    for (const variant of ["other-user", "secondary-only", "unverified-primary"]) {
      const f = fixture();
      f.deps.metadata.user = async id => ({ id: variant === "other-user" ? "foreign" : id,
        primaryEmailAddressId: "primary", emailAddresses: [
          { id: variant === "secondary-only" ? "secondary" : "primary",
            verification: { status: variant === "unverified-primary" ? "unverified" : "verified" } },
        ] });
      await server(f, async (_url, request) => assert.equal((await request()).status, 403));
      assert.equal(f.calls.writes, 0);
    }
  });
  it("does not expose provider details or continue after official lookup timeout/failure", async () => {
    const f = fixture(); f.deps.metadata.metadataTimeoutMs = 2;
    f.deps.metadata.session = async () => {
      await new Promise(resolve => setTimeout(resolve, 12));
      throw new Error("synthetic-owner private-email@example.invalid secret-token");
    };
    await server(f, async (_url, request) => {
      const response = await request(); assert.equal(response.status, 403);
      assert.doesNotMatch(await response.text(), /synthetic-owner|private-email|secret-token/);
    });
    assert.equal(f.calls.writes, 0);
  });
  it("writes only after explicit request and returns binding, not execution approval", async () => {
    const f = fixture();
    await server(f, async (_url, request) => {
      const response = await request(); assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(ownerBindingAppliedSchema.safeParse(result).success, true);
      assert.equal(result.executable, false);
      assert.doesNotMatch(JSON.stringify(result), /synthetic-owner|synthetic-session|synthetic-primary/);
    });
    assert.equal(f.calls.writes, 1);
  });
  it("rejects concurrent clicks while preserving one active write", async () => {
    const f = fixture();
    let release!: () => void, started!: () => void;
    const start = new Promise<void>(resolve => { started = resolve; });
    const wait = new Promise<void>(resolve => { release = resolve; });
    f.deps.bind = async () => { f.calls.writes++; started(); await wait; return {
      environment: "production", ownerBound: true, revoked: false, auditRecorded: true, executable: false,
    }; };
    await server(f, async (_url, request) => {
      const first = request(); await start;
      try { assert.equal((await request()).status, 409); }
      finally { release(); }
      assert.equal((await first).status, 200);
    });
    assert.equal(f.calls.writes, 1);
  });
  it("preserves conflict/revocation refusal and masks unexpected database errors", async () => {
    for (const error of ["OWNER_BINDING_CONFLICT", "SQL synthetic-owner private-error"]) {
      const f = fixture(); f.deps.bind = async () => { throw new Error(error); };
      await server(f, async (_url, request) => {
        const response = await request();
        assert.equal(response.status, error === "OWNER_BINDING_CONFLICT" ? 409 : 503);
        assert.doesNotMatch(await response.text(), /synthetic-owner|private-error/);
      });
    }
  });
  it("strict output validation refuses invented execution permission or identifiers", () => {
    const valid = { environment: "production", ownerBound: true, revoked: false, auditRecorded: true, executable: false };
    assert.equal(ownerBindingAppliedSchema.safeParse(valid).success, true);
    for (const patch of [{ executable: true }, { userId: "private" }, { auditRecorded: false }])
      assert.equal(ownerBindingAppliedSchema.safeParse({ ...valid, ...patch }).success, false);
  });
});
