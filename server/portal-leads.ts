import { clerkClient, getAuth } from "@clerk/express";
import type { Express, Request, RequestHandler } from "express";
import { z } from "zod";
import { EMAIL_MESSAGE, normalizeEmail } from "../shared/business-email";

type Identity = {
  id: string;
  primaryEmailAddressId: string | null;
  emailAddresses: { id: string; emailAddress: string; verification: { status: string } | null }[];
  firstName: string | null;
  lastName: string | null;
  createdAt: number;
};
export type PortalLead = { registered: boolean; nome: string | null; marketing_opt_in: boolean };
export type CaptureInput = { userId: string; email: string; nome: string; registeredAt: string; marketingOptIn: boolean };
export type LeadStore = {
  profile(userId: string): Promise<PortalLead>;
  capture(input: CaptureInput): Promise<PortalLead>;
};
export class LeadConfigurationError extends Error {}
export class LeadPolicyError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function verifiedEmailIdentity(user: Identity) {
  const primary = user.emailAddresses.find(email => email.id === user.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== "verified") {
    throw new LeadPolicyError(403, "email_unverified", "Confirme seu e-mail antes de continuar.");
  }
  const email = normalizeEmail(primary.emailAddress);
  if (!email) throw new LeadPolicyError(403, "valid_email_required", EMAIL_MESSAGE);
  if (!/^user_[A-Za-z0-9]+$/.test(user.id) || !Number.isFinite(user.createdAt)) throw new Error("Invalid identity");
  return { userId: user.id, email, registeredAt: new Date(user.createdAt).toISOString() };
}

const leadSchema = z.object({
  registered: z.boolean(),
  nome: z.string().nullable(),
  marketing_opt_in: z.boolean(),
});

export class SupabaseLeadStore implements LeadStore {
  constructor(private env: NodeJS.ProcessEnv = process.env, private send: typeof fetch = fetch) {}
  private async rpc(name: string, body: Record<string, unknown>): Promise<PortalLead> {
    const origin = this.env.SUPABASE_LEADS_URL;
    const key = this.env.SUPABASE_LEADS_SERVER_KEY;
    // Never accept browser keys or an arbitrary HTTP destination for credentials.
    if (!origin || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(origin) || !key || key.length < 32) {
      throw new LeadConfigurationError("Lead storage not configured");
    }
    const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
    if (key.startsWith("sb_secret_")) {
      // New Supabase secret keys are API keys, not JWT bearer tokens.
    } else {
      let role: unknown;
      try { role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role; }
      catch { throw new LeadConfigurationError("Invalid server credential"); }
      if (role !== "service_role") throw new LeadConfigurationError("A server credential is required");
      headers.Authorization = `Bearer ${key}`;
    }
    const response = await this.send(`${origin.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("Lead storage unavailable");
    return leadSchema.parse(await response.json());
  }
  profile(userId: string) {
    return this.rpc("techmoney_portal_lead_profile", { p_clerk_user_id: userId });
  }
  capture(input: CaptureInput) {
    return this.rpc("techmoney_capture_portal_lead", {
      p_clerk_user_id: input.userId, p_email: input.email, p_nome: input.nome,
      p_registered_at: input.registeredAt, p_marketing_opt_in: input.marketingOptIn,
    });
  }
}

export function createPortalLeadHandlers(deps: {
  store: LeadStore;
  getUser?: (id: string) => Promise<Identity>;
  userId?: (req: Request) => string | null;
}) {
  const fetchUser = deps.getUser ?? (id => clerkClient.users.getUser(id));
  const requestUserId = deps.userId ?? (req => getAuth(req).userId);
  async function identity(req: Request) {
    const userId = requestUserId(req);
    if (!userId) throw new LeadPolicyError(401, "unauthorized", "Entre na sua conta para continuar.");
    const user = await fetchUser(userId);
    if (user.id !== userId) throw new Error("Identity mismatch");
    return verifiedEmailIdentity(user);
  }
  function failure(res: Parameters<RequestHandler>[1], error: unknown) {
    res.setHeader("Cache-Control", "no-store");
    if (error instanceof LeadPolicyError) return res.status(error.status).json({ error: error.message, code: error.code });
    // Never log Clerk responses, Supabase keys, e-mails, or raw provider errors.
    console.error("[portal-leads] cadastro indisponível");
    return res.status(503).json({ error: "Não foi possível confirmar seu cadastro. Tente novamente em alguns instantes.", code: "lead_storage_unavailable" });
  }
  const profile: RequestHandler = async (req, res) => {
    try {
      const owner = await identity(req);
      const lead = await deps.store.profile(owner.userId);
      res.setHeader("Cache-Control", "no-store");
      res.json({ ...lead, email: owner.email });
    } catch (error) { failure(res, error); }
  };
  const capture: RequestHandler = async (req, res) => {
    try {
      if (!req.is("application/json")) throw new LeadPolicyError(415, "json_required", "Envie os dados pela tela de cadastro.");
      // Client-supplied userId, e-mail, source, timestamps and arbitrary fields are refused.
      const data = z.object({ nome: z.string().trim().min(2).max(120), marketingOptIn: z.boolean() }).strict().safeParse(req.body);
      if (!data.success) throw new LeadPolicyError(400, "invalid_profile", "Informe seu nome completo e confira os dados do cadastro.");
      if (/[\x00-\x1f\x7f]/.test(data.data.nome)) throw new LeadPolicyError(400, "invalid_profile", "Confira o nome informado.");
      const owner = await identity(req);
      const saved = await deps.store.capture({ ...owner, ...data.data });
      res.setHeader("Cache-Control", "no-store");
      res.json(saved);
    } catch (error) { failure(res, error); }
  };
  const requireRegistration: RequestHandler = async (req, res, next) => {
    // Payment webhooks have their own signature verification, not a Clerk session.
    if (req.method === "POST" && req.path === "/billing/webhook") return next();
    try {
      const owner = await identity(req);
      const profile = await deps.store.profile(owner.userId);
      if (!profile.registered) throw new LeadPolicyError(403, "profile_required", "Conclua seu cadastro antes de usar o sistema.");
      next();
    } catch (error) { failure(res, error); }
  };
  return { profile, capture, requireRegistration };
}

export function registerPortalLeadRoutes(app: Express, options: {
  enabled?: () => boolean;
  handlers?: ReturnType<typeof createPortalLeadHandlers>;
} = {}) {
  // Activation is explicit: a draft merge without the Supabase configuration
  // must not accidentally lock existing users out. Once enabled, failures close.
  const enabled = options.enabled ?? (() => process.env.INVEST_BUSINESS_LEADS_ENABLED === "true");
  const handlers = options.handlers ?? createPortalLeadHandlers({ store: new SupabaseLeadStore() });
  app.get("/api/leads/profile", (req, res, next) => {
    if (!enabled()) { res.setHeader("Cache-Control", "no-store"); res.json({ enabled: false }); return; }
    handlers.profile(req,res,next);
  });
  app.post("/api/leads/profile", (req, res, next) => {
    if (!enabled()) { res.status(503).json({ error: "Cadastro ainda não ativado.", code: "lead_capture_disabled" }); return; }
    handlers.capture(req,res,next);
  });
  const gate: RequestHandler = (req,res,next) => {
    if (!enabled()) return next();
    handlers.requireRegistration(req,res,next);
  };
  app.use("/api/investments", gate);
  app.use("/api/suitability", gate);
}
