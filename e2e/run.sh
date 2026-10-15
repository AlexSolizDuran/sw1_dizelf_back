#!/usr/bin/env bash
# Levanta el backend contra la base de prueba y corre el E2E de colaboración.
set -u

export NEON_DB_URL="postgresql://postgres@localhost:55432/dizelf_e2e?host=/tmp/opencode"
export NEON_DIRECT_URL="$NEON_DB_URL"
export PORT=${E2E_PORT:-3099}
export NODE_ENV=test
export JWT_SECRET="e2e_secret_de_prueba_largo_32_chars_minimo"
export FRONTEND_URL="http://localhost:$PORT,http://localhost:3000"
export COOKIE_SECURE=false

cd "$(dirname "$0")/.."

echo "── compilando"
npm run build >/dev/null 2>&1 || { echo "build falló"; exit 1; }

echo "── levantando el server"
node dist/main.js > /tmp/opencode/e2e-server.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT

for i in $(seq 1 30); do
  if curl -s -o /dev/null --max-time 2 http://localhost:$PORT/; then break; fi
  sleep 1
done

echo "── E2E de colaboración (presencia + sync)"
node e2e/colaborativo.e2e.js
SALIDA=$?

echo
echo "── E2E de contratos de UI (colaboradores + versiones)"
node e2e/ui-contratos.e2e.js
SALIDA=$((SALIDA + $?))

echo
echo "── log del servidor (últimas líneas relevantes)"
grep -E "Sync|Presencia|WARN|ERROR" /tmp/opencode/e2e-server.log | sed 's/\x1b\[[0-9;]*m//g' | tail -25

exit $SALIDA