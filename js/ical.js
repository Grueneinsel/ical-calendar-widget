/* ical.js — iCalendar (RFC 5545) parser + CORS-aware fetch */
'use strict';

var IcalParser = (function () {

  var DAY_MAP = { SU:0, MO:1, TU:2, WE:3, TH:4, FR:5, SA:6 };

  /* ── text helpers ── */
  /* RFC 5545 §3.1: CRLF + single whitespace is removed entirely when unfolding */
  function unfold(text) {
    return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  }

  function unescape(s) {
    return s
      .replace(/\\n/g, '\n').replace(/\\N/g, '\n')
      .replace(/\\,/g, ',').replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\').trim();
  }

  /* ── date parsing ──
     Handles all RFC 5545 date/datetime variants:
       DTSTART:20260420T180000Z           (UTC)
       DTSTART;TZID=Europe/Berlin:20260420T180000  (local TZ)
       DTSTART;VALUE=DATE:20260420        (date-only / all-day)
  */
  function parseDtLine(line) {
    var ci  = line.indexOf(':');
    if (ci < 0) return null;
    var key = line.slice(0, ci).toUpperCase();
    var val = line.slice(ci + 1).trim();

    var allDay = key.indexOf('VALUE=DATE') >= 0 || val.indexOf('T') < 0;

    var y  = +val.slice(0, 4);
    var mo = +val.slice(4, 6) - 1;
    var d  = +val.slice(6, 8);
    if (allDay) return { date: new Date(y, mo, d), allDay: true };

    var h   = +val.slice(9, 11);
    var mi  = +val.slice(11, 13);
    var s   = +val.slice(13, 15);
    var utc = val.charAt(15) === 'Z';
    var dt  = utc
      ? new Date(Date.UTC(y, mo, d, h, mi, s))
      : new Date(y, mo, d, h, mi, s);
    return { date: dt, allDay: false };
  }

  /* value-only version used for UNTIL / EXDATE values */
  function parseDtVal(val) {
    return parseDtLine('X:' + val);
  }

  /* ── RRULE ── */
  function parseRRule(s) {
    var r = {};
    s.split(';').forEach(function (p) {
      var kv = p.split('=');
      if (kv[0]) r[kv[0]] = kv[1];
    });
    return r;
  }

  /* ── RRULE expansion ──
     Expands a recurring event into concrete instances within [rangeStart, rangeEnd].
     Handles: FREQ DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, COUNT, UNTIL, BYDAY, EXDATE.
  */
  function expandRRule(ev, rangeStart, rangeEnd) {
    var rule     = ev.rrule;
    var freq     = rule.FREQ;
    if (!freq) return [ev];

    var interval = parseInt(rule.INTERVAL || '1', 10);
    var maxCount = rule.COUNT ? parseInt(rule.COUNT, 10) : 500;
    var rawUntil = rule.UNTIL;
    var until    = rawUntil ? (parseDtVal(rawUntil) || {}).date : null;
    var limit    = (until && until < rangeEnd) ? until : rangeEnd;
    var dur      = ev.end ? ev.end - ev.start : 0;
    var exDates  = ev.exdates || {};

    var byDay = rule.BYDAY
      ? rule.BYDAY.split(',').map(function (s) {
          return DAY_MAP[s.replace(/[^A-Z]/g, '')];
        }).filter(function (n) { return n !== undefined; })
      : null;

    var result = [];
    var d = new Date(ev.start);
    var cnt = 0;

    while (cnt < maxCount && d <= limit) {
      if (d >= rangeStart) {
        var key = dateKey(d);
        if (!exDates[key]) {
          result.push(Object.assign({}, ev, {
            start: new Date(d),
            end: dur ? new Date(d.getTime() + dur) : null
          }));
        }
      }
      cnt++;

      if (freq === 'DAILY') {
        d.setDate(d.getDate() + interval);
      } else if (freq === 'WEEKLY') {
        if (byDay && byDay.length > 1) {
          /* advance to next weekday in the byDay set */
          var sorted = byDay.slice().sort(function (a, b) { return a - b; });
          var cur    = d.getDay();
          var nxt    = null;
          for (var i = 0; i < sorted.length; i++) {
            if (sorted[i] > cur) { nxt = sorted[i]; break; }
          }
          if (nxt !== null) {
            d.setDate(d.getDate() + (nxt - cur));
          } else {
            var first = sorted[0];
            d.setDate(d.getDate() + (7 - cur + first) + (interval - 1) * 7);
          }
        } else {
          d.setDate(d.getDate() + 7 * interval);
        }
      } else if (freq === 'MONTHLY') {
        d.setMonth(d.getMonth() + interval);
      } else if (freq === 'YEARLY') {
        d.setFullYear(d.getFullYear() + interval);
      } else {
        break;
      }
    }

    return result;
  }

  /* ── date key helper (YYYY-MM-DD) ── */
  function dateKey(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /* ── main parser ── */
  function parse(text, opts) {
    var lines  = unfold(text).split(/\r\n|\n|\r/);
    var events = [];
    var ev     = null;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      if (line === 'BEGIN:VEVENT') { ev = {}; continue; }
      if (line === 'END:VEVENT')   { if (ev && ev.start) events.push(ev); ev = null; continue; }
      if (!ev) continue;

      var ci      = line.indexOf(':');
      if (ci < 0) continue;
      var fullKey = line.slice(0, ci).toUpperCase();
      var key     = fullKey.split(';')[0];
      var val     = line.slice(ci + 1);

      switch (key) {
        case 'DTSTART': {
          var p = parseDtLine(line);
          if (p) { ev.start = p.date; ev.allDay = p.allDay; }
          break;
        }
        case 'DTEND': {
          var p2 = parseDtLine(line);
          if (p2) ev.end = p2.date;
          break;
        }
        case 'DURATION': {
          /* Basic DURATION parsing: P1D, PT2H30M, P1DT2H */
          ev.duration = val.trim();
          break;
        }
        case 'SUMMARY':     ev.title    = unescape(val); break;
        case 'DESCRIPTION': ev.desc     = unescape(val); break;
        case 'LOCATION':    ev.location = unescape(val); break;
        case 'URL':         ev.url      = val.trim(); break;
        case 'UID':         ev.uid      = val.trim(); break;
        case 'STATUS':      ev.status   = val.trim().toUpperCase(); break;
        case 'RRULE':       ev.rrule    = parseRRule(val); break;
        case 'EXDATE': {
          /* comma-separated list of excluded date(-times) */
          if (!ev.exdates) ev.exdates = {};
          val.split(',').forEach(function (v) {
            var ep = parseDtVal(v.trim());
            if (ep) ev.exdates[dateKey(ep.date)] = true;
          });
          break;
        }
        case 'GEO': {
          var parts = val.split(';');
          if (parts.length === 2) {
            ev.geo = { lat: parseFloat(parts[0]), lon: parseFloat(parts[1]) };
          }
          break;
        }
        case 'ATTACH': {
          /* ATTACH;FMTTYPE=image/png:https://drive.google.com/open?id=...
             ATTACH;VALUE=BINARY;ENCODING=BASE64;FMTTYPE=image/png:<base64>  */
          if (!ev.attachments) ev.attachments = [];
          var fmtMatch  = fullKey.match(/FMTTYPE=([^;:\s]+)/i);
          var fmttype   = fmtMatch ? fmtMatch[1].toLowerCase() : '';
          var fnameMatch = fullKey.match(/FILENAME=([^;:]+)/i);
          var filename  = fnameMatch ? fnameMatch[1].trim() : '';
          var isBinary = fullKey.indexOf('VALUE=BINARY') >= 0;
          var rawUrl   = val.trim();
          var att      = { fmttype: fmttype, binary: isBinary, filename: filename };

          if (isBinary) {
            att.dataUrl = 'data:' + (fmttype || 'application/octet-stream') + ';base64,' + rawUrl;
          } else {
            att.url = rawUrl;
            /* extract Google Drive file ID from any Drive URL variant:
               - drive.google.com/open?id=ID
               - drive.google.com/file/d/ID/...
               - google.com/url?q=https://drive.google.com/...  */
            var driveId = null;
            var idParam = rawUrl.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
            if (idParam) { driveId = idParam[1]; }
            else {
              var filePath = rawUrl.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
              if (filePath) driveId = filePath[1];
            }
            if (driveId) att.driveId = driveId;
          }

          /* derive media type */
          var urlExt = (att.url || '').replace(/\?.*$/, '').split('.').pop().toLowerCase();
          if (/^image\//.test(fmttype) || /^(png|jpe?g|gif|webp|svg|bmp|tiff?|avif|heic|heif|ico)$/.test(urlExt)) {
            att.type = 'image';
          } else if (fmttype === 'application/pdf' || urlExt === 'pdf') {
            att.type = 'pdf';
          } else {
            att.type = 'file';
          }

          ev.attachments.push(att);
          break;
        }
      }
    }

    /* resolve DURATION → end if end is missing */
    events.forEach(function (e) {
      if (!e.end && e.duration && e.start) {
        var ms = parseDuration(e.duration);
        if (ms) e.end = new Date(e.start.getTime() + ms);
      }
    });

    /* expand recurring events. dev=true → all history, else 6 months back */
    var dev = opts && opts.dev;
    var rangeStart = dev ? new Date(2000, 0, 1) : new Date();
    if (!dev) rangeStart.setMonth(rangeStart.getMonth() - 6);
    var rangeEnd = new Date();
    rangeEnd.setMonth(rangeEnd.getMonth() + 18);

    var expanded = [];
    events.forEach(function (e) {
      if (!e.rrule) {
        if (e.start >= rangeStart) expanded.push(e);
      } else {
        expanded = expanded.concat(expandRRule(e, rangeStart, rangeEnd));
      }
    });

    expanded.sort(function (a, b) { return a.start - b.start; });
    return expanded;
  }

  /* ISO 8601 duration → milliseconds (P1DT2H30M etc.) */
  function parseDuration(s) {
    var m = s.match(/P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/);
    if (!m) return 0;
    return ((+m[1]||0) * 86400 + (+m[2]||0) * 3600 + (+m[3]||0) * 60 + (+m[4]||0)) * 1000;
  }

  /* ── CORS-aware fetch ── */
  function fetchCalendar(url) {
    /* normalise: decode any stray %40 → @ so Google Calendar accepts the URL */
    try { url = decodeURIComponent(url); } catch (e) {}

    var proxies = [
      function (u) { return u; },
      function (u) { return 'https://corsproxy.io/?' + encodeURIComponent(u); },
      function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); },
      function (u) { return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); },
      function (u) { return 'https://thingproxy.freeboard.io/fetch/' + u; }
    ];

    function tryNext(idx) {
      if (idx >= proxies.length) return Promise.reject(new Error('Kalender konnte nicht geladen werden.'));
      var timeout = idx === 0 ? 4000 : 10000;
      return fetch(proxies[idx](url), { signal: AbortSignal.timeout(timeout) })
        .then(function (r) {
          if (!r.ok) return tryNext(idx + 1);
          return r.text().then(function (t) {
            /* basic sanity check: must look like iCal data */
            if (t.indexOf('BEGIN:VCALENDAR') < 0) return tryNext(idx + 1);
            return t;
          });
        })
        .catch(function () { return tryNext(idx + 1); });
    }

    return tryNext(0);
  }

  /* public API */
  return { parse: parse, fetch: fetchCalendar, dateKey: dateKey };
})();
