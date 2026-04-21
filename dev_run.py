#!/usr/bin/env python3
"""dev_run.py — starts HTTP server + bundler watch mode.
When the server stops (Ctrl+C), the bundler is terminated automatically."""
import re
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).parent.resolve()
PORT = 8080

def read_vars():
    """Read calendarUrl and email from js/vars.js."""
    src = (ROOT / "js" / "vars.js").read_text(encoding="utf-8")
    url_m   = re.search(r"calendarUrl\s*:\s*'([^']+)'", src)
    email_m = re.search(r"email\s*:\s*'([^']+)'", src)
    url   = url_m.group(1)   if url_m   else ''
    email = email_m.group(1) if email_m else ''
    return url, email

def fetch_ics(ics_url):
    dest = ROOT / "dist" / "calendar.ics"
    dest.parent.mkdir(parents=True, exist_ok=True)
    print("Lade calendar.ics …", end=" ", flush=True)
    try:
        # decode %40 → @ etc. so the URL is accepted by Google
        try:
            from urllib.parse import unquote
            ics_url = unquote(ics_url)
        except Exception:
            pass
        urllib.request.urlretrieve(ics_url, dest)
        print("OK")
    except Exception as e:
        print(f"FEHLER ({e}) — widget fällt auf CORS-Proxies zurück")

def main():
    bundler = None
    server  = None
    try:
        ics_url, email = read_vars()

        if ics_url:
            fetch_ics(ics_url)
        else:
            print("WARN: calendarUrl in vars.js leer — calendar.ics wird nicht geladen")

        bundler = subprocess.Popen(
            [sys.executable, str(ROOT / "bundler.py"), "--watch"],
            cwd=str(ROOT)
        )
        time.sleep(2)

        params = "&dev"
        if ics_url:
            params = "?url=" + quote(ics_url, safe='') + "&dev"
        if email:
            params += "&email=" + quote(email, safe='')

        DEV_URL = f"http://localhost:{PORT}/dist/widget.html{params}"
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
