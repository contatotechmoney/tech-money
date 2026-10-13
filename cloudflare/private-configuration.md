# Private migration configuration

Target: techmoney-invest-migration only. Do not modify sistema, Finance,
Replit deployment secrets, or the invest.techmoney.com.br route.

No Nous/LLM secrets or execution flags belong in this environment.

Server bindings (enter values directly into Cloudflare secret storage):

| Name | Source / purpose |
| --- | --- |
| CLERK_SECRET_KEY | Existing Replit production Clerk instance, sk_live_ key; never create a replacement identity instance |
| CLERK_PUBLISHABLE_KEY | Same instance's pk_live_ key |
| PORTFOLIO_PILOT_PRODUCTION_OWNER_REFERENCE | Existing verified production owner's subject; no name/email guessing |
| INVEST_DATABASE_URL | New Supabase project's private PostgreSQL connection; sslmode=verify-full; project igxtlcbyucshupsldijj |
| INVEST_MIGRATION_ORIGIN | Exact HTTPS origin of the isolated migration environment, without path/trailing slash |

The database reader only queries binding/account/audit proof under BEGIN READ ONLY.
It does not migrate source records, create an owner grant, or approve a budget.
If the original binding and its audit have not been restored, it returns
OWNER_BINDING_NOT_RESTORED. Never replace this result with a successful local fake.

Cloudflare access authorization is separate from database and Clerk credentials.
No secrets should be sent through chat, committed, embedded in frontend assets,
or displayed in logs/screenshots. Adding a new private credential is a user handoff.
Current public Workers/preview URLs remain disabled. Only a controlled private
origin may be enabled after access protection is in place and verified.

Required before domain cutover: verify same production subject with the same
Clerk instance, restore and reconcile source data/audit, confirm exclusive owner,
test simulations in the new environment, keep inference blocked, verify rollback.
