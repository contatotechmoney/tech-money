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


## Statement acceptance checkpoint

The owner explicitly confirmed review and authorized saving the source statement
for the acceptance test. The source date was confirmed separately from download
date. No save has occurred: the previous authenticated session expired and a
fresh owner sign-in link was requested through the existing bounded login UI.
Do not treat this checkpoint as a completed acceptance save.

The latest prepared client includes a private saved-statement list and Reopen
button. Collection reads now remain available when statement writes are disabled,
so shutting off saving does not hide a previously saved statement. Eleven affected
tests passed again, including disabled-write history reads and cross-owner denial.
Current preview: `9c3b148f-114d-4daf-8090-0c34e483b3aa`, write switch absent.

After a verified renewed owner session, enable only the dedicated statement
write switch for the authorized acceptance run, save the reviewed snapshot, reload
and re-open it from the database. Then disable statement saving again while the
main portal cutover remains unfinished. Never enable transaction writes, inference,
provider delivery, budgets or credit deductions as part of this acceptance run.


## Date entry acceptance correction

The owner renewed sign-in and the original workbook loaded in the authenticated
published portal. The dedicated statement gate was temporarily enabled for the
explicitly authorized test; inference and transaction write gates stayed off.
The first Save attempt carried a malformed year from the native date control.
Server date validation refused it. A subsequent read-only Supabase query showed
zero snapshots, zero trades, one original account and two original audit events.

The client date field now uses explicit dd/mm/aaaa text with full-year and calendar
validation, rather than a native segmented date picker. TypeScript/build passed;
five affected server tests passed, including the malformed-year regression.
Published acceptance version: `87cbfa22-8286-4c64-9845-8022a310c380`.
The original Chrome session remains the authenticated test surface; native input
control was unreliable, so the owner was asked to refresh, select the same file,
enter the already confirmed date and click Save. Do not claim a saved snapshot or
successful reread until the server row and authenticated reopen are verified.
The temporary statement gate is still enabled only behind the unchanged exclusive
owner authentication; disable it again immediately after this acceptance run.
The checked-in normal Worker configuration still omits this gate.

## Acceptance closed — 2026-10-19

The owner supplied UI evidence of the saved statement reopened from the private
area, dated 16/10/2026, with all four sheet totals matching and 14 positions.
A subsequent live read-only Supabase query confirmed one saved statement,
14 positions and one snapshot matching the active verified owner linkage.
Trade records remain zero, original pilot accounts one and original audit events two.

Published version `414cc8ea-0616-408f-bbe0-063a72cb6702` with the normal
`wrangler.migration.json`: the temporary statement write switch is absent again.
Saved history remains readable when that switch is absent. Eleven affected
statement/portal tests passed. Real analysis, billing and routine record writes
remain disabled. The production Invest hostname and original Replit login were
not changed. The source export equality check still needs refreshing before
cutover; the final hostname callback and rollback checks remain pending.

## Reconciliation and final-origin preparation — 2026-10-19

Read-only full-row JSON content fingerprints and counts were compared for all
16 existing Replit source tables. Fifteen matched immediately, excluding only
the known destination-only fictional portfolio study from the destination
comparison. Source suitability_profiles had two rows while destination had one.
A private source backup and conflict-rejecting restore transaction were prepared
outside Git. The transaction inserted only the missing row. The subsequent
destination count (2) and content fingerprint matched source. No identity was
merged, source record changed, audit replaced or destination study removed.
This check is current evidence, not a frozen cutover snapshot: source writes
are still available and require one final reconciliation in the cutover window.

The final origin is `https://invest.techmoney.com.br`; the exact Supabase
redirect allowlist entry required is
`https://invest.techmoney.com.br/migration/callback`. Existing preview entries
must remain until cutover validation finishes. The Worker origin variable must
change together with hostname routing, never independently while the preview
is in use. Browser cookies are host-only: the owner must sign in anew on the
final hostname; do not copy session cookies or tokens across hosts.
Eleven login/identity mocked tests pass, including fixed final-domain callbacks,
server-chosen owner email, rejection of the previous origin and closed execution.
Live allowlist, DNS/route rollback target and final-host sign-in remain pending;
no production route, login or authentication permission was changed here.

