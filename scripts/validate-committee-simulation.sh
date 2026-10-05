#!/usr/bin/env bash
set -euo pipefail
# Dedicated Unix-socket PostgreSQL; never inherit a production DATABASE_URL.
for tool in initdb pg_ctl createdb; do command -v "$tool" >/dev/null || { echo "Missing PostgreSQL tool: $tool"; exit 1; }; done
root=$(mktemp -d /tmp/invest-synthetic-XXXXXX)
cleanup() { pg_ctl -D "$root/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf -- "$root"; }
trap cleanup EXIT
mkdir "$root/socket"
initdb -D "$root/data" -U synthetic -A trust --no-locale >/dev/null
pg_ctl -D "$root/data" -l "$root/postgres.log" -o "-k $root/socket -h '' -p 6544" -w start >/dev/null
createdb -h "$root/socket" -p 6544 -U synthetic synthetic_invest
env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD -u PGDATABASE -u HERMES_API_KEY -u HERMES_ANALYSIS_ENABLED -u LLM_API_KEY -u OPENAI_API_KEY -u LLM_API_BASE -u LLM_MODEL \
 DATABASE_URL="postgresql://synthetic@/synthetic_invest?host=$root/socket&port=6544" SYNTHETIC_DATABASE=1 \
 bash -c './node_modules/.bin/tsc --project tsconfig.committee-simulation.json && npm run db:migrate && ./node_modules/.bin/tsx --tsconfig tsconfig.quality.json --test server/committee-simulation-db.test.ts'
