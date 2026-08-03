#!/usr/bin/env bash
# Arrête les serveurs de dev (Django 8000, proxy 8001, Expo 8081).
set -euo pipefail

PORTS=(8000 8001 8081)
FOUND=0

for port in "${PORTS[@]}"; do
  pids=$(lsof -ti ":$port" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    FOUND=1
    echo "Port $port → arrêt PID(s): $(echo "$pids" | tr '\n' ' ')"
    echo "$pids" | xargs kill 2>/dev/null || true
  fi
done

if [[ "$FOUND" -eq 0 ]]; then
  echo "Aucun serveur en cours sur les ports 8000, 8001 ou 8081."
else
  sleep 1
  echo "Serveurs arrêtés. Relance avec: ./start.sh"
fi
