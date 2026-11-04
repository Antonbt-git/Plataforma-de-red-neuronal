#!/usr/bin/env bash
# NeuroLab Enterprise — arranque local (API + frontend)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: se requiere Python 3.11 o superior."
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: se requiere Node.js 18 o superior."
  exit 1
fi

echo "==> Verificando dependencias del backend..."
if ! (cd "$ROOT/services/api" && python3 -c "import fastapi, uvicorn, sqlalchemy, numpy" >/dev/null 2>&1); then
  echo "    Instalando services/api/requirements.txt..."
  python3 -m pip install -r "$ROOT/services/api/requirements.txt"
fi

echo "==> Iniciando API en http://127.0.0.1:8000"
(
  cd "$ROOT/services/api"
  exec python3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
) &
API_PID=$!

cleanup() {
  echo
  echo "==> Deteniendo API (PID $API_PID)..."
  kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "==> Preparando frontend..."
cd "$ROOT/apps/web"
if [ ! -d node_modules ]; then
  npm install
fi

echo "==> Abriendo interfaz en http://localhost:5173"
echo "    Credenciales demo: admin@neurolab.local / NeuroLab2026!"
npm run dev
