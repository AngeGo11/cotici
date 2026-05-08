#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

if [[ ! -f "$ROOT_DIR/package.json" ]]; then
  echo "Erreur: package.json introuvable a la racine du projet."
  exit 1
fi

if [[ ! -f "$BACKEND_DIR/manage.py" ]]; then
  echo "Erreur: backend/manage.py introuvable."
  exit 1
fi

if [[ -x "$BACKEND_DIR/.venv/bin/python" ]]; then
  PYTHON_CMD="$BACKEND_DIR/.venv/bin/python"
elif [[ -x "$ROOT_DIR/.venv/bin/python" ]]; then
  PYTHON_CMD="$ROOT_DIR/.venv/bin/python"
else
  PYTHON_CMD="python3"
fi

PIDS=()

cleanup() {
  echo
  echo "Arret des serveurs..."
  for pid in "${PIDS[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait || true
  echo "Tous les serveurs sont arretes."
}

trap cleanup INT TERM EXIT

echo "1) Backend Django..."
(
  cd "$BACKEND_DIR"
  "$PYTHON_CMD" manage.py runserver
) &
PIDS+=("$!")

echo "2) Proxy Node..."
(
  cd "$ROOT_DIR"
  npm run proxy
) &
PIDS+=("$!")

echo "3) Frontend Expo..."
echo "Serveurs lances. Utilise i/a/w dans Expo. Ctrl+C pour tout arreter."
cd "$ROOT_DIR"
npm run start
