/* print.js — BTC Jugend: DIN-A4 Jahresübersicht (Druck / PDF) */
'use strict';

var CalendarPrint = (function () {

  var MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli',
                'August','September','Oktober','November','Dezember'];
  var WDAYS_SHORT = ['So','Mo','Di','Mi','Do','Fr','Sa'];

  /* font scale range for the fit-to-page loop */
  var SCALE_MAX = 1.4, SCALE_MIN = 0.2, SCALE_STEP = 0.02;

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
      a.title  = 'Jahresübersicht ' + year + ' als DIN-A4-Seite drucken oder als PDF speichern';
      links.appendChild(a);
    });
    bar.appendChild(links);
  }

  /* Two fixed columns — January–June left, July–December right — so a month
     is never split. Shrink the font scale until both fit the page height. */
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

    var scale = SCALE_MAX;
    function overflows() {
      list.style.setProperty('--cw-ps-scale', scale.toFixed(2));
      /* the last block's bottom margin doesn't need to fit */
      var gap = parseFloat(getComputedStyle(blocks[0]).marginBottom) || 0;
      return Math.max(cols[0].offsetHeight, cols[1].offsetHeight) - gap > list.clientHeight;
    }
    while (overflows() && scale > SCALE_MIN) scale -= SCALE_STEP;
  }

  /* scale the fixed-size A4 preview down on narrow screens (screen only) */
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
  function channels() {
    var strip = el('div', 'cw-ps-channels');
    (typeof CW_PRINT_QR !== 'undefined' ? CW_PRINT_QR : []).forEach(function (c) {
      var item = el('a', 'cw-ps-channel');
      item.href = c.url;
      item.appendChild(el('div', 'cw-ps-channel-title', c.title));
      var body = el('div', 'cw-ps-channel-body');
      var code = el('div', 'cw-ps-qr');
      code.innerHTML = qrSvg(c.rows);
      body.appendChild(code);
      body.appendChild(el('div', 'cw-ps-channel-hint', c.hint));
      item.appendChild(body);
      strip.appendChild(item);
    });
    return strip;
  }

  /* ── A4 sheet ── */
  function renderSheet(root, events, year) {
    var items = eventsOfYear(events, year);
    document.title = 'BTC Jugend – Termine ' + year;
    document.body.classList.add('cw-print-mode');
    /* page size only here, so normal printing of the widget stays untouched */
    if (!document.getElementById('cw-ps-page')) {
      var page = el('style', null, '@page { size: A4 portrait; margin: 0; }');
      page.id = 'cw-ps-page';
      document.head.appendChild(page);
    }
    root.innerHTML = '';
    root.className = 'cw-print-root';

    /* toolbar (screen only) */
    var bar = el('div', 'cw-ps-toolbar');
    var printBtn = el('button', 'cw-ps-print', '🖨 Drucken / als PDF speichern');
    printBtn.addEventListener('click', function () { window.print(); });
    bar.appendChild(printBtn);
    availableYears(events).forEach(function (y) {
      if (y === year) return;
      var a = el('a', 'cw-ps-year', 'Termine ' + y + ' →');
      a.href = printUrl(y);
      bar.appendChild(a);
    });
    root.appendChild(bar);

    var sheet = el('div', 'cw-ps-sheet');
    sheet.lang = 'de';

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
    head.appendChild(el('div', 'cw-ps-yearnum', String(year)));
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

    sheet.appendChild(channels());

    /* footer */
    var foot = el('div', 'cw-ps-foot');
    foot.appendChild(el('span', 'cw-ps-disclaimer', 'Alle Angaben ohne Gewähr – Irrtümer vorbehalten.'));
    foot.appendChild(el('span', 'cw-ps-stand', 'Stand: ' +
      new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })));
    sheet.appendChild(foot);

    root.appendChild(sheet);
    fit(list, [].slice.call(list.querySelectorAll('.cw-ps-block')));
    fitScreen(sheet);
    window.onresize = function () { fitScreen(sheet); };
  }

  return { addButtons: addButtons, renderSheet: renderSheet };
})();
