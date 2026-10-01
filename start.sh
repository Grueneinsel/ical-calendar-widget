#!/usr/bin/env bash
set -e

echo "========================================"
echo "  iCal Kalender-Widget"
echo "  http://localhost:8080/dist/widget.html"
echo "  Beenden: Strg+C"
echo "========================================"
echo

# dev_run.py startet Bundler (watch) + HTTP-Server zusammen.
# Beide stoppen automatisch bei Strg+C.

cd "$(dirname "$0")"

if command -v python >/dev/null 2>&1; then
  python tools/dev_run.py || python3 tools/dev_run.py
else
  python3 tools/dev_run.py
fi

read -r -p "Beendet. Enter drücken zum Schließen..." _
