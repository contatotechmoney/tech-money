# Invest: report schema repair and authenticated simulation

## Scope

No production write or publication is performed by these changes. The institutional
site, Clerk settings/MFA, Supabase registration, DNS, permission records and provider
secrets stay unchanged. No existing account is promoted.

The real Hermes registration is disabled regardless of environment flags.
Legacy refresh and its private generator also reject execution before market/AI calls.
The simulations are fixed local demonstrations, not investment advice or inference.
They do not create investment reports, professional decisions, messages or credit entries.

## Development schema preparation

`sql/investment-development-additions.sql` is **development only**, transactional and
idempotent. It adds the missing review/authorization structures and simulation history.
It does not replay the old migration journal or modify existing documents/decisions.
Do not execute it on application startup, in a deployment build or against production.

The independent simulation table is also declared in `shared/schema.ts` and migration
`0014_investment_simulation.sql`. Requests are unique per user; history and details
always filter by the authenticated Clerk ID. React query caches and component state
are also scoped/remounted by account.

Missing review relations/columns produce explicit `503 INVESTMENT_SCHEMA_UNAVAILABLE`,
not empty report lists or market-data errors. Loading, empty and error states remain
distinct. Report recommendations still require the existing profile/version/credential
and authorization checks.

## Simulation endpoints

All use existing Clerk authentication and the existing Supabase profile gate:

- `GET /api/investments/simulation-options`: allowed demonstration tickers and zero cost.
- `GET /api/investments/simulations`: the user's last 30 studies.
- `POST /api/investments/simulations`: strict `{ticker, requestKey}` input.
- `GET /api/investments/simulations/:id`: the user's study only.

Queued/running/completed are deterministic presentation stages over eight seconds,
derived from the stored creation time. They are not real background jobs.
Retries reuse a request key; conflicting reuse, concurrent starts and a daily
demonstration limit return explicit errors. Results always say fictional data,
zero tokens, zero real credits and blocked recommendations. No approval/send action.

## Verification

- `npm run check`
- `npm run build`
- `npm run test:invest-simulation` (no DB/provider secrets, fake authentication and stores)
- `sql/investment-development-validation.sql` via development SQL only:
  transaction-contained fake records, review/audit immutability, renewal version,
  no self-assignment, user-scoped idempotency, supported tickers, full rollback.
- Managed Publish schema diff: review all statements and reject any destructive changes.

**Publication checkpoint:** the inspected managed diff includes tables, constraints and
indexes, but does not include the two governance functions or their three triggers.
Do not assume publication copies those objects. Their presence must be confirmed
through a supported publication path before enabling professional decisions.
The server now refuses review authorization unless all three canonical triggers are
present and enabled with their expected functions. Partial schema cannot release advice.

The publishing diff also misrendered the shorthand boolean check `CHECK (singleton)`.
The equivalent explicit check `CHECK (singleton = true)` produces valid SQL; the
generated additive diff is syntax-tested in a disposable development schema and rolled back.

## Complete governance release preparation

`0015_investment_governance_controls.sql` versions the canonical two functions and
three triggers independently of the old migration journal. It is a development
migration, not a production-targeted script. Never attach it to build/startup.
No accounts are provisioned and no role/permission records are inserted.

`sql/investment-release-readiness.sql` is a read-only, metadata-only release gate:
21 checks cover required tables, exact function-body fingerprints, trigger bindings,
events/enabled state, valid indexes and non-cascading foreign keys. It reads no client
records. Every check must pass before approving production readiness.

The runtime authorization guard also checks canonical bodies and trigger events.
An enabled but replaced/no-op audit function cannot authorize professional advice.
Tests deliberately disable a trigger and replace a function only in the disposable
synthetic PostgreSQL cluster; authorization fails and canonical controls are restored.

**Still blocked:** versioning SQL does not prove the managed Publish flow will
transport functions/triggers. The observed live diff still omits them. No custom
production runner, startup DDL or deployment hook is introduced to bypass that limit.
The transport must be confirmed through a supported platform path before publishing.
