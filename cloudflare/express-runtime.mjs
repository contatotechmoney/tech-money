import {supabaseMigrationStatus} from './supabase-auth/identity.mjs';
import {supabaseIdentityStore} from './supabase-auth/store.mjs';
import express from 'express';
import { createServer } from 'node:http';
import { httpServerHandler } from 'cloudflare:node';
import stagingGateway from './worker.mjs';
import { pilotMigrationStatus } from './pilot-status.mjs';
import { privateServices } from './private-services.mjs';
import { migrationClerkProxy } from './clerk-proxy.mjs';

// This bridge validates Express inside Workers without importing the legacy
// startup, database singleton, background jobs, or Replit connectors.
const app = express();
app.disable('x-powered-by');
app.get('/api/migration/runtime', (_request, response) => {
  response.set('Cache-Control', 'no-store').json({
    runtime: 'cloudflare-express',
    realAnalysisEnabled: false,
    authenticationReady: false,
    databaseReady: false,
  });
});
app.use((_request, response) => {
  response.status(503).set('Cache-Control', 'no-store').json({ error: 'MIGRATION_NOT_READY' });
});
const server = createServer(app);
const expressHandler = httpServerHandler(server);

export default {
  async fetch(request, env, context) {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/__clerk' || pathname.startsWith('/api/__clerk/')) {
      return migrationClerkProxy(request, env);
    }
    if (pathname === '/api/migration/supabase-status') {
      return supabaseMigrationStatus(request, env, supabaseIdentityStore);
    }
    if (pathname === '/api/migration/pilot-status') {
      return pilotMigrationStatus(request, env, privateServices);
    }
    if (pathname === '/api/migration/runtime' && request.method === 'GET') {
      return expressHandler.fetch(request, env, context);
    }
    return stagingGateway.fetch(request, env, context);
  },
};
