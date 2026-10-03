const LOCAL_ORIGIN = "https://local.invalid";

/** Keep only same-app destinations, never auth screens or an external URL. */
export function getAuthRedirect(search: string, basePath = ""): string {
  const requested = new URLSearchParams(search).get("redirect");
  if (!requested || !requested.startsWith("/") || requested.startsWith("//")) {
    return "/areas";
  }
  if (/[\\\u0000-\u0020\u007f]/.test(requested)) return "/areas";

  try {
    const url = new URL(requested, LOCAL_ORIGIN);
    if (url.origin !== LOCAL_ORIGIN) return "/areas";
    let path = url.pathname;
    if (basePath && (path === basePath || path.startsWith(`${basePath}/`))) {
      path = path.slice(basePath.length) || "/";
    }
    if (path.startsWith("//") || path === "/" || /^\/sign-(in|up)(\/|$)/.test(path)) return "/areas";
    return `${path}${url.search}${url.hash}`;
  } catch {
    return "/areas";
  }
}

export function authLink(path: "/sign-in" | "/sign-up", destination: string): string {
  return `${path}?redirect=${encodeURIComponent(destination)}`;
}

export function withAppBase(path: string, basePath: string): string {
  return `${basePath}${path}`;
}