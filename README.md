# iCal Kalender-Widget

Einbettbares Kalender-Widget, das Termine aus einem iCal-Feed (z. B. Google Kalender) als Liste anzeigt – mit Flyer-Galerie, Anmelde-Button und, für den BTC-Jugendkalender, einer druckbaren DIN-A4-Jahresübersicht.

Live: <https://grueneinsel.github.io/ical-calendar-widget/widget.html?btc>

## Aufruf

| Adresse | Wirkung |
| --- | --- |
| `widget.html?btc` | BTC-Jugendkalender (Adresse aus `js/vars.js`), inkl. Druck-Buttons |
| `widget.html?btc&print=2026` | DIN-A4-Jahresübersicht 2026 (Drucken / als PDF speichern) |
| `widget.html?url=<ics-url>` | beliebiger iCal-Feed, ohne Druckfunktion |
| `…&dev` | Entwicklermodus: zeigt auch vergangene Termine |

Die Druckfunktion (Buttons, Logo, QR-Codes) gibt es ausschließlich mit `?btc`.

Alternativ ohne iframe einbetten:

```html
<div data-ical-url="https://…/basic.ics"></div>
<script src="embed.js"></script>
```

## Aufbau

```
widget.html        Einstiegsseite des Widgets (iframe-Modus)
index.html         Vollbild-Seite, bettet widget.html ein
css/widget.css     Styles des Widgets
css/print.css      Druck-Buttons und DIN-A4-Blatt (nur widget.html)
js/vars.js         Konfiguration (Kalender-Adresse, E-Mail)
js/ical.js         iCal laden und parsen
js/render.js       Terminliste, Flyer, Lightbox
js/print.js        DIN-A4-Jahresübersicht
js/print-qr.js     vorberechnete QR-Codes für das Druckblatt
js/main.js         Start für widget.html
js/embed-init.js   Start für embed.js
assets/            BTC-Logo
tools/bundler.py   baut dist/ (alles in je eine Datei eingebettet)
tools/dev_run.py   lokaler Server + Bundler im Watch-Modus
start.sh           startet tools/dev_run.py
```

`dist/` ist Build-Ausgabe und wird nicht eingecheckt.

## Entwickeln

```sh
./start.sh
```

Lädt `calendar.ics`, baut nach `dist/`, startet einen Server auf Port 8080 und öffnet das Widget im Browser. Änderungen in `css/` und `js/` werden automatisch neu gebaut. Dafür muss `calendarUrl` in `js/vars.js` lokal gesetzt sein (nicht einchecken).

Nur bauen: `python3 tools/bundler.py`

## Deployment

GitHub Actions (`.github/workflows/pages.yml`) baut bei jedem Push auf `main` und alle 6 Stunden: Der Kalender wird aus dem Secret `CALENDAR_URL` als `dist/calendar.ics` geladen, die Adresse in `js/vars.js` eingesetzt und `dist/` auf GitHub Pages veröffentlicht.

## Druckblatt anpassen

- Die Termine stehen in zwei Spalten (1. und 2. Halbjahr); die Schriftgröße passt sich automatisch an, sodass immer alles auf eine Seite passt.
- Vom Termintitel wird alles vor dem ersten Doppelpunkt entfernt („BTC Jugend: Lasertag" → „Lasertag").
- Die QR-Codes in `js/print-qr.js` sind für feste Adressen vorberechnet. Ändert sich eine Adresse, müssen die Zeilen (`rows`) neu erzeugt werden.
