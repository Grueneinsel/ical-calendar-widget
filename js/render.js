/* render.js — event list rendering */
'use strict';

var CalendarWidget = (function () {

  var MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli',
                'August','September','Oktober','November','Dezember'];
  var WDAYS_SHORT = ['So','Mo','Di','Mi','Do','Fr','Sa'];

  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function mapsUrl(location) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(location);
  }

  /* Render description as HTML, stripping only dangerous elements/attributes */
  function sanitizeDesc(html) {
    /* plain text (no tags) → convert newlines to <br> */
    if (html.indexOf('<') === -1) {
      return html.replace(/\n/g, '<br>');
    }
    /* strip <script>, <style>, <iframe> and all event-handler attributes */
    html = html.replace(/<(script|style|iframe)\b[\s\S]*?<\/\1>/gi, '');
    html = html.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
    html = html.replace(/href\s*=\s*["']?javascript:[^"'\s>]*/gi, 'href="#"');
    return html;
  }

  /* build ordered fallback src list for a flyer/attachment object.
     thumbnail works for public Drive files without auth cookies;
     lh3 and uc?export=view need cookies and are unreliable in iframes. */
  function flyerSrcs(f) {
    return (f.dataUrl ? [f.dataUrl] : [
      f.driveId ? 'https://drive.google.com/thumbnail?id=' + f.driveId + '&sz=w1200' : null,
      f.driveId ? 'https://drive.usercontent.google.com/download?id=' + f.driveId + '&export=view' : null,
      f.driveId ? 'https://lh3.googleusercontent.com/d/' + f.driveId : null,
      f.url && f.url.indexOf('drive.google.com/open') < 0 ? f.url : null
    ]).filter(Boolean);
  }

  /* Load img through a fallback-src list. Moves to next src after timeoutMs
     or on error. Calls onLoaded() on first success, onAllFailed() if exhausted. */
  function loadImg(img, srcs, timeoutMs, onAllFailed, onLoaded) {
    var tried = 0;
    var timer = null;
    function attempt() {
      if (timer) clearTimeout(timer);
      if (tried >= srcs.length) { if (onAllFailed) onAllFailed(); return; }
      img.onload  = function () { clearTimeout(timer); if (onLoaded) onLoaded(); };
      img.onerror = function () { clearTimeout(timer); tried++; attempt(); };
      img.src = srcs[tried];
      timer = setTimeout(function () { tried++; attempt(); }, timeoutMs);
    }
    if (srcs.length) attempt();
  }

  /* ── attachment renderer ── */
  function renderAttachment(att) {
    var wrap = document.createElement('div');
    wrap.className = 'cw-att';

    if (att.type === 'image') {
      var img = document.createElement('img');
      img.alt       = 'Anhang';
      img.className = 'cw-att-img';
      img.addEventListener('click', function () { window.open(att.url || img.src, '_blank'); });

      var srcs = flyerSrcs(att);
      loadImg(img, srcs, 6000, function () {
        var fb = document.createElement('a');
        fb.href = att.url || ''; fb.target = '_blank'; fb.rel = 'noopener';
        fb.className = 'cw-att-link'; fb.textContent = '🖼️ Bild öffnen';
        wrap.replaceChild(fb, img);
      });
      wrap.appendChild(img);

    } else if (att.type === 'pdf') {
      /* Drive PDF previews require cookies → styled link card.
         Always prefer the direct /file/d/ID/view URL when driveId is known. */
      var openUrl = att.driveId
        ? 'https://drive.google.com/file/d/' + att.driveId + '/view'
        : (att.url || '');
      if (openUrl) {
        var card = document.createElement('a');
        card.href      = openUrl;
        card.target    = '_blank';
        card.rel       = 'noopener';
        card.className = 'cw-att-pdf-card';
        var fname = att.filename || att.url.split('/').pop().split('?')[0] || 'Dokument';
        card.innerHTML =
          '<span class="cw-att-pdf-icon">📄</span>' +
          '<span class="cw-att-pdf-label">' + esc(fname) + '</span>' +
          '<span class="cw-att-pdf-open">Öffnen ↗</span>';
        wrap.appendChild(card);
      }

    } else if (att.url) {
      var fileLink = document.createElement('a');
      fileLink.href      = att.url;
      fileLink.target    = '_blank';
      fileLink.rel       = 'noopener';
      fileLink.className = 'cw-att-link';
      fileLink.textContent = '📎 Anhang öffnen';
      wrap.appendChild(fileLink);
    }

    return wrap;
  }

  /* ── deadline date extractor ──
     Scans a description (plain text or HTML) for a registration deadline.
     Pass 1: lines containing explicit keywords.
     Pass 2: any date that falls before the event start date.
     Supported formats: DD.MM.YYYY · DD.MM.YY · D.M.YYYY · DD. MonatName YYYY
                        DD. MonatName · DD/MM/YYYY · YYYY-MM-DD              */
  var _DL_KEYWORDS = /meldeschluss|anmeldeschluss|anmeldung\s+bis|anmelden\s+bis|anmeldefrist|anmeldung\s+spätestens|bis\s+(?:zum|spätestens)\b/i;
  var _DE_MONTHS   = {
    'januar':0,'februar':1,'märz':2,'april':3,'mai':4,'juni':5,
    'juli':6,'august':7,'september':8,'oktober':9,'november':10,'dezember':11
  };

  function _parseDate(str) {
    var m;
    // YYYY-MM-DD
    m = str.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (m) return new Date(+m[1], +m[2]-1, +m[3]);
    // DD.MM.YYYY / DD.MM.YY / D.M.YYYY
    m = str.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/);
    if (m) { var y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2]-1, +m[1]); }
    // DD/MM/YYYY or D/M/YY
    m = str.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
    if (m) { var y2 = +m[3]; if (y2 < 100) y2 += 2000; return new Date(y2, +m[2]-1, +m[1]); }
    // DD. MonatName YYYY? (e.g. "28. November 2025" or "28. November")
    m = str.match(/\b(\d{1,2})\.\s*(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)\.?\s*(\d{2,4})?\b/i);
    if (m) {
      var mo = _DE_MONTHS[m[2].toLowerCase()];
      var y3 = m[3] ? +m[3] : new Date().getFullYear();
      if (y3 < 100) y3 += 2000;
      return new Date(y3, mo, +m[1]);
    }
    return null;
  }

  function findDeadline(desc, eventStart) {
    if (!desc || !eventStart) return null;
    var cutoff = new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate());
    var lines = desc.split(/\n|<br\s*\/?>/i)
      .map(function (l) { return l.replace(/<[^>]+>/g, '').trim(); })
      .filter(Boolean);
    // pass 1: keyword lines
    for (var i = 0; i < lines.length; i++) {
      if (_DL_KEYWORDS.test(lines[i])) {
        var d = _parseDate(lines[i]);
        if (d && d < cutoff) return d;
      }
    }
    // pass 2: any date before event start
    for (var j = 0; j < lines.length; j++) {
      var d2 = _parseDate(lines[j]);
      if (d2 && d2 < cutoff) return d2;
    }
    return null;
  }

  /* last inclusive day (iCal DTEND for all-day events is exclusive) */
  function lastInclusiveDay(ev) {
    if (!ev.end) return null;
    if (ev.allDay) {
      var d = new Date(ev.end);
      d.setDate(d.getDate() - 1);
      return d;
    }
    return ev.end;
  }

  function isMultiDay(ev) {
    var end = lastInclusiveDay(ev);
    if (!end) return false;
    return end.toDateString() !== ev.start.toDateString();
  }

  /* ── constructor ── */
  function Widget(container) {
    this.container = container;
    container.classList.add('cw-container');
    container.innerHTML = '<div id="cw-list"></div><div class="cw-disclaimer">Alle Angaben ohne Gewähr – Irrtümer vorbehalten.</div>';
    this.$list   = container.querySelector('#cw-list');
    this.$status = null;
    this._showStatus('Termine werden geladen…');
  }

  Widget.prototype._showStatus = function (msg, isErr) {
    if (!this.$status) {
      this.$status = document.createElement('div');
      this.$status.id = 'cw-status';
      this.$list.appendChild(this.$status);
    }
    this.$status.className = isErr ? 'cw-err' : '';
    if (!isErr) {
      this.$status.innerHTML = '<div class="cw-spinner"></div><span>' + msg + '</span>';
    } else {
      this.$status.textContent = msg;
    }
  };

  Widget.prototype.setError = function (msg) {
    this._showStatus(msg, true);
  };

  Widget.prototype.setHint = function () {
    if (this.$status) this.$status.remove();
    var box = document.createElement('div');
    box.className = 'cw-hint';
    box.innerHTML =
      '<div class="cw-hint-title">&#128197; Kalender-Widget</div>' +
      '<p>Kein Kalender angegeben. Füge einen der folgenden Parameter an die URL an:</p>' +
      '<div class="cw-hint-row"><span class="cw-hint-param">?url=</span><span class="cw-hint-desc">iCal-Feed URL (Google Calendar, Outlook …)</span></div>' +
      '<div class="cw-hint-row"><span class="cw-hint-param">&amp;email=</span><span class="cw-hint-desc">Kontakt-E-Mail für Anmelde-Buttons</span></div>' +
      '<div class="cw-hint-example">widget.html?url=<em>DEINE-ICS-URL</em>&amp;email=<em>info@beispiel.de</em></div>';
    this.$list.appendChild(box);
  };

  /* ── flyer gallery ── */
  Widget.prototype.setFlyers = function (flyers) {
    /* cancel any in-flight lazy section from a previous render */
    if (this._flyerSection) this._flyerSection._cancelled = true;
    var old = this.container.querySelector('.cw-flyers');
    if (old) old.remove();
    this._flyerSection = null;
    if (!flyers || !flyers.length) return;
    var self = this;

    var section = document.createElement('div');
    section.className = 'cw-flyers';
    section._cancelled = false;
    this._flyerSection = section;
    var sectionInDom = false;

    var heading = document.createElement('div');
    heading.className = 'cw-flyers-heading';
    heading.textContent = 'Aktuelle Flyer';
    section.appendChild(heading);

    var grid = document.createElement('div');
    grid.className = 'cw-flyers-grid';
    section.appendChild(grid);

    flyers.forEach(function (f, idx) {
      var card = document.createElement('div');
      card.className = 'cw-flyer-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.title = f.eventTitle || '';

      card.addEventListener('click', function () { self._openLightbox(flyers, idx); });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') self._openLightbox(flyers, idx);
      });

      if (f.eventTitle) {
        var label = document.createElement('div');
        label.className = 'cw-flyer-label';
        label.textContent = f.eventTitle;
        card.appendChild(label);
      }

      var img = document.createElement('img');
      img.className = 'cw-flyer-img';
      img.alt = f.eventTitle || 'Flyer';

      loadImg(img, flyerSrcs(f), 6000,
        function () { card.remove(); },
        function () {
          if (section._cancelled) return;
          card.classList.add('cw-flyer-ready');
          if (!sectionInDom) {
            self.container.insertBefore(section, self.$list);
            sectionInDom = true;
          }
        }
      );

      card.appendChild(img);
      grid.appendChild(card);
    });
  };

  Widget.prototype._openLightbox = function (flyers, idx) {
    var overlay = document.createElement('div');
    overlay.className = 'cw-lb-overlay';

    function closeOverlay() {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(function () {});
      }
      overlay.remove();
    }

    /* ── top bar ── */
    var topBar = document.createElement('div');
    topBar.className = 'cw-lb-topbar';

    var f = flyers[idx];
    var lbDeadline = findDeadline(f.eventDesc, f.eventStart);
    var lbDeadlinePassed = !!(lbDeadline && lbDeadline < new Date(new Date().setHours(0,0,0,0)));
    if (f.anmeldenEmail && !lbDeadlinePassed) {
      var mailBtn = document.createElement('a');
      mailBtn.className = 'cw-lb-mail';
      mailBtn.href = 'mailto:' + f.anmeldenEmail +
        '?subject=' + encodeURIComponent(f.eventTitle || '');
      mailBtn.textContent = '✉ Anmelden';
      mailBtn.target = '_blank';
      topBar.appendChild(mailBtn);
    }

    var rightBtns = document.createElement('div');
    rightBtns.className = 'cw-lb-topbar-right';

    /* zoom toggle */
    var zoomed = false;
    var zoomBtn = document.createElement('button');
    zoomBtn.className = 'cw-lb-zoom';
    zoomBtn.title = 'Zoom';
    zoomBtn.innerHTML = '🔍';
    zoomBtn.addEventListener('click', function () {
      zoomed = !zoomed;
      img.classList.toggle('cw-lb-img-zoom', zoomed);
      zoomBtn.innerHTML = zoomed ? '🔎' : '🔍';
    });

    var close = document.createElement('button');
    close.className = 'cw-lb-close';
    close.innerHTML = '×';
    close.addEventListener('click', closeOverlay);

    rightBtns.appendChild(zoomBtn);
    rightBtns.appendChild(close);
    topBar.appendChild(rightBtns);
    overlay.appendChild(topBar);

    /* ── image ── */
    var lbSpinner = document.createElement('div');
    lbSpinner.className = 'cw-lb-spinner';

    var img = document.createElement('img');
    img.className = 'cw-lb-img';
    img.alt = f.eventTitle || 'Flyer';
    img.style.display = 'none';
    loadImg(img, flyerSrcs(flyers[idx]), 8000,
      function () { lbSpinner.remove(); img.style.display = ''; },
      function () { lbSpinner.remove(); img.style.display = ''; }
    );

    var imgWrap = document.createElement('div');
    imgWrap.className = 'cw-lb-img-wrap';
    imgWrap.appendChild(img);

    var lbBody = document.createElement('div');
    lbBody.className = 'cw-lb-body';
    lbBody.appendChild(lbSpinner);
    lbBody.appendChild(imgWrap);
    overlay.appendChild(lbBody);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeOverlay();
    });

    /* Escape: browser exits fullscreen first, then fires keydown */
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        overlay.remove();
      }
    });

    document.body.appendChild(overlay);

    /* request true fullscreen so the overlay covers the whole screen,
       even when the widget is embedded in an iframe */
    var fsEl = overlay.requestFullscreen ? overlay
             : overlay.webkitRequestFullscreen ? overlay : null;
    if (fsEl) {
      (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl)
        .catch(function () { /* fallback: fixed overlay is already visible */ });
    }
  };

  /* ── main render ── */
  Widget.prototype.setEvents = function (events, opts) {
    this.$list.innerHTML = '';

    var dev   = opts && opts.dev;
    var today = new Date(); today.setHours(0, 0, 0, 0);

    var items = events
      .filter(function (e) { return dev || e.start >= today; })
      .sort(function (a, b) { return a.start - b.start; });

    if (dev) {
      var source = opts && opts.source;
      var badge = document.createElement('div');
      badge.className = 'cw-dev-badge';
      badge.textContent = 'DEV — alle Termine inkl. Vergangenheit'
        + (source === 'backup' ? ' · 📦 Backup (calendar.ics)' : '')
        + (source === 'live'   ? ' · 🌐 Live (Google Calendar)' : '');
      this.$list.appendChild(badge);
    }

    if (!items.length) {
      this._showStatus('Keine bevorstehenden Termine.');
      return;
    }

    var lastMonth = -1;

    items.forEach(function (ev) {
      var m = ev.start.getMonth();
      var y = ev.start.getFullYear();

      /* month separator */
      if (m !== lastMonth) {
        var sep = document.createElement('div');
        sep.className   = 'cw-month';
        sep.textContent = MONTHS[m] + ' ' + y;
        this.$list.appendChild(sep);
        lastMonth = m;
      }

      /* event row */
      var row = document.createElement('div');
      row.className = 'cw-item' + (ev.status === 'CANCELLED' ? ' cw-cancel' : '');

      /* date badge */
      var multiDay = isMultiDay(ev);
      var date = document.createElement('div');
      date.className = 'cw-date';
      var badgeHtml;
      if (multiDay) {
        var endD = lastInclusiveDay(ev);
        var dayNums = [];
        var cur = new Date(ev.start);
        while (cur <= endD) {
          dayNums.push(
            '<div class="cw-day">' + cur.getDate() + '</div>' +
            '<div class="cw-wd">'  + WDAYS_SHORT[cur.getDay()] + '</div>'
          );
          cur.setDate(cur.getDate() + 1);
        }
        badgeHtml = dayNums.join('');
      } else {
        badgeHtml =
          '<div class="cw-day">' + ev.start.getDate() + '</div>' +
          '<div class="cw-wd">'  + WDAYS_SHORT[ev.start.getDay()] + '</div>';
      }
      date.innerHTML = badgeHtml;

      /* stripe */
      var stripe = document.createElement('div');
      stripe.className = 'cw-stripe';

      /* body */
      var body = document.createElement('div');
      body.className = 'cw-body';

      var titleText = ev.status === 'CANCELLED'
        ? '[Abgesagt] ' + (ev.title || '(kein Titel)')
        : (ev.title || '(kein Titel)');
      body.innerHTML = '<div class="cw-title">' + esc(titleText) + '</div>';

      /* price + age row */
      var priceLines = ev.desc ? ev.desc.split(/\n|<br\s*\/?>/i)
        .map(function (l) { return l.replace(/<[^>]+>/g, '').trim(); })
        .filter(function (l) { return /€|Euro/i.test(l); })
        .filter(Boolean) : [];
      if (priceLines.length) {
        var priceEl = document.createElement('div');
        priceEl.className = 'cw-price';
        priceEl.innerHTML = priceLines.map(function (l) { return esc(l); }).join('<br>');
        body.appendChild(priceEl);
      }

      var deadline = findDeadline(ev.desc, ev.start);
      if (deadline) {
        var dlEl = document.createElement('div');
        dlEl.className = 'cw-deadline';
        dlEl.textContent = '⏰ Anmeldeschluss: ' +
          deadline.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        body.appendChild(dlEl);
      }

      /* meta: time + location */
      var meta = document.createElement('div');
      meta.className = 'cw-meta';

      if (!ev.allDay) {
        var startTime = ev.start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        var timeStr;
        if (ev.end) {
          var endTime = ev.end.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
          if (multiDay) {
            var endDateFmt = ev.end.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
            timeStr = startTime + ' – ' + endDateFmt + ', ' + endTime;
          } else {
            timeStr = startTime + '–' + endTime;
          }
        } else {
          timeStr = startTime;
        }
        var ts = document.createElement('span');
        ts.textContent = '🕒 ' + timeStr;
        meta.appendChild(ts);
      }

      if (ev.location) {
        var locWrap = document.createElement('div');
        locWrap.className = 'cw-location';
        var locLink = document.createElement('a');
        locLink.className = 'cw-loc-btn';
        locLink.target    = '_blank';
        locLink.rel       = 'noopener';
        locLink.href      = mapsUrl(ev.location);
        locLink.innerHTML = '<span class="cw-loc-icon">&#x1F4CD;</span>' +
                            '<span class="cw-loc-text">' + esc(ev.location) + '</span>';
        locWrap.appendChild(locLink);
        body.appendChild(locWrap);
      }

      if (meta.children.length) body.appendChild(meta);

      /* actions bar: info toggle + anmelden button */
      var actionsBar = document.createElement('div');
      actionsBar.className = 'cw-actions';

      /* collapsible info panel: desc + attachments, toggle always last */
      var hasDesc = !!ev.desc;
      var hasAtts = !!(ev.attachments && ev.attachments.length);
      if (hasDesc || hasAtts) {
        var infoPanel = document.createElement('div');
        infoPanel.className = 'cw-info-panel';

        if (hasDesc) {
          var descEl = document.createElement('div');
          descEl.className = 'cw-desc';
          descEl.innerHTML = sanitizeDesc(ev.desc);
          var links = descEl.querySelectorAll('a');
          for (var li = 0; li < links.length; li++) {
            var href = links[li].getAttribute('href') || '';
            if (!href || href === '/' || href === '#') {
              links[li].removeAttribute('href');
              links[li].style.color = 'inherit';
            } else {
              links[li].target = '_blank';
              links[li].rel    = 'noopener';
            }
          }
          infoPanel.appendChild(descEl);
        }

        if (hasAtts) {
          ev.attachments.forEach(function (att) {
            infoPanel.appendChild(renderAttachment(att));
          });
        }

        var infoToggle = document.createElement('button');
        infoToggle.className = 'cw-desc-toggle';
        infoToggle.textContent = 'Info ▾';
        infoToggle.addEventListener('click', function (e) {
          e.stopPropagation();
          var open = infoPanel.classList.toggle('cw-info-panel-open');
          infoToggle.textContent = open ? 'Info ▴' : 'Info ▾';
        });

        actionsBar.appendChild(infoToggle);
        body.appendChild(infoPanel);
      }

      /* mailto anmelden button — only when flyer image + email in desc + deadline not passed */
      var evCfg = (typeof CW_CONFIG !== 'undefined') ? CW_CONFIG : {};
      var hasFlyer = !!(ev.attachments && ev.attachments.some(function (a) { return a.type === 'image'; }));
      var emailInDesc = !!(evCfg.email && ev.desc && ev.desc.indexOf(evCfg.email) >= 0);
      var deadlinePassed = !!(deadline && deadline < today);
      if (evCfg.email && hasFlyer && emailInDesc && !deadlinePassed) {
        var mailBtn = document.createElement('a');
        mailBtn.className = 'cw-mail-btn';
        mailBtn.href = 'mailto:' + evCfg.email +
          '?subject=' + encodeURIComponent(ev.title || '');
        mailBtn.textContent = '✉ Anmelden';
        mailBtn.target = '_blank';
        mailBtn.addEventListener('click', function (e) { e.stopPropagation(); });
        actionsBar.appendChild(mailBtn);
      }

      if (actionsBar.children.length) body.appendChild(actionsBar);

      row.appendChild(date);
      row.appendChild(stripe);
      row.appendChild(body);

      if (ev.url) {
        row.style.cursor = 'pointer';
        row.addEventListener('click', function (e) {
          if (e.target.tagName !== 'A' && e.target.tagName !== 'IMG' &&
              e.target.tagName !== 'EMBED' && e.target.tagName !== 'IFRAME') {
            window.open(ev.url, '_blank');
          }
        });
      }

      this.$list.appendChild(row);
    }, this);
  };

  return Widget;
})();
