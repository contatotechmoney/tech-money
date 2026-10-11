import { timingSafeEqual } from "node:crypto";
import { getAuth } from "@clerk/express";
import type { Express, Request, RequestHandler } from "express";
import {
  ownerBindingAppliedSchema, ownerBindingConsentSchema, ownerBindingStateSchema,
  type OwnerBindingState,
} from "../shared/portfolio-pilot-confirmation";
import {
  confirmOfficialProductionAccount, productionOwnerReference,
  type AccountConfirmationDependencies, type SignedActor,
} from "./portfolio-pilot-confirmation";

export type OwnerBindingActionDependencies = {
  metadata: AccountConfirmationDependencies;
  signedActor?: (req: Request) => SignedActor;
  read: (actor: SignedActor) => Promise<OwnerBindingState>;
  bind: (actor: SignedActor) => Promise<OwnerBindingState>;
};

/** Only a server-configured reference can attest the independently confirmed
 * owner. No browser field chooses the subject, environment, reference or session. */
function trustedOwner(actor: SignedActor, deps: OwnerBindingActionDependencies) {
  if (deps.metadata.environment() !== "production") throw new Error("PRODUCTION_IDENTITY_REQUIRED");
  const reference = deps.metadata.ownerReference();
  if (!reference || !/^[a-f0-9]{64}$/.test(reference)) throw new Error("OWNER_REFERENCE_UNAVAILABLE");
  if (!actor.userId || !actor.sessionId) throw new Error("AUTHENTICATION_REQUIRED");
  if (!timingSafeEqual(Buffer.from(reference, "hex"),
    Buffer.from(productionOwnerReference(actor.userId), "hex"))) throw new Error("OWNER_ACCOUNT_MISMATCH");
}

function sameOrigin(req: Request): boolean {
  try {
    const origin = new URL(req.get("origin") ?? "");
    const site = req.get("sec-fetch-site");
    return origin.protocol === "https:" && origin.host === req.get("host") &&
      !origin.username && !origin.password && origin.pathname === "/" &&
      !origin.search && !origin.hash && (!site || site === "same-origin");
  } catch { return false; }
}

async function verifiedActor(req: Request, deps: OwnerBindingActionDependencies) {
  const actor = deps.signedActor ? deps.signedActor(req) : getAuth(req);
  if (!actor.userId || actor.userId !== req.userId || !actor.sessionId)
    throw new Error("AUTHENTICATION_REQUIRED");
  trustedOwner(actor, deps);
  return actor;
}

async function verifyOfficialSession(actor: SignedActor, deps: OwnerBindingActionDependencies) {
  const proof = await confirmOfficialProductionAccount(actor, deps.metadata);
  if (proof.officialSession !== "verified" || proof.primaryEmail !== "verified" || proof.ownerMatch !== "matches")
    throw new Error("OFFICIAL_IDENTITY_REQUIRED");
}

function replyError(res: Parameters<RequestHandler>[1], error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const statuses: Record<string, number> = {
    AUTHENTICATION_REQUIRED: 401, PRODUCTION_IDENTITY_REQUIRED: 403, OWNER_ACCOUNT_MISMATCH: 403,
    OFFICIAL_IDENTITY_REQUIRED: 403, OWNER_SESSION_REQUIRED: 403, VERIFIED_IDENTITY_REQUIRED: 403,
    OWNER_REFERENCE_UNAVAILABLE: 503, OWNER_BINDING_CONFLICT: 409, OWNER_BINDING_IN_PROGRESS: 409,
    DURABLE_AUDIT_NOT_READY: 503,
  };
  // Never echo raw SDK/SQL errors, identifiers, digests or credentials.
  res.status(statuses[code] ?? 503).json({
    error: statuses[code] ? code : "OWNER_BINDING_UNAVAILABLE", executable: false,
  });
}

export function registerOwnerBindingAction(
  app: Express, auth: RequestHandler, privateResponse: RequestHandler, deps: OwnerBindingActionDependencies,
) {
  // Database advisory/row locks cover multiple replicas. This also rejects
  // simultaneous clicks during official metadata checks in this process.
  const inFlight = new Set<string>();
  const path = "/api/investments/portfolio-pilot/account-binding";
  app.get(path, auth, privateResponse, async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    res.set("Pragma", "no-cache");
    try {
      const actor = await verifiedActor(req, deps);
      await verifyOfficialSession(actor, deps);
      res.json(ownerBindingStateSchema.parse(await deps.read(actor)));
    } catch (error) { replyError(res, error); }
  });
  app.post(path, auth, privateResponse, async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    res.set("Pragma", "no-cache");
    if (!sameOrigin(req)) {
      res.status(403).json({ error: "SAME_ORIGIN_REQUIRED", executable: false }); return;
    }
    if (!req.is("application/json") || !ownerBindingConsentSchema.safeParse(req.body).success) {
      res.status(400).json({ error: "EXPLICIT_BINDING_CONSENT_REQUIRED", executable: false }); return;
    }
    let lockedActor: string | undefined;
    try {
      const actor = await verifiedActor(req, deps);
      if (inFlight.has(actor.userId!)) throw new Error("OWNER_BINDING_IN_PROGRESS");
      lockedActor = actor.userId!;
      inFlight.add(lockedActor);
      // Browser diagnosis is never authorization; check official services again
      // on the write request, then the binding procedure checks them once more.
      await verifyOfficialSession(actor, deps);
      res.json(ownerBindingAppliedSchema.parse(await deps.bind(actor)));
    } catch (error) { replyError(res, error); }
    finally { if (lockedActor) inFlight.delete(lockedActor); }
  });
}
