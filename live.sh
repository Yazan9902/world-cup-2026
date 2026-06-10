#!/usr/bin/env bash
# WC26 — local live mode
# Re-fetches matches.json every 60s so scores stay current while you watch.
# Run this in one terminal during a match day, and the preview/site in another.
#
#   ./live.sh
#
# Reads the token from the FOOTBALL_DATA_TOKEN env var, or from a local .env file.

set -euo pipefail
cd "$(dirname "$0")"

# load .env if present (never commit this file)
if [[ -f .env ]]; then
  set -a; source .env; set +a
fi

if [[ -z "${FOOTBALL_DATA_TOKEN:-}" ]]; then
  echo "Set FOOTBALL_DATA_TOKEN (env var or .env file) first." >&2
  exit 1
fi

echo "🔴 WC26 live mode — refreshing every 60s. Ctrl+C to stop."
while true; do
  python3 fetch_matches.py || echo "(fetch failed, retrying next cycle)"
  sleep 60
done
