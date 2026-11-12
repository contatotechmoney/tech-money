import { ownerIdentity } from "../public-invest/admin.mjs";

const closed = {
  accessMode: "customer-pilot",
  realAnalysisEnabled: false,
  executable: false,
  canViewInternalCosts: false,
};
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
};
const json = (data, status = 200) => Response.json({ ...data, ...closed }, { status, headers });

export async function customerPilotWorker(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  const origin = env.INVEST_CUSTOMER_PILOT_ORIGIN;
  const issuer = env.INVEST_CUSTOMER_PILOT_ACCESS_ISSUER;
  const audience = env.INVEST_CUSTOMER_PILOT_ACCESS_AUDIENCE;
  const email = env.INVEST_CUSTOMER_PILOT_ACCESS_EMAIL;
  if (!origin || url.origin !== origin || !issuer || !audience || !email) {
    return json({ error: "PILOT_UNAVAILABLE" }, 503);
  }

  // The same signed Cloudflare Access assertion format protects the existing contacts panel.
  const identity = await ownerIdentity(request, {
    INTEREST_ACCESS_ISSUER: issuer,
    INTEREST_ACCESS_AUD: audience,
    INTEREST_OWNER_EMAIL: email,
  }, fetcher);
  if (!identity) return json({ error: "PILOT_INVITATION_REQUIRED" }, 403);

  if (url.pathname === "/api/migration/session" && request.method === "GET") {
    return json({ authenticated: true, user: { id: identity.subject, email: identity.email } });
  }
  if (url.pathname === "/api/migration/customer-pilot/logout" && request.method === "POST") {
    if (request.headers.get("Origin") !== origin) return json({ error: "ORIGIN_NOT_ALLOWED" }, 403);
    return json({ signedOut: true, signOutPath: "/cdn-cgi/access/logout" });
  }
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    return json({ error: "PILOT_DEMONSTRATION_ONLY" }, 403);
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  }
  if (url.pathname === "/" || url.pathname === "/piloto/entrar") {
    return new Response(null, { status: 302, headers: { ...headers, Location: "/investments/inicio" } });
  }

  const asset = await env.ASSETS.fetch(request);
  const response = new Response(asset.body, asset);
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  return response;
}

export default { fetch: (request, env) => customerPilotWorker(request, env) };
