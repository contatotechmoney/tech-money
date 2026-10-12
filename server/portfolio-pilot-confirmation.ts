import { createHash, timingSafeEqual } from "node:crypto";
import { clerkClient, getAuth } from "@clerk/express";
import type { Express, Request, RequestHandler } from "express";
import type { PortfolioAccountConfirmation } from "../shared/portfolio-pilot-confirmation";
import type { OfficialIdentity } from "./portfolio-pilot-owner";

export type SignedActor = { userId: string | null; sessionId: string | null };
export type AccountConfirmationDependencies = {
  environment: () => "production" | "development";
  ownerReference: () => string | undefined;
  session: (id: string) => Promise<{ id: string; userId: string; status: string }>;
  user: (id: string) => Promise<OfficialIdentity>;
  now: () => number;
  metadataTimeoutMs?: number;
};

/** A private, production-scoped reference, not an authorization or credential.
 * The operator derives it from the already privately confirmed subject outside
 * public documentation. It is never returned, and development cannot use it. */
export function productionOwnerReference(subject: string): string {
  return createHash("sha256").update(`techmoney/portfolio-pilot/production/owner/v1\0${subject}`).digest("hex");
}

/** Bounds metadata calls only, never races a database commit or execution. */
export async function boundedOfficialLookup<T>(request: Promise<T>, timeoutMs = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([request, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("OFFICIAL_METADATA_UNAVAILABLE")),
        Math.min(5000, Math.max(1, timeoutMs)));
      timer.unref();
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

export async function confirmOfficialProductionAccount(
  actor: SignedActor, deps: AccountConfirmationDependencies,
): Promise<PortfolioAccountConfirmation> {
  const environment = deps.environment();
  const result: PortfolioAccountConfirmation = {
    environment, officialSession: "unavailable", primaryEmail: "unavailable",
    ownerMatch: "unavailable", checkedAt: new Date(deps.now()).toISOString(),
    ownerBound: false, accessGranted: false, executable: false,
  };
  if (environment !== "production") return {
    ...result, officialSession: "production_required", primaryEmail: "production_required",
    ownerMatch: "production_required",
  };
  if (!actor.userId || !actor.sessionId) return { ...result, officialSession: "inactive" };
  const bounded = <T>(request: Promise<T>) => boundedOfficialLookup(request, deps.metadataTimeoutMs);
  try {
    const session = await bounded(deps.session(actor.sessionId));
    if (session.id !== actor.sessionId || session.userId !== actor.userId || session.status !== "active")
      return { ...result, officialSession: "inactive" };
    result.officialSession = "verified";
    const user = await bounded(deps.user(actor.userId));
    if (user.id !== actor.userId) return { ...result, officialSession: "unavailable" };
    const primary = user.emailAddresses?.find(email => email.id === user.primaryEmailAddressId);
    if (!primary || primary.verification?.status !== "verified")
      return { ...result, primaryEmail: "unverified" };
    result.primaryEmail = "verified";
    const reference = deps.ownerReference();
    if (!reference || !/^[a-f0-9]{64}$/.test(reference))
      return { ...result, ownerMatch: "reference_unavailable" };
    result.ownerMatch = timingSafeEqual(Buffer.from(reference, "hex"),
      Buffer.from(productionOwnerReference(actor.userId), "hex")) ? "matches" : "different";
    return result;
  } catch {
    // No raw provider errors, subject/email/session or credentials reach the client.
    return result;
  }
}

export const officialAccountConfirmationDependencies: AccountConfirmationDependencies = {
  environment: () => process.env.NODE_ENV === "production" ? "production" : "development",
  // Server-only production configuration, never a browser value or permission.
  ownerReference: () => process.env.PORTFOLIO_PILOT_PRODUCTION_OWNER_REFERENCE,
  session: id => clerkClient.sessions.getSession(id),
  user: id => clerkClient.users.getUser(id),
  now: Date.now,
};

export function registerAccountConfirmationRoute(
  app: Express, auth: RequestHandler, privateResponse: RequestHandler,
  options?: { deps: AccountConfirmationDependencies; signedActor: (req: Request) => SignedActor },
) {
  app.get("/api/investments/portfolio-pilot/account-confirmation", auth, privateResponse, async (req, res) => {
    try {
      const actor = options ? options.signedActor(req) : getAuth(req);
      if (!actor.userId || actor.userId !== req.userId) {
        res.status(401).json({ error: "AUTHENTICATION_REQUIRED" }); return;
      }
      res.set("Pragma", "no-cache");
      res.json(await confirmOfficialProductionAccount(actor, options?.deps ?? officialAccountConfirmationDependencies));
    } catch {
      res.status(503).json({ error: "ACCOUNT_CONFIRMATION_UNAVAILABLE", executable: false });
    }
  });
}
