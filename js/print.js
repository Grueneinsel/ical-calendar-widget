/* print.js — BTC Jugend: DIN-A4 Jahresübersicht (Druck / PDF) */
'use strict';

var CalendarPrint = (function () {

  var MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli',
                'August','September','Oktober','November','Dezember'];
  var WDAYS_SHORT = ['So','Mo','Di','Mi','Do','Fr','Sa'];

  /* font scale range for fit(): 1 = 10pt */
  var SCALE_MAX = 2.4, SCALE_MIN = 0.2;

  var HOME_URL    = 'https://www.btc-herne.de/jugend/';
  var IMPRINT_URL = 'https://multifredding.de/';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* last inclusive day (iCal DTEND for all-day events is exclusive) */
  function lastDay(ev) {
    if (!ev.end) return ev.start;
    var d = new Date(ev.end);
    if (ev.allDay) d.setDate(d.getDate() - 1);
    return d < ev.start ? ev.start : d;
  }

  /* "12." · "12.–14." · "30.5.–1.6." plus matching weekday label */
  function dateLabel(ev) {
    var s = ev.start, e = lastDay(ev);
    if (s.toDateString() === e.toDateString()) {
      return { day: s.getDate() + '.', wd: WDAYS_SHORT[s.getDay()] };
    }
    var wd = WDAYS_SHORT[s.getDay()] + '–' + WDAYS_SHORT[e.getDay()];
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
      return { day: s.getDate() + '.–' + e.getDate() + '.', wd: wd };
    }
    return {
      day: s.getDate() + '.' + (s.getMonth() + 1) + '.–' + e.getDate() + '.' + (e.getMonth() + 1) + '.',
      wd: wd
    };
  }

  function eventsOfYear(events, year) {
    return events
      .filter(function (e) { return e.start && e.start.getFullYear() === year; })
      .sort(function (a, b) { return a.start - b.start; });
  }

  /* current year always, next year only when it already has events */
  function availableYears(events) {
    var y = new Date().getFullYear();
    return eventsOfYear(events, y + 1).length ? [y, y + 1] : [y];
  }

  function printUrl(year) {
    var p = new URLSearchParams(location.search);
    p.delete('dev');
    p.set('print', year);
    return location.pathname + '?' + p.toString();
  }

  /* Corner links below the sheet (screen only): back bottom left, imprint
     bottom right. Back works like the browser's back button; the sheet
     usually opens in a new tab without any history (and the widget itself
     sits in an iframe of the club's site), so then it leads to HOME_URL. */
  function cornerLinks(root) {
    var back = el('a', 'cw-ps-corner cw-ps-corner-left', '← Zurück');
    back.href = HOME_URL;
    back.addEventListener('click', function (e) {
      var nav = window.navigation;
      if (nav && typeof nav.canGoBack === 'boolean' ? !nav.canGoBack : history.length < 2) return;
      e.preventDefault();
      /* still here shortly after → there was nothing to go back to */
      var t = setTimeout(function () { location.href = HOME_URL; }, 400);
      window.addEventListener('pagehide', function () { clearTimeout(t); }, { once: true });
      history.back();
    });
    root.appendChild(back);

    var imprint = el('a', 'cw-ps-corner cw-ps-corner-right', 'Impressum');
    imprint.href   = IMPRINT_URL;
    imprint.target = '_blank';
    imprint.rel    = 'noopener';
    root.appendChild(imprint);
  }

  /* ── print links in the widget's bottom bar ── */
  function addButtons(container, events) {
    var bar = container.querySelector('.cw-disclaimer');
    if (!bar) return;
    var old = bar.querySelector('.cw-print-links');
    if (old) old.remove();

    var links = el('span', 'cw-print-links');
    availableYears(events).forEach(function (year) {
      var a = el('a', 'cw-print-btn', '🖨 ' + year + ' Drucken');
      a.href   = printUrl(year);
      a.target = '_blank';
      a.rel    = 'noopener';
      a.title  = 'Jahresübersicht ' + year + ' als DIN-A4-Seite oder als Flyer (2× A5) drucken';
      links.appendChild(a);
    });
    bar.appendChild(links);
  }

  /* Two fixed columns — January–June left, July–December right — so a month
     is never split. The font scale is fitted to the page height. */
  function fit(list, blocks) {
    if (!blocks.length) return;
    var cols = [el('div', 'cw-ps-col'), el('div', 'cw-ps-col')];
    cols.forEach(function (col, i) {
      col.appendChild(el('div', 'cw-ps-half', (i + 1) + '. Halbjahr'));
      list.appendChild(col);
    });
    blocks.forEach(function (b) { cols[+b.dataset.month < 6 ? 0 : 1].appendChild(b); });
    cols.forEach(function (col) {
      if (col.children.length === 1) col.appendChild(el('div', 'cw-ps-none', 'Noch keine Termine.'));
    });

    var titles = [].slice.call(list.querySelectorAll('.cw-ps-title'));
    function fits(scale) {
      list.style.setProperty('--cw-ps-scale', scale.toFixed(3));
      /* the last block's bottom margin doesn't need to fit */
      var gap = parseFloat(getComputedStyle(blocks[0]).marginBottom) || 0;
      if (Math.max(cols[0].offsetHeight, cols[1].offsetHeight) - gap > list.clientHeight) return false;
      /* too big as well if a single word no longer fits its line */
      return !titles.some(function (t) { return t.scrollWidth > t.clientWidth; });
    }
    /* while measuring, words must not be broken apart (see print.css) */
    list.classList.add('cw-ps-fitting');
    search();
    list.classList.remove('cw-ps-fitting');

    /* binary search for the largest scale at which the fuller half-year
       still fits — the text always fills the page as far as possible */
    function search() {
      var lo = SCALE_MIN, hi = SCALE_MAX;
      if (fits(hi)) lo = hi;
      while (hi - lo > 0.005) {
        var mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid; else hi = mid;
      }
      /* small safety margin against sub-pixel rounding (screen vs. print) */
      fits(lo * 0.98);
    }
  }

  /* scale the fixed-size preview down on narrow screens (screen only) */
  function fitScreen(sheet) {
    sheet.style.zoom = '';
    var avail = document.documentElement.clientWidth - 16;
    var w = sheet.offsetWidth;
    if (w > avail) sheet.style.zoom = (avail / w).toFixed(3);
  }

  /* QR module matrix (rows of '0'/'1') → inline SVG in BTC style: solid
     square data modules, black on the card's light green (no white box).
     Keep the eyes (almost) square — strongly rounded ones stop scanning. */
  function qrSvg(rows) {
    var n = rows.length, body = '', Q = 0.5; /* margin in modules; the card around it is the quiet zone */
    function inEye(x, y) {
      return (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
    }
    rows.forEach(function (row, y) {
      for (var x = 0; x < n; x++) {
        if (row.charAt(x) !== '1' || inEye(x, y)) continue;
        var run = 1;
        while (x + run < n && row.charAt(x + run) === '1' && !inEye(x + run, y)) run++;
        /* slight overlap so neighbouring modules merge into solid areas */
        body += '<rect x="' + (x + Q) + '" y="' + (y + Q) + '" width="' + (run + 0.03) + '" height="1.03"/>';
        x += run - 1;
      }
    });
    [[0, 0], [n - 7, 0], [0, n - 7]].forEach(function (e) {
      var x = e[0] + Q, y = e[1] + Q;
      body += '<rect x="' + x + '" y="' + y + '" width="7" height="7" rx="0.5"/>' +
        '<rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="5" height="5" rx="0.2" fill="#e9f6ef"/>' +
        '<rect x="' + (x + 2) + '" y="' + (y + 2) + '" width="3" height="3" rx="0.6"/>';
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (n + 2 * Q) + ' ' + (n + 2 * Q) +
      '">' +
      '<g fill="#0e0e0c">' + body + '</g></svg>';
  }

  /* strip with the QR codes: website, Instagram, WhatsApp channel */
  function channels(oneLine) {
    var strip = el('div', 'cw-ps-channels');
    (typeof CW_PRINT_QR !== 'undefined' ? CW_PRINT_QR : []).forEach(function (c) {
      var item = el('a', 'cw-ps-channel');
      item.href = c.url;
      item.appendChild(el('div', 'cw-ps-channel-title', c.title));
      var body = el('div', 'cw-ps-channel-body');
      var code = el('div', 'cw-ps-qr');
      code.innerHTML = qrSvg(c.rows);
      body.appendChild(code);
      body.appendChild(el('div', 'cw-ps-channel-hint', oneLine ? c.hint.replace(/\n/g, '') : c.hint));
      item.appendChild(body);
      strip.appendChild(item);
    });
    return strip;
  }

  /* ── background pattern, seeded by the year ──
     Every year gets its own look so two calendars are never mixed up:
     the pattern family rotates with the year in a three-year cycle (so
     neighbouring years always differ clearly), its details come from a PRNG seeded with the year.
     w/h in mm (= viewBox units). */
  function yearPattern(year, w, h) {
    /* mulberry32 */
    var t = (year * 2654435761) >>> 0;
    function rnd() {
      t = (t + 0x6D2B79F5) >>> 0;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    }
    function f(n) { return n.toFixed(2); }

    var body = '', x, y, i;
    var reach = Math.sqrt(w * w + h * h);
    /* three families in turn: 2027 dots, 2028 stripes, 2029 rings, 2030 dots … */
    switch ((((year - 2027) % 3) + 3) % 3) {
      case 0: /* halftone dots */
        var d = 7 + 3 * rnd(), fx = 0.02 + 0.05 * rnd(), fy = 0.02 + 0.05 * rnd(), ph = 6.28 * rnd();
        for (y = d / 2; y < h; y += d) {
          for (x = d / 2; x < w; x += d) {
            body += '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' +
              f(d * 0.42 * (0.2 + 0.8 * Math.abs(Math.sin(x * fx + y * fy + ph)))) + '"/>';
          }
        }
        break;
      case 1: /* diagonal stripes */
        var angle = (rnd() < 0.5 ? -1 : 1) * (25 + 40 * rnd());
        body += '<g transform="rotate(' + f(angle) + ' ' + f(w / 2) + ' ' + f(h / 2) + ')">';
        for (x = w / 2 - reach; x < w / 2 + reach;) {
          var sw = 1.5 + 7 * rnd();
          body += '<rect x="' + f(x) + '" y="' + f(h / 2 - reach) + '" width="' + f(sw) +
            '" height="' + f(2 * reach) + '"/>';
          x += sw + 4 + 9 * rnd();
        }
        body += '</g>';
        break;
      default: /* concentric rings */
        var cx = w * (0.55 + 0.5 * rnd()), cy = h * (0.02 + 0.2 * rnd()), step = 7 + 6 * rnd();
        for (i = 1; i * step < reach * 1.2; i++) {
          body += '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(i * step) +
            '" fill="none" stroke-width="' + f(step * (0.15 + 0.45 * rnd())) + '"/>';
        }
    }

    /* strong in the top-right and bottom-left corners, calm in the middle */
    return '<svg class="cw-ps-pattern" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h +
      '" preserveAspectRatio="none" aria-hidden="true"><defs>' +
      '<radialGradient id="cw-ps-fade-a" gradientUnits="userSpaceOnUse" cx="' + w + '" cy="0" r="' + f(reach * 0.62) + '">' +
      '<stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="cw-ps-fade-b" gradientUnits="userSpaceOnUse" cx="0" cy="' + h + '" r="' + f(reach * 0.5) + '">' +
      '<stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
      '<mask id="cw-ps-fade"><rect width="' + w + '" height="' + h + '" fill="#555"/>' +
      '<rect width="' + w + '" height="' + h + '" fill="url(#cw-ps-fade-a)"/>' +
      '<rect width="' + w + '" height="' + h + '" fill="url(#cw-ps-fade-b)"/></mask></defs>' +
      '<g mask="url(#cw-ps-fade)" fill="#2ca769" stroke="#2ca769">' + body + '</g></svg>';
  }

  /* Render `sheet` into a square PNG (social media, 1:1) and download it.
     The sheet is cloned with all page styles into an SVG <foreignObject>,
     which is then drawn onto a canvas. */
  function downloadPng(sheet, size, filename) {
    return new Promise(function (resolve, reject) {
      var css = '';
      [].forEach.call(document.styleSheets, function (ss) {
        try {
          [].forEach.call(ss.cssRules, function (r) { css += r.cssText + '\n'; });
        } catch (e) { /* cross-origin sheet — not ours */ }
      });
      /* relative url()s don't resolve inside the SVG image */
      var logo = sheet.querySelector('.cw-ps-logo');
      if (logo) css += '.cw-ps-logo{background-image:' + getComputedStyle(logo).backgroundImage + ' !important}';

      var zoom = sheet.style.zoom;
      sheet.style.zoom = '';
      var w = sheet.offsetWidth, h = sheet.offsetHeight;
      sheet.style.zoom = zoom;

      var wrap = document.createElement('div');
      wrap.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
      wrap.className = 'cw-print-root';
      wrap.style.padding = '0';
      wrap.appendChild(el('style', null, css));
      var clone = sheet.cloneNode(true);
      clone.style.zoom = '';
      clone.style.margin = '0';
      clone.style.boxShadow = 'none';
      wrap.appendChild(clone);

      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size +
        '" viewBox="0 0 ' + w + ' ' + h + '"><foreignObject width="' + w + '" height="' + h + '">' +
        new XMLSerializer().serializeToString(wrap) + '</foreignObject></svg>';

      var img = new Image();
      img.onerror = function () { reject(new Error('Bild konnte nicht erzeugt werden.')); };
      img.onload = function () {
        try {
          var canvas = document.createElement('canvas');
          canvas.width = canvas.height = size;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, size, size);
          ctx.drawImage(img, 0, 0, size, size);
          canvas.toBlob(function (blob) {
            if (!blob) { reject(new Error('Bild konnte nicht erzeugt werden.')); return; }
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
            resolve();
          }, 'image/png');
        } catch (e) { reject(e); }
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  /* ── A4 sheet ──
     mode 'flyer':  two A5 copies of it side by side on A4 landscape
     mode 'square': 1:1 version for social media (see downloadPng)
     Returns the sheet element. */
  function renderSheet(root, events, year, mode) {
    var items = eventsOfYear(events, year);
    var flyer = mode === 'flyer';
    document.title = 'BTC Jugend – Termine ' + year;
    /* printer emoji as favicon */
    var icon = document.getElementById('cw-ps-icon');
    if (!icon) {
      icon = el('link');
      icon.id   = 'cw-ps-icon';
      icon.rel  = 'icon';
      icon.href = 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🖨️</text></svg>');
      document.head.appendChild(icon);
    }
    document.body.classList.add('cw-print-mode');
    /* page size only here, so normal printing of the widget stays untouched */
    var page = document.getElementById('cw-ps-page');
    if (!page) {
      page = el('style');
      page.id = 'cw-ps-page';
      document.head.appendChild(page);
    }
    page.textContent = '@page { size: A4 ' + (flyer ? 'landscape' : 'portrait') + '; margin: 0; }';
    root.innerHTML = '';
    root.className = 'cw-print-root';

    /* toolbar (screen only) */
    var bar = el('div', 'cw-ps-toolbar');
    var printBtn = el('button', 'cw-ps-print', '🖨 Drucken / als PDF speichern');
    printBtn.addEventListener('click', function () { window.print(); });
    bar.appendChild(printBtn);
    /* flyer: no preview — switch layout, print, switch back */
    var flyerBtn = el('button', 'cw-ps-print', '🖨 Flyer drucken (2× A5)');
    flyerBtn.title = 'Zweimal DIN A5 nebeneinander auf A4 quer';
    flyerBtn.addEventListener('click', function () {
      renderSheet(root, events, year, 'flyer');
      window.addEventListener('afterprint', function () {
        renderSheet(root, events, year);
      }, { once: true });
      setTimeout(function () { window.print(); }, 50);
    });
    bar.appendChild(flyerBtn);
    /* social media: no preview either — render square, download PNG, switch back */
    var socialBtn = el('button', 'cw-ps-print', '📷 Social-Media-Bild (1:1)');
    socialBtn.title = 'Quadratisches Bild (2160 × 2160) für Instagram, WhatsApp & Co. herunterladen';
    socialBtn.addEventListener('click', function () {
      var square = renderSheet(root, events, year, 'square');
      var back = function (err) {
        var again = renderSheet(root, events, year);
        if (err) again.parentNode.insertBefore(el('div', 'cw-ps-error', err.message), again);
      };
      downloadPng(square, 2160, 'btc-jugend-termine-' + year + '.png').then(function () { back(); }, back);
    });
    bar.appendChild(socialBtn);
    availableYears(events).forEach(function (y) {
      if (y === year) return;
      var a = el('a', 'cw-ps-year', 'Termine ' + y + ' →');
      a.href = printUrl(y);
      bar.appendChild(a);
    });
    root.appendChild(bar);

    var sheet = el('div', 'cw-ps-sheet' + (mode === 'square' ? ' cw-ps-square' : ''));
    sheet.lang = 'de';
    /* always the A4 pattern — the square version shows its upper part */
    sheet.insertAdjacentHTML('beforeend', yearPattern(year, 210, 297));

    /* header: logo + "Jugend" + year */
    var head = el('div', 'cw-ps-head');
    var logo = el('div', 'cw-ps-logo');
    logo.setAttribute('role', 'img');
    logo.setAttribute('aria-label', 'BTC Logo');
    head.appendChild(logo);
    var name = el('div', 'cw-ps-name');
    name.appendChild(el('div', 'cw-ps-jugend', 'Jugend'));
    name.appendChild(el('div', 'cw-ps-sub', 'Terminkalender'));
    head.appendChild(name);
    /* century in green, the last two digits in black */
    var yearNum = el('div', 'cw-ps-yearnum', String(year).slice(0, -2));
    yearNum.appendChild(el('span', 'cw-ps-yearnum-end', String(year).slice(-2)));
    head.appendChild(yearNum);
    sheet.appendChild(head);
    sheet.appendChild(el('div', 'cw-ps-rule'));

    /* month blocks */
    var list = el('div', 'cw-ps-list');
    if (!items.length) {
      list.appendChild(el('div', 'cw-ps-empty', 'Für ' + year + ' sind noch keine Termine eingetragen.'));
    }
    var lastMonth = -1, block = null;
    items.forEach(function (ev) {
      var m = ev.start.getMonth();
      if (m !== lastMonth) {
        block = el('div', 'cw-ps-block');
        block.dataset.month = m;
        block.appendChild(el('div', 'cw-ps-month', MONTHS[m]));
        list.appendChild(block);
        lastMonth = m;
      }
      /* drop the "BTC Jugend: " style prefix; keep a cancellation noted there */
      var name = ev.title || '(kein Titel)';
      var pre  = /^([^:]*):\s+(\S.*)$/.exec(name);
      if (pre) name = pre[2];
      var cancelled = ev.status === 'CANCELLED' || !!(pre && /abgesagt/i.test(pre[1]));
      var row = el('div', 'cw-ps-row' + (cancelled ? ' cw-ps-cancel' : ''));
      var lbl = dateLabel(ev);
      var date = el('div', 'cw-ps-date');
      date.appendChild(el('span', 'cw-ps-day', lbl.day));
      date.appendChild(el('span', 'cw-ps-wd', lbl.wd));
      row.appendChild(date);
      var title = el('div', 'cw-ps-title', name);
      if (cancelled) title.appendChild(el('span', 'cw-ps-tag', 'abgesagt'));
      row.appendChild(title);
      block.appendChild(row);
    });
    sheet.appendChild(list);

    /* square version: no QR codes, so the names fit on one line each */
    sheet.appendChild(channels(mode === 'square'));

    /* footer */
    var foot = el('div', 'cw-ps-foot');
    foot.appendChild(el('span', 'cw-ps-disclaimer', 'Alle Angaben ohne Gewähr – Irrtümer vorbehalten.'));
    foot.appendChild(el('span', 'cw-ps-stand', 'Stand: ' +
      new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })));
    sheet.appendChild(foot);

    /* flyer: the A4 sheet scaled to A5 (CSS), twice next to each other */
    var outer = sheet;
    if (flyer) {
      outer = el('div', 'cw-ps-2up');
      outer.appendChild(el('div', 'cw-ps-slot')).appendChild(sheet);
    }
    root.appendChild(outer);
    cornerLinks(root);
    fit(list, [].slice.call(list.querySelectorAll('.cw-ps-block')));
    if (flyer) outer.appendChild(el('div', 'cw-ps-slot')).appendChild(sheet.cloneNode(true));
    fitScreen(outer);
    window.onresize = function () { fitScreen(outer); };
    return sheet;
  }

  return { addButtons: addButtons, renderSheet: renderSheet };
})();
