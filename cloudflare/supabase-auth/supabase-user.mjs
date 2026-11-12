const tokenPattern = /^[A-Za-z0-9_.-]{20,8192}$/;
const userIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export function sessionToken(value) {
  return typeof value === "string" && tokenPattern.test(value) ? value : null;
}

export function sessionCookie(request, name) {
  const matches = (request.headers.get("Cookie") ?? "").split(";")
    .map(value => value.trim()).filter(value => value.startsWith(name + "="));
  return matches.length === 1 ? sessionToken(matches[0].slice(name.length + 1)) : null;
}

export async function readVerifiedSupabaseUser(config, token, fetcher) {
  try {
    const response = await fetcher(config.url + "/auth/v1/user", {
      headers: { apikey: config.key, Authorization: "Bearer " + token },
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const user = await response.json();
    const confirmed = Date.parse(user.email_confirmed_at);
    if (!userIdPattern.test(user.id) || user.role !== "authenticated" || user.is_anonymous === true ||
        !user.email_confirmed_at || !Number.isFinite(confirmed) || confirmed > Date.now() ||
        typeof user.email !== "string") return null;
    return { provider: "supabase", subject: user.id, email: user.email.toLowerCase(), verifiedAt: user.email_confirmed_at };
  } catch { return null; }
}
