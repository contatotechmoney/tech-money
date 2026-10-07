const LOCAL_ORIGIN = "https://local.invalid";

export function getHostDestination(hostname = ""): string {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === "invest.techmoney.com.br") return "/investments/agents";
  if (host === "finance.techmoney.com.br") return "/dashboard";
  return "/areas";
}

export function getAccessArea(hostname: string, destination: string): "invest" | "finance" | "general" {
  const path = destination.split(/[?#]/)[0];
  if (/^\/investments(?:\/|$)/.test(path)) return "invest";
  if (path === "/dashboard" || getHostDestination(hostname) === "/dashboard") return "finance";
  if (getHostDestination(hostname) === "/investments/agents") return "invest";
  return "general";
}

/** Keep only same-app destinations, never auth screens or an external URL. */
export function getAuthRedirect(search: string, basePath = "", hostname = ""): string {
  const fallback = getHostDestination(hostname);
  const requested = new URLSearchParams(search).get("redirect");
  if (!requested || !requested.startsWith("/") || requested.startsWith("//")) {
    return fallback;
  }
  if (/[\\\u0000-\u0020\u007f]/.test(requested)) return fallback;

  try {
    const url = new URL(requested, LOCAL_ORIGIN);
    if (url.origin !== LOCAL_ORIGIN) return fallback;
    let path = url.pathname;
    if (basePath && (path === basePath || path.startsWith(`${basePath}/`))) {
      path = path.slice(basePath.length) || "/";
    }
    // Reject encoded separators/control characters and encoded authentication loops too.
    let decoded = path;
    for (let step = 0; step < 3; step++) {
      decoded = decodeURIComponent(decoded);
      if (/[\\\u0000-\u0020\u007f]/.test(decoded) || decoded.startsWith("//")) return fallback;
      const normalized = new URL(decoded, LOCAL_ORIGIN);
      if (normalized.origin !== LOCAL_ORIGIN || normalized.pathname.startsWith("//")
          || normalized.pathname === "/" || /^\/sign-(in|up)(\/|$)/.test(normalized.pathname)) return fallback;
      if (!decoded.includes("%")) break;
    }
    return `${path}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function authLink(path: "/sign-in" | "/sign-up", destination: string): string {
  return `${path}?redirect=${encodeURIComponent(destination)}`;
}

export function withAppBase(path: string, basePath: string): string {
  return `${basePath}${path}`;
}
