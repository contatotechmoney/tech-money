# Invest migration staging

Source snapshot: GitHub PR 3, 5ebdbffa405bf6d059353d14a48461f1028ea72a.

This is an isolated migration baseline, not a working migrated portal. The live
Invest domain, source production database, credentials, owner grant and billing
settings are unchanged. The new empty Supabase project has its schema baseline.

The isolated Worker serves compiled client assets and blocks all API traffic with
503. It never proxies to Replit. Public workers.dev and preview URLs are disabled.
The portable frontend build excludes Replit plugins. Existing Node entrypoint is
unchanged so the source remains comparable to the live application.

Next gates:
1. Identify the existing Supabase project and Cloudflare account without exporting secrets.
2. Audit full production schema, routines, triggers, policies and backup/restore path;
   don't rely on table-only schema diffs. Restore to an isolated migration schema/project.
3. Validate the Express/Clerk proxy under Workers and a restricted PostgreSQL connection.
   Keep Clerk production subject IDs; changing to Supabase Auth is a separate migration.
4. Port transactional locks, audit integrity and exact owner binding; never use memory fallback.
5. Run synthetic auth, ownership, budget, expiry, duplicate and failure checks in Workers.
6. Verify restored data and authentication before switching any hostname.

No real inference, market lookup, messaging, paid calls or production DDL is part
of this baseline. Never ship the staging placeholder as the functional portal.

## Validated local stage

Frontend build passed on 2026-10-13 without Replit Vite plugins. Lockfile internal
Replit tarball hosts were replaced with public npm URLs; versions and integrity
hashes remain unchanged. Invest synthetic suite: 156 passed. Migration gateway
and database configuration: 7 passed. Supabase empty baseline applied and verified:
18 tables, 3 enabled triggers, 0 owner bindings, 0 anon/authenticated table grants.
No production data was transferred. No Cloudflare runtime auth/DB connection has
been validated yet. The database-config module is preparatory and not wired to
the Worker. Next: port server request lifecycle, then validate Clerk and private
PostgreSQL connectivity with actual Cloudflare runtime before routing a domain.

## Express runtime bridge validated locally

On 2026-10-13 Express started in Cloudflare workerd (Wrangler 4.150.0).
Node-target bundling preserves iconv-lite streaming modules; browser-target
bundling crashed during startup. The bridge uses the official httpServerHandler.
12 HTTP checks passed: Express readiness, gateway readiness, protected API
GET/POST refusal, non-API write refusal and SPA assets. 7 unit checks passed.
No credentials, database queries, authentication, inference or deployment were
used. Existing business routes are not connected to this bridge yet.

Local command (keeps Wrangler state/logs inside temporary writable directories):
```sh
XDG_CONFIG_HOME=/tmp/techmoney-wrangler-config WRANGLER_LOG_PATH=/tmp/techmoney-wrangler.log WRANGLER_SEND_METRICS=false npx wrangler dev --config wrangler.migration.json --local --ip 127.0.0.1 --port 19623
```
Then `npm run test:migration-runtime`. Next: request-scoped PostgreSQL adapter
and same-instance Clerk authentication, followed by isolated business-route tests.

## Private connection adapter (prepared, not configured)

Added a request-scoped pg Client to the exact new Supabase project, with verified
TLS and read-only transactions. Added production Clerk session/email verification,
exact owner-reference matching, and read-only durable binding/audit verification.
The native Worker Clerk proxy fixes the upstream and canonical origin; it rejects
browser-supplied forwarding identity. No execution route was enabled.

Validation: 17 unit tests and 14 local workerd HTTP checks passed. The empty schema
replay still passes (18 tables, 3 triggers) using a repository-local PGlite dependency.
Live Replit account verification was refreshed: official session and existing owner
binding remain confirmed. This is not evidence of a migrated login.

Cloudflare account currently has no Invest migration Worker, secrets or private
origin. Real login and Supabase connectivity have therefore NOT been validated
in Cloudflare. The Supabase binding/audit still needs a reviewed source restore.
See private-configuration.md for required server-only settings.
