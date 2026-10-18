# Private migration configuration

Target: `techmoney-invest-migration`, project `igxtlcbyucshupsldijj`.
The current Invest domain and Replit publication are still the active portal.
Do not change sistema, Finance, DNS, old login or existing secret values as a side effect.

## Current authentication

The new portal uses Supabase Auth, not Replit-managed Clerk. The verified new
identity maps to the original account through `invest_auth_identity_links`.
Original user IDs, account state and audit records must remain unchanged.
The exclusive owner has confirmed this mapping; the four main authenticated
screens were verified on 2026-10-18. Previous Clerk proxy modules are diagnostic
legacy code and are not the portal authentication path.

Server-only configuration lives in Cloudflare storage:

- `INVEST_SUPABASE_URL`: the exact Supabase project URL.
- `INVEST_SUPABASE_PUBLISHABLE_KEY`: the project's public/publishable key, never a service-role key.
- `INVEST_MIGRATION_OWNER_EMAIL`: the exact verified owner email.
- `PORTFOLIO_PILOT_PRODUCTION_OWNER_REFERENCE`: original account subject, never a display-name match.
- `INVEST_MIGRATION_RATE_KEY`: private HMAC key for bounded login delivery.
- `INVEST_MIGRATION_ORIGIN`: exact HTTPS migration origin.
- `INVEST_DATABASE`: Hyperdrive binding `090bdfc5d2a8489eb1ccb8ea766e8566`.
- `INVEST_DATABASE_PROJECT`: `igxtlcbyucshupsldijj`.

The legacy `INVEST_DATABASE_URL` is diagnostic only; the portal has no fallback to it.
Hyperdrive validates origin TLS with the official Supabase CA, verify-full, with
query caching disabled. Do not weaken TLS or export the database password.
Data API remains off; anon/authenticated/public table grants remain revoked.

## Recording and execution boundaries

New fictional study creation uses only the two simulation tables and deterministic
shared presentation functions. It does not accept real positions or models,
contact providers, approve costs, debit credits or issue orders.

`INVEST_MIGRATION_RECORD_WRITES` is intentionally absent. Portfolio/profile
recording functions refuse all writes unless this server setting is explicitly
`enabled`. Do not enable it while Replit and Cloudflare are competing writers.
A future cutover must reconcile records first and establish a single writer.
This switch cannot enable analysis, billing, delivery, model selection or execution.

All real inference and billing paths remain blocked. Do not add Nous/LLM secrets
or execution flags during migration. Budgets and approvals are not created by
account linkage, data restoration or routine record entry.

## Verified data and remaining work

All 16 source database tables were privately archived and restored exactly on
2026-10-16, including 86 reports, five simulations, one suitability profile,
original account, original binding and two original audit records.
The private backup is outside Git and includes hashes and restoration verification.
Two managed production identities were inventoried without merging them by name.
The Replit object-storage screen showed no buckets.

Before cancellation: renew the official publisher login, deploy and test new
simulations, finish recording workflow verification, reconcile source changes,
verify rollback, move the Invest domain and verify operation without Replit.
Replit cancellation is not yet safe. See `supabase-auth/readiness.json` for the
most recent verified state, including what was prepared versus actually published.

Never send secrets through chat, commit private exports, dump keychain values,
copy values from unrelated services, or claim local tests as a completed cutover.
