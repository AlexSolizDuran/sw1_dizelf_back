#!/usr/bin/env bash
# Levanta backend + front para la prueba de navegador y deja los PIDs anotados.
set -u

export NEON_DB_URL="postgresql://postgres@localhost:55432/dizelf_browser?host=/tmp/opencode"
export NEON_DIRECT_URL="$NEON_DB_URL"
export PORT=3097
export NODE_ENV=test
export JWT_SECRET="browser_secret_de_prueba_largo_32_chars"
export FRONTEND_URL="http://localhost:3096,http://localhost:3000"
export COOKIE_SECURE=false

BACK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRONT_DIR="$(cd "$BACK_DIR/../dizelf_front" && pwd)"

echo "── backend"
( cd "$BACK_DIR" && node dist/main.js > /tmp/opencode/browser-back.log 2>&1 & echo $! > /tmp/opencode/back.pid )

for i in $(seq 1 40); do
  curl -s -o /dev/null --max-time 2 http://localhost:3097/ && break
  sleep 1
done
curl -s -o /dev/null -w "  backend / → %{http_code}\n" http://localhost:3097/

echo "── front"
# El front tiene que COMPILARSE con la URL del backend. `NEXT_PUBLIC_API_URL`
# se hornea en el bundle durante el build, así que ponerla al hacer `next start`
# no alcanza: el bundle seguiría apuntando al :3001 por defecto y ni el fetch ni
# el CSP dejarían pasar las llamadas. Por eso el build va aquí y no aparte.
( cd "$FRONT_DIR" || exit 1
  NEXT_PUBLIC_API_URL="http://localhost:3097" npm run build > /tmp/opencode/browser-front-build.log 2>&1
  NEXT_PUBLIC_API_URL="http://localhost:3097" npx next start -p 3096 > /tmp/opencode/browser-front.log 2>&1 &
  echo $! > /tmp/opencode/front.pid
)

for i in $(seq 1 60); do
  curl -s -o /dev/null --max-time 2 http://localhost:3096/ && break
  sleep 1
done
curl -s -o /dev/null -w "  front / → %{http_code}\n" http://localhost:3096/

# Si el build quedó apuntando a otro lado, la prueba falla por todos lados con
# errores de red que no dicen nada. Mejor avisarlo acá.
if ! grep -rq "localhost:3097" "$FRONT_DIR/.next/static/chunks/" 2>/dev/null; then
  echo "  ✗ el bundle del front no contiene la URL del backend (revisá el build)"
  exit 1
fi

echo "listo"