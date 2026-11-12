import { OWNER_SUPABASE_PROJECT_URL } from "./identity.mjs";
import { readVerifiedSupabaseUser, sessionCookie, sessionToken } from "./supabase-user.mjs";
import { customerPilotAsset } from "./customer-pilot-page.mjs";

const pilotCookie = "__Host-invest-customer-pilot";
const cookieFlags = "Path=/; Secure; HttpOnly; SameSite=Strict";
const sessionPath = "/api/migration/session";
const loginPath = "/piloto/entrar";
const authPaths = {
  request: "/api/migration/customer-pilot/request-code",
  verify: "/api/migration/customer-pilot/verify-code",
  logout: "/api/migration/customer-pilot/logout",
};
const staticPaths = [loginPath, "/piloto/entrar.css", "/piloto/entrar.js"];
const closed = { realAnalysisEnabled: false, executable: false, canViewInternalCosts: false, accessMode: "customer-pilot" };
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (data, status = 200, extra = {}) => Response.json({ ...data, ...closed }, { status, headers: { ...headers, ...extra } });

function emailAddress(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email) ? email : null;
}

function customerPilotConfig(env) {
  const url = env.INVEST_CUSTOMER_PILOT_SUPABASE_URL;
  const origin = env.INVEST_CUSTOMER_PILOT_ORIGIN;
  const key = env.INVEST_CUSTOMER_PILOT_SUPABASE_PUBLISHABLE_KEY;
  const emails = new Set((env.INVEST_CUSTOMER_PILOT_EMAILS ?? "").split(",").map(emailAddress).filter(Boolean));
  // Keep the invited audience outside the owner's auth project, even when owner bindings are absent.
  if (!/^https:\/\/[a-z\d]{20}\.supabase\.co$/.test(url ?? "") ||
      url === OWNER_SUPABASE_PROJECT_URL || url === env.INVEST_SUPABASE_URL ||
      !/^https:\/\/[a-z\d-]+\.[a-z\d-]+\.workers\.dev$/.test(origin ?? "") ||
      origin === env.INVEST_MIGRATION_ORIGIN || !key?.startsWith("sb_publishable_") ||
      !emails.size || !env.INVEST_CUSTOMER_PILOT_RATE?.limit ||
      (env.INVEST_CUSTOMER_PILOT_RATE_KEY?.length ?? 0) < 32) return null;
  return { url, origin, key, emails };
}

async function readInput(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("Content-Type") ?? "")) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let value = "";
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 2048) {
        await reader.cancel();
        return null;
      }
      value += decoder.decode(part.value, { stream: true });
    }
    const input = JSON.parse(value + decoder.decode());
    return input && typeof input === "object" && !Array.isArray(input) ? input : null;
  } catch { return null; }
}

async function requestAllowed(request, path, email, env) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.INVEST_CUSTOMER_PILOT_RATE_KEY),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const clientIp = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const attempts = await Promise.all([`email:${email}`, `source:${clientIp}`].map(async value => {
    const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(`${path}:${value}`));
    return env.INVEST_CUSTOMER_PILOT_RATE.limit({
      key: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join(""),
    });
  }));
  return attempts.every(attempt => attempt.success === true);
}

function providerRequest(config, path, body, fetcher) {
  return fetcher(config.url + "/auth/v1/" + path, {
    method: "POST", redirect: "manual", signal: AbortSignal.timeout(8000),
    headers: { apikey: config.key, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

function sessionData(identity) {
  return identity
    ? json({ authenticated: true, user: { id: identity.subject, email: identity.email } })
    : json({ authenticated: false });
}

function hasPilotRoute(path) {
  return staticPaths.includes(path) || Object.values(authPaths).includes(path);
}

export async function customerPilotResponse(request, env, fetcher = fetch, waitUntil) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (env.INVEST_PORTAL_MODE !== "customer-pilot") return hasPilotRoute(path) ? json({ error: "NOT_FOUND" }, 404) : null;
  const config = customerPilotConfig(env);
  if (!config || url.origin !== config.origin) return json({ error: "PILOT_UNAVAILABLE" }, 503);
  if (path === "/" && ["GET", "HEAD"].includes(request.method)) {
    return new Response(null, { status: 302, headers: { ...headers, Location: loginPath } });
  }
  if (staticPaths.includes(path)) {
    return ["GET", "HEAD"].includes(request.method) ? customerPilotAsset(path, request.method) : json({ error: "METHOD_NOT_ALLOWED" }, 405);
  }
  if (path === sessionPath) {
    if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    const token = sessionCookie(request, pilotCookie);
    const identity = token ? await readVerifiedSupabaseUser(config, token, fetcher) : null;
    return sessionData(config.emails.has(identity?.email) ? identity : null);
  }
  if (!Object.values(authPaths).includes(path)) {
    // Pilots may fetch client assets. Every API outside this list stays inaccessible, including owner routes.
    return path === "/api" || path.startsWith("/api/") ? json({ error: "PILOT_DEMONSTRATION_ONLY" }, 403) : null;
  }
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  if (request.headers.get("Origin") !== config.origin) return json({ error: "ORIGIN_NOT_ALLOWED" }, 403);
  if (path === authPaths.logout) {
    return json({ signedOut: true }, 200, { "Set-Cookie": `${pilotCookie}=; Max-Age=0; ${cookieFlags}` });
  }
  const input = await readInput(request);
  const email = emailAddress(input?.email);
  const isRequest = path === authPaths.request;
  const keys = isRequest ? ["email"] : ["email", "code"];
  if (!email || Object.keys(input).length !== keys.length || Object.keys(input).some(key => !keys.includes(key)) ||
      (!isRequest && (typeof input.code !== "string" || !/^\d{6}$/.test(input.code)))) return json({ error: "INVALID_INPUT" }, 400);
  try {
    if (!await requestAllowed(request, path, email, env)) return json({ error: "TRY_LATER" }, 429, { "Retry-After": "60" });
    if (isRequest) {
      // Use the same response for every address and keep delivery latency out of the Worker response.
      if (config.emails.has(email)) {
        const delivery = providerRequest(config, "otp", { email, create_user: false }, fetcher).catch(() => {});
        if (waitUntil) waitUntil(delivery);
        else await delivery;
      }
      return json({ requested: true }, 202);
    }
    if (!config.emails.has(email)) return json({ error: "INVALID_CODE" }, 401);
    const response = await providerRequest(config, "verify", { email, token: input.code, type: "email" }, fetcher);
    if (!response.ok) return json({ error: "INVALID_CODE" }, 401);
    const data = await response.json();
    const token = sessionToken(data.access_token);
    const maxAge = Math.min(3600, Math.floor(Number(data.expires_in)));
    if (!token || !Number.isSafeInteger(maxAge) || maxAge <= 0) return json({ error: "INVALID_CODE" }, 401);
    const identity = await readVerifiedSupabaseUser(config, token, fetcher);
    if (!identity || identity.email !== email) return json({ error: "INVALID_CODE" }, 401);
    return json({ signedIn: true }, 200, { "Set-Cookie": `${pilotCookie}=${token}; Max-Age=${maxAge}; ${cookieFlags}` });
  } catch {
    return json({ error: "PILOT_UNAVAILABLE" }, 503);
  }
}
