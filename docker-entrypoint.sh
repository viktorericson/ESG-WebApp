#!/bin/sh
# Opdaterer databasen til nyeste skema og starter appen.
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL mangler – sæt den som miljøvariabel." >&2
  exit 1
fi

if [ "$SKIP_MIGRATIONS" != "true" ]; then
  npx prisma migrate deploy
fi

# En ny database har ingen emissionsfaktorer – uden dem kan der ikke beregnes CO2e. Importeres kun, når der ingen er.
status=0
node scripts/has-factors.mjs || status=$?
if [ "$status" = "3" ]; then
  echo "Ingen emissionsfaktorer i databasen – importerer Klimakompassets faktorark."
  npx tsx scripts/import-klimakompasset.ts data/factors/klimakompasset_emissionsfaktorark_2015-2035_2024_v5.xlsx --default
elif [ "$status" != "0" ]; then
  echo "Kunne ikke tjekke emissionsfaktorer – appen starter alligevel." >&2
fi

exec npx next start
