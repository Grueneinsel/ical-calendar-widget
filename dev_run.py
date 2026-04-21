#!/usr/bin/env python3
"""dev_run.py — starts HTTP server + bundler watch mode.
When the server stops (Ctrl+C), the bundler is terminated automatically."""
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
PORT = 8080

def main():
    bundler = None
    server  = None
    try:
        bundler = subprocess.Popen(
            [sys.executable, str(ROOT / "bundler.py"), "--watch"],
            cwd=str(ROOT)
        )
        time.sleep(2)

        DEV_URL = (
            f"http://localhost:{PORT}/dist/widget.html"
            f"?url=https%3A%2F%2Fcalendar.google.com%2Fcalendar%2Fical%2F"
            f"c77f5869d3e32b0381ec5ecc6a7d91b0b357ffe6a9cb989fc5f25bcf3b19dec8"
            f"%2540group.calendar.google.com%2Fpublic%2Fbasic.ics"
            f"&dev"
        )
        webbrowser.open(DEV_URL)

        server = subprocess.Popen(
            [sys.executable, "-m", "http.server", str(PORT)],
            cwd=str(ROOT)
        )
        print(f"Dev-URL: {DEV_URL}")
        print("Quellen: Dateien in css/ und js/ direkt bearbeiten")
        print("Drücke Ctrl+C zum Beenden.")
        server.wait()

    except KeyboardInterrupt:
        print("\nStopping…")
    finally:
        for p in (server, bundler):
            if p and p.poll() is None:
                try:
                    p.terminate()
                    p.wait(timeout=3)
                except Exception:
                    try: p.kill()
                    except Exception: pass
        print("Beendet.")

if __name__ == "__main__":
    main()
