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

The publisher login was renewed and version `39dea2d7-ad4b-4257-9f37-6b59451fb51a`
was published on 2026-10-18. A new fictional portfolio study was created in the
exclusive owner session, completed all six illustrative stages and remained
available after reload with zero tokens and credits. Anonymous session requests
still return 401. Real execution remains blocked.

Before cancellation: finish recording workflow verification, reconcile source
changes, verify rollback, move the Invest domain and verify operation without
Replit. Also inventory other Replit apps and charges before cancelling the account.
Replit cancellation is not yet safe. See `supabase-auth/readiness.json` for the
most recent verified state, including what was prepared versus actually published.

Never send secrets through chat, commit private exports, dump keychain values,
copy values from unrelated services, or claim local tests as a completed cutover.


## Prepared cutover sequence (not executed)

1. Preserve the private source archive and obtain a fresh read-only export from
   the original production database. The October 16 equality check is historical;
   it is not proof that later source changes have already been transferred.
2. Establish a maintenance window and stop original portal record entry before
   enabling destination entry. Keep old data, deployment and Clerk users intact.
   Do not overwrite the new Cloudflare demonstration during source reconciliation:
   compare source IDs individually and insert missing records, rejecting conflicts.
3. Reconcile original owner account, binding and audit unchanged; compare all 16
   source tables again. Verify the four source/destination record families and
   preserve the separate Supabase identity linkage and new simulation history.
4. Configure the exact final HTTPS origin, Supabase callback allowlist and final
   login redirects together. Current preview login and banner still name the
   migration environment and must be adjusted before the public switch.
5. Save the current DNS/route target and deployment settings for rollback, then
   attach only the Invest hostname to the verified Worker. Do not touch Finance,
   COOP, marketing, interested-party registration, private contacts or Telegram.
6. Enable routine portfolio/profile writes on the destination only after a single
   writer is established. Verify legitimate entries and subsequent reads in an
   isolated acceptance workflow; never add invented holdings to the owner's real
   portfolio. Leave inference, billing, provider delivery and orders blocked.
7. Verify a fresh Supabase login on the final hostname, exclusive account binding,
   restored reports/profile, record persistence, simulations and signed-out access
   denial. Confirm the final client makes no Clerk/Replit runtime requests.
8. Before enabling destination writes, rollback can restore the recorded route
   without destination record divergence. After any destination writes, freeze
   both portals and reconcile those writes before rollback; never send the owner
   back to an outdated writable database.
9. Only declare Replit cancellation safe after final-domain verification, durable
   private backups, preserved account/audit history, successful recording checks
   and an inventory of other apps/deployments/database charges. A successful
   Invest preview alone does not justify cancelling the whole Replit account.

No DNS change, write-switch activation, real execution or cancellation was made
as part of this preparation.


## B3 statement preparation (2026-10-18)

The owner-only migration client now exposes `/investments/portfolio/import-b3`.
CSV is parsed in the browser: no upload endpoint, provider request, localStorage,
database write, analysis, or cost approval is introduced. Maximum 200 KB and
2,000 rows. Required columns: Produto, Instituição, Quantidade; optional statement
price/value columns use Brazilian numeric formatting. Unknown values stay null.
Malformed CSV, conflicting headers, duplicate institution/product positions and
invalid quantities are rejected. Positions never become purchases or cost basis.

The authenticated browser test selected two synthetic positions, showed R$325.00,
kept saving disabled and discarded the preview successfully. The statement date
and explicit review step precede any future save. Saving remains unavailable even
when review is checked. An actual anonymized B3 export must be checked before
claiming compatibility with real B3 layouts; XLSX/PDF are not supported yet.
The separate snapshot persistence model, versioned deduplication and transaction
reconciliation must be designed before enabling import saving.

A fresh READ ONLY Replit production query confirmed the counts of eight principal
tables: reports 86, portfolio simulations 3, stock simulations 2, profile 1,
transactions 0, holdings 0, original pilot account 1, original audit events 2.
These counts match the earlier source archive. This is a count check, not renewed
full equality proof. The additional Cloudflare demonstration is destination-only
and must be preserved during any subsequent source refresh.


## Original B3 XLSX layout verified (2026-10-19)

This supersedes the CSV-only limitation above. The original downloaded workbook
was inspected privately, without adding source data, account IDs or contracts to
Git. The importer accepts the observed Acoes, Empréstimos, Renda Fixa and Tesouro
Direto worksheets, preserves their individual rows and lending nature, and
compares each detail sum to its declared footer. Fixed income explicitly selects
CURVA; other valuation bases are not added to the same position. Account numbers,
CPF and loan contract identifiers are excluded from normalized preview data.

A pinned `read-excel-file` dependency loads on demand from the app's own assets.
Files remain local to the browser; no upload, snapshot write, provider call or
budget approval endpoint has been added. XLSX limits: 2 MB compressed, 8 MB total
expanded ZIP content, 200 ZIP entries and 2,000 positions. Unsupported sheets,
malformed values and encrypted/macro/external-link archives reject. CSV remains
supported. Statement date is manually confirmed and is not inferred from the
filename's download date. A footer mismatch disables the review checkbox.

TypeScript, production client build and seven parser tests passed. The original
workbook matched all four declared totals in both the local parser and actual
browser component; saving remained disabled. Local preview evidence stays outside
Git. Published preview version: `3bdcea86-0735-4022-9408-eed5447a7de7`. The file
selection flow on the authenticated published hostname has not been repeated;
the local browser exercised the same component and browser XLSX dependency.
No original source records or existing login were changed. Replit cancellation
is still unsafe until the migration and final-domain checks are completed.


## Statement snapshot recording prepared (2026-10-19)

`supabase/statement-imports.sql` was applied additively on the exact Invest
Supabase project. Live SQL returned records=0, rls_enabled=true, exposed_grants=0.
Original account, identity mapping, trading records and audit were not rewritten.
The table is separate from transaction and holding history. It stores reviewed,
dated statement snapshots and the verified Supabase reviewer subject.

`INVEST_STATEMENT_IMPORT_WRITES` is intentionally ABSENT. This separate switch
controls only statement persistence, never execution, credits or budgets.
The browser checks the authenticated capability endpoint; false/unavailable keeps
Save disabled. Selecting a file or checking review does not send position data.
Only an explicit Save action after date/review and matching totals may POST the
normalized displayed positions, without the original workbook or account fields.

The server independently verifies the bound owner, exact Origin, body bounds,
strict accepted fields, explicit reviewed=true, date, row keys and per-sheet
sums. It generates a canonical SHA-256 content fingerprint; UNIQUE(owner, hash)
makes retries return the previous snapshot without updates or duplicate records.
Snapshots are appended and read only through owner-scoped routes. There is no
update/delete route, stock order, trade reconstruction, paid model or cost grant.

Eleven affected route/record tests passed, including real PGlite persistence,
repeat imports, alternate-owner reads, absent review, mismatched totals and
cross-origin requests. The table SQL was replayed twice in the isolated test.
Client build and TypeScript passed. Published version:
`51ca30e9-61dd-46ed-9128-5a37914e62bf`. Import write flag remains absent.
No unreviewed real workbook was saved; final authenticated acceptance Save and
reread remain pending before enabling this switch. Preserve any later snapshots
when reconciling the original 16 Replit tables.
