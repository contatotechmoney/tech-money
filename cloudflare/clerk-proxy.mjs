const prefix = '/api/__clerk';
const unavailable = () => Response.json({ error: 'MIGRATION_AUTH_NOT_CONFIGURED' }, {
  status: 503, headers: { 'Cache-Control': 'no-store' },
});

export async function migrationClerkProxy(request, env, upstreamFetch = fetch) {
  if (!env.CLERK_SECRET_KEY?.startsWith('sk_live_') ||
      !env.CLERK_PUBLISHABLE_KEY?.startsWith('pk_live_') || !env.INVEST_MIGRATION_ORIGIN)
    return unavailable();
  try {
    const source = new URL(request.url);
    const canonical = new URL(env.INVEST_MIGRATION_ORIGIN);
    if (canonical.protocol !== 'https:' || canonical.origin !== env.INVEST_MIGRATION_ORIGIN ||
        source.origin !== canonical.origin ||
        (request.headers.has('Origin') && request.headers.get('Origin') !== canonical.origin))
      return new Response(null, { status: 403 });
    if (source.pathname !== prefix && !source.pathname.startsWith(prefix + '/'))
      return new Response(null, { status: 404 });
    const target = new URL('https://frontend-api.clerk.dev');
    target.pathname = source.pathname.slice(prefix.length) || '/';
    target.search = source.search;
    const headers = new Headers(request.headers);
    for (const name of ['host', 'connection', 'content-length', 'x-forwarded-host',
      'x-forwarded-proto', 'x-forwarded-for', 'clerk-secret-key', 'clerk-proxy-url']) headers.delete(name);
    headers.set('Clerk-Proxy-Url', canonical.origin + prefix);
    headers.set('Clerk-Secret-Key', env.CLERK_SECRET_KEY);
    const ip = request.headers.get('CF-Connecting-IP');
    if (ip) headers.set('X-Forwarded-For', ip);
    const response = await upstreamFetch(target.toString(), {
      method: request.method, headers, redirect: 'manual',
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      signal: AbortSignal.timeout(10000),
    });
    const outputHeaders = new Headers(response.headers);
    for (const name of ['content-encoding', 'content-length', 'transfer-encoding',
      'connection', 'clerk-secret-key', 'clerk-proxy-url']) outputHeaders.delete(name);
    outputHeaders.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, headers: outputHeaders });
  } catch {
    return unavailable();
  }
}