## Final hostname routed — 2026-10-19, owner sign-in pending

The exact `invest.techmoney.com.br/*` route now points at the existing
`techmoney-invest-migration` Worker. Only the Invest A-record proxy changed from
DNS-only to proxied; its origin IP was preserved in the private rollback record.
The existing root/www routes and all unrelated services were left intact.
Supabase Site URL is now `https://invest.techmoney.com.br/migration/login`;
both exact preview and production callback entries are retained.

Worker version `a4bd72f1-5bb0-4320-9521-ec3f2860df6f` uses the production origin
and owner-production presentation. Root redirects to login, the final login
returns HTTPS 200 with no-store and restrictive CSP, public portfolio access
without a session returns 401, and health explicitly reports real analysis off.
The browser initially retained the old DNS result, then reloading showed the
new production login. Email request hit the pre-existing two-per-hour rate cap;
that protection was not reduced or bypassed. Owner live sign-in, account view
and saved statement on this hostname still require acceptance.

All sixteen source content signatures were re-read after routing and match the
last reconciled source signatures, including the transferred second suitability
profile. The separate destination snapshot and fictional study remain preserved.
No source writes were enabled, source deployment deleted, inference activated
or original Clerk identities changed. Ordinary portfolio/profile writes and
new statement saves remain disabled pending their separate acceptance.

Use `wrangler.production.json` for this routed Worker. The preview configuration
is now only for an explicit coordinated rollback: deploying it to the same
Worker without removing/restoring the route would break the final-domain login.
A private rollback JSON records old DNS, version, origin and the exact reverse
sequence. Replit cancellation is still unsafe until final-host owner acceptance,
recording acceptance and other Replit service/charge inventory are complete.

### Email delivery acceptance blocker

After the local hourly cap renewed, the provider rejected `/otp` with
`429: email rate limit exceeded`, confirmed in Supabase auth service logs.
No new production-host email was confirmed sent. Existing protections were
not bypassed, cleared or weakened. Version
`3f52aa77-78be-478a-975b-0b8988b38c67` returns a safe `EMAIL_RATE_LIMITED`
response for provider 429 and explains the temporary email quota in the UI;
other provider details are never exposed. Seventeen auth/gateway tests pass.
Wait for provider allowance before requesting the next owner link; do not
consume retries blindly, migrate browser cookies or reuse consumed links.
The final-domain owner session and private screens remain unverified until
that login is completed. DNS routing is active, which is not evidence that
the authenticated product acceptance or Replit cancellation is complete.

### Final-host email request accepted — 2026-10-19 evening

A single new request from the final-domain login was accepted after the provider
quota renewed. The browser displayed the successful instruction to check email.
Inbox receipt and owner sign-in have not yet been confirmed. The owner was asked
to open the newest email and enter the Invest portal without sharing any token
or code. A fresh read-only check still reports realAnalysisEnabled false and
unauthenticated session access 401. No limits or identity mappings changed.

### Final-domain owner sign-in and private reads verified — 2026-10-19

The owner opened the newest email and entered Invest. Native Chrome UI confirmed
`invest.techmoney.com.br/investments/agents`, the authorized owner email, the
production-mode closed-execution banner and restored historical reports.
On the same authenticated final hostname, saved statement history was visible
and reopening the existing 16/10/2026 snapshot returned 14 positions, all four
sheet comparisons matching and the preserved total. Save remained disabled;
no new statement or trade record was created. The investor profile and report
history also loaded from the restored account.

A page reload was initiated, but the user switched Chrome windows before its
result could be observed. Do not claim session-after-reload acceptance from
that action. Owner sign-in and the four private screen reads themselves were
verified before the window switch. Evidence screenshot is stored outside Git.
Real analysis, credits, billing and record writes remain blocked. Remaining
cancellation gates include recording acceptance and the inventory of other
Replit apps/deployments/charges; no subscription cancellation was performed.
