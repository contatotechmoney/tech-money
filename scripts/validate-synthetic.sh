#!/usr/bin/env bash
set -euo pipefail

# Always create a private, disposable PostgreSQL cluster. Never use workspace DB credentials.
for tool in initdb pg_ctl createdb; do
  command -v "$tool" >/dev/null || { echo "Validation requires PostgreSQL tools: $tool"; exit 1; }
done
root=$(mktemp -d /tmp/invest-synthetic-XXXXXX)
cleanup() {
  pg_ctl -D "$root/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf -- "$root"
}
trap cleanup EXIT
mkdir "$root/socket"
initdb -D "$root/data" -U synthetic -A trust --no-locale >/dev/null
# Unix socket only: no TCP listener or access to another database.
pg_ctl -D "$root/data" -l "$root/postgres.log" -o "-k $root/socket -h '' -p 6543" -w start >/dev/null
createdb -h "$root/socket" -p 6543 -U synthetic synthetic_invest
env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD -u PGDATABASE \
  -u HERMES_API_KEY -u HERMES_ANALYSIS_ENABLED -u HERMES_BASE_URL \
  -u LLM_API_KEY -u OPENAI_API_KEY -u LLM_API_BASE -u LLM_MODEL \
  -u WHATSAPP_ACCESS_TOKEN -u WHATSAPP_PHONE_NUMBER_ID -u DELIVERY_EMAIL_FROM \
  -u INVEST_BUSINESS_LEADS_ENABLED \
  -u RESEND_WEBHOOK_SECRET -u WHATSAPP_APP_SECRET -u WHATSAPP_WEBHOOK_VERIFY_TOKEN \
  -u CLERK_SECRET_KEY -u CLERK_PUBLISHABLE_KEY -u VITE_CLERK_PUBLISHABLE_KEY \
  -u SESSION_SECRET \
  -u RESEND_API_KEY -u SUPABASE_LEADS_SERVER_KEY -u STRIPE_SECRET_KEY -u STRIPE_API_KEY -u STRIPE_WEBHOOK_SECRET \
  PGHOST="$root/socket" PGPORT=6543 PGUSER=synthetic PGDATABASE=synthetic_invest \
  DATABASE_URL="postgresql://synthetic@/synthetic_invest?host=$root/socket&port=6543" \
  SYNTHETIC_DATABASE=1 bash -c 'npm run validate && npm run test:review-db && npm run test:quality && npm run test:invest-simulation && npm run test:access'