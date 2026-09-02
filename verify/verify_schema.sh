#!/usr/bin/env bash
# ===========================================================================
#  Applies database/schema.sql to a real PostgreSQL database twice (it must be
#  idempotent) and checks the BiteN Go tables exist.
#
#    DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/biten_go_db \
#      bash verify/verify_schema.sh
# ===========================================================================
set -e
cd "$(dirname "$0")/.."

if [ -z "$DATABASE_URL" ] && [ -f backend/.env ]; then
  DATABASE_URL=$(grep -E '^DATABASE_URL=' backend/.env | cut -d= -f2-)
fi
if [ -z "$DATABASE_URL" ]; then
  echo "Set DATABASE_URL first (or fill in backend/.env)." >&2
  exit 1
fi

echo "== applying schema.sql (first run) ======================================"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f database/schema.sql
echo "== applying schema.sql again (must not fail) ============================"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f database/schema.sql

COUNT=$(psql "$DATABASE_URL" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
echo "Tables in public schema: $COUNT"
[ "$COUNT" -ge 12 ] || { echo "Expected at least 12 tables." >&2; exit 1; }
echo "Schema verified."
