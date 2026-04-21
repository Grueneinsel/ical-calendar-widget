#!/usr/bin/env python3
# bundler.py — inlines all local <link stylesheet> and <script src> into dist/ files.
# Entry files: index.html, widget.html → dist/index.html, dist/widget.html
# Minifies CSS (rcssmin) and JS (rjsmin) when available.

from __future__ import annotations
import re
import sys
from pathlib import Path

try:
    import rcssmin as _rcssmin
    def _minify_css(s: str) -> str: return _rcssmin.cssmin(s)
except ImportError:
    def _minify_css(s: str) -> str: return s

try:
    import rjsmin as _rjsmin
    def _minify_js(s: str) -> str: return _rjsmin.jsmin(s)
except ImportError:
    def _minify_js(s: str) -> str: return s

ROOT    = Path(__file__).parent.resolve()
OUT_DIR = ROOT / "dist"

ENTRIES = ["widget.html", "index.html"]

LINK_RE   = re.compile(r"""<link\b([^>]*?)\brel\s*=\s*["']stylesheet["']([^>]*?)>""", re.IGNORECASE)
HREF_RE   = re.compile(r"""href\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
SCRIPT_RE = re.compile(r"""<script\b([^>]*?)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*</script>""",
                        re.IGNORECASE | re.DOTALL)

MIME_MAP = {
    ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
    ".svg": "image/svg+xml", ".png": "image/png",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
}
CSS_URL_RE = re.compile(r"""url\(\s*['"]?([^'"\)]+)['"]?\s*\)""")

def is_external(url: str) -> bool:
    return url.strip().lower().startswith(("http://", "https://", "//", "data:"))

def read(p: Path) -> str:
    return p.read_text(encoding="utf-8")

def inline_css_urls(css: str, css_path: Path) -> str:
    import base64
    def repl(m: re.Match) -> str:
        url = m.group(1).strip()
        if is_external(url):
            return m.group(0)
        target = (css_path.parent / url).resolve()
        if not target.exists():
            return m.group(0)
        mime = MIME_MAP.get(target.suffix.lower(), "application/octet-stream")
        data = base64.b64encode(target.read_bytes()).decode("ascii")
        return f"url('data:{mime};base64,{data}')"
    return CSS_URL_RE.sub(repl, css)

def inline_css(html: str, base: Path) -> str:
    def repl(m: re.Match) -> str:
        href_m = HREF_RE.search(m.group(0))
        if not href_m or is_external(href_m.group(1)):
            return m.group(0)
        css_path = (base / href_m.group(1)).resolve()
        if not css_path.exists():
            print(f"  WARN: CSS not found: {css_path}", file=sys.stderr)
            return m.group(0)
        css = read(css_path)
        css = inline_css_urls(css, css_path)
        css = _minify_css(css)
        css = css.replace("</style", "<\\/style")
        return f"<style>{css}</style>"
    return LINK_RE.sub(repl, html)

def inline_js(html: str, base: Path) -> str:
    def repl(m: re.Match) -> str:
        src = m.group(2)
        if is_external(src):
            return m.group(0)
        js_path = (base / src).resolve()
        if not js_path.exists():
            print(f"  WARN: JS not found: {js_path}", file=sys.stderr)
            return m.group(0)
        js    = read(js_path)
        js    = _minify_js(js)
        js    = js.replace("</script", "<\\/script")
        attrs = re.sub(r"""\bsrc\s*=\s*["'][^"']+["']""", "",
                       (m.group(1) + " " + m.group(3)).strip()).strip()
        return f"<script{' ' + attrs if attrs else ''}>{js}</script>"
    return SCRIPT_RE.sub(repl, html)

def build_file(name: str) -> int:
    src = ROOT / name
    if not src.exists():
        print(f"  SKIP: {src} (not found)", file=sys.stderr)
        return 0
    html = read(src)
    html = inline_css(html, src.parent)
    html = inline_js(html, src.parent)
    out  = OUT_DIR / name
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"  OK   dist/{name}  ({out.stat().st_size:,} bytes)")
    return 0

def build_embed() -> None:
    css_path = ROOT / "css" / "widget.css"
    if not css_path.exists():
        print("  SKIP: css/widget.css not found", file=sys.stderr)
        return

    # Read, inline url() assets, minify CSS
    css = read(css_path)
    css = inline_css_urls(css, css_path)
    css = _minify_css(css)
    # Escape for embedding in a JS string
    css_escaped = css.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "")

    js_files = ["js/ical.js", "js/render.js", "js/embed-init.js"]
    parts = []
    for name in js_files:
        p = ROOT / name
        if not p.exists():
            print(f"  SKIP: {name} not found", file=sys.stderr)
            return
        parts.append(read(p))

    combined = "\n".join(parts).replace("'__CSS__'", "'" + css_escaped + "'")
    combined = _minify_js(combined)

    out = OUT_DIR / "embed.js"
    out.write_text(combined, encoding="utf-8")
    print(f"  OK   dist/embed.js  ({out.stat().st_size:,} bytes)")


def main() -> int:
    print("Building…")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for entry in ENTRIES:
        build_file(entry)
    build_embed()
    print("Done.")
    return 0

def _source_files():
    files = [ROOT / e for e in ENTRIES]
    for pattern in ("js/*.js", "css/*.css"):
        files.extend(ROOT.glob(pattern))
    return [f for f in files if f.exists() and f.name != "embed-init.js"]

def _mtimes(files):
    out = {}
    for f in files:
        try: out[f] = f.stat().st_mtime
        except OSError: pass
    return out

def watch() -> int:
    import time
    print("Watch mode — rebuilding on file changes (Ctrl+C to stop)")
    main()
    last = _mtimes(_source_files())
    while True:
        time.sleep(1)
        curr = _mtimes(_source_files())
        if any(last.get(f) != curr.get(f) for f in set(last) | set(curr)):
            print("\nFile changed — rebuilding…")
            main()
            last = _mtimes(_source_files())

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--watch":
        try:
            raise SystemExit(watch())
        except KeyboardInterrupt:
            print("\nWatch stopped.")
            raise SystemExit(0)
    raise SystemExit(main())
