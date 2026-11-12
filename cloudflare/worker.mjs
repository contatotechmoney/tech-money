// Migration staging only: never proxies requests or grants access to production.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/migration/health' && request.method === 'GET') {
      return Response.json({ environment: env.INVEST_PORTAL_MODE==='owner-production'?'owner-production':'migration-staging', realAnalysisEnabled: false,
        authenticationReady: false, databaseReady: false },
        { headers: { 'Cache-Control': 'no-store' } });
    }
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return Response.json({ error: 'MIGRATION_NOT_READY' }, {
        status: 503, headers: { 'Cache-Control': 'no-store' }
      });
    }
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
    return env.ASSETS.fetch(request);
  }
};
