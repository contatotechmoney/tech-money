import { ownerIdentity } from "../public-invest/admin.mjs";
import { pilotCredits, pilotCreditsPath } from "./customer-pilot-credits.mjs";

const loginPath = "/piloto/entrar";
const homePath = "/investments/inicio";
const signedOutCookie = "__Host-invest-pilot-signed-out";
const cookieFlags = "Path=/; Secure; HttpOnly; SameSite=Strict";
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
const redirect = (location, extra = {}) => new Response(null, {
  status: 303, headers: { ...headers, Location: location, ...extra },
});

function signedOutPage(method) {
  return new Response(method === "HEAD" ? null : `<!doctype html>
<html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Entrar no piloto do Invest</title>
<style>
body{font:16px/1.5 system-ui;background:#f0f6f3;color:#173b2e;margin:0;padding:2rem}
main{margin:10vh auto 0;max-width:28rem;background:white;border:1px solid #c7d9d0;border-radius:1rem;padding:1.5rem}
h1{font-size:1.5rem;margin:0 0 .5rem}button{font:inherit;font-weight:600;background:#245e46;color:white;border:0;border-radius:.5rem;padding:.75rem 1rem;cursor:pointer}
</style>
<main><h1>Você saiu do piloto</h1><p>Entre novamente para continuar a demonstração e consultar o saldo da sua conta.</p>
<form method="post" action="${loginPath}"><button>Entrar no piloto</button></form></main></html>`, {
    headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "Referrer-Policy": "same-origin",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" },
  });
}

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

  const signedOut = request.headers.get("Cookie")?.split(";").some(cookie => cookie.trim() === `${signedOutCookie}=1`);
  if (url.pathname === loginPath && request.method === "POST") {
    if (request.headers.get("Origin") !== origin) return json({ error: "ORIGIN_NOT_ALLOWED" }, 403);
    return redirect(homePath, { "Set-Cookie": `${signedOutCookie}=; Max-Age=0; ${cookieFlags}` });
  }
  if (url.pathname === "/api/migration/session" && request.method === "GET") {
    return signedOut ? json({ authenticated: false })
      : json({ authenticated: true, persistentCredits: true, user: { id: identity.subject, email: identity.email } });
  }
  if (url.pathname === "/api/migration/customer-pilot/logout" && request.method === "POST") {
    if (request.headers.get("Origin") !== origin) return json({ error: "ORIGIN_NOT_ALLOWED" }, 403);
    return Response.json({ signedOut: true, ...closed }, {
      headers: { ...headers, "Set-Cookie": `${signedOutCookie}=1; Max-Age=86400; ${cookieFlags}` },
    });
  }
  if (url.pathname === pilotCreditsPath) {
    if (signedOut) return json({ error: "PILOT_SIGN_IN_REQUIRED" }, 401);
    return pilotCredits(request, { database: env.INVEST_PILOT_CREDITS, origin, issuer, subject: identity.subject }, json);
  }
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    return json({ error: "PILOT_DEMONSTRATION_ONLY" }, 403);
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  }
  if (signedOut) {
    return url.pathname === loginPath ? signedOutPage(request.method) : redirect(loginPath);
  }
  if (url.pathname === "/" || url.pathname === loginPath) {
    return new Response(null, { status: 302, headers: { ...headers, Location: homePath } });
  }

  const asset = await env.ASSETS.fetch(request);
  const response = new Response(asset.body, asset);
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  return response;
}

export default { fetch: (request, env) => customerPilotWorker(request, env) };
