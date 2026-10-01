/* main.js — widget entry point for widget.html (iframe mode) */
'use strict';


(function () {
  /* Prevent iframe scrollbar caused by sub-pixel rounding */
  if (window.self !== window.top) document.body.style.overflow = 'hidden';

  var cfg     = (typeof CW_CONFIG !== 'undefined') ? CW_CONFIG : {};
  var params  = new URLSearchParams(location.search);
  var icalUrl = params.get('url') || (params.has('btc') ? cfg.calendarUrl : '') || '';
  var devMode = params.has('dev');
  var rootEl  = document.getElementById('cw-root');

  /* only with ?btc: print links in the bottom bar + ?print=YEAR A4 sheet */
  var isBtc     = params.has('btc');
  var canPrint  = isBtc && typeof CalendarPrint !== 'undefined';
  var printYear = canPrint ? parseInt(params.get('print'), 10) || 0 : 0;

  if (printYear) {
    function renderPrint(text) {
      /* dev: true → keep the whole year, including past events */
      CalendarPrint.renderSheet(rootEl, IcalParser.parse(text, { dev: true }), printYear);
    }
    IcalParser.fetchLocal()
      .then(function (backupText) {
        renderPrint(backupText);
        if (icalUrl) {
          IcalParser.fetchLive(icalUrl)
            .then(function (liveText) {
              if (IcalParser.fingerprint(liveText) !== IcalParser.fingerprint(backupText)) renderPrint(liveText);
            })
            .catch(function () {});
        }
      })
      .catch(function () {
        IcalParser.fetch(icalUrl)
          .then(renderPrint)
          .catch(function (err) { rootEl.textContent = err.message; });
      });
    return;
  }

  var widget  = new CalendarWidget(rootEl);

  if (!icalUrl && !params.has('btc')) {
    widget.setHint();
    return;
  }

  /* Auto-resize: notify parent whenever content height changes.
     Use #cw-root offsetHeight (not scrollHeight) so shrinking also triggers. */
  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      window.parent.postMessage(
        { type: 'cw-resize', height: rootEl.offsetHeight }, '*'
      );
    }).observe(rootEl);
  }

  function render(text, source) {
    var events  = IcalParser.parse(text, { dev: devMode });
    var today   = new Date(); today.setHours(0, 0, 0, 0);
    var upcoming = devMode ? events : events.filter(function (e) { return e.start >= today; });

    /* Flyers: show until the event is over (use end date if available) */
    var flyerEvents = devMode ? events : events.filter(function (e) {
      return (e.end || e.start) >= today;
    });

    var flyers = [];
    for (var i = 0; i < flyerEvents.length && flyers.length < 21; i++) {
      var atts = flyerEvents[i].attachments || [];
      for (var j = 0; j < atts.length && flyers.length < 21; j++) {
        if (atts[j].type === 'image') {
          var ev = flyerEvents[i];
          flyers.push(Object.assign({
            eventTitle: ev.title,
            eventDesc:  ev.desc  || null,
            eventStart: ev.start || null,
            anmeldenEmail: extractEmail(ev.desc)
          }, atts[j]));
        }
      }
    }

    /* extract Google Calendar ID from ICS URL for event deep-links */
    var calIdMatch = icalUrl.match(/\/ical\/([^\/]+)\//);
    var calId = null;
    if (calIdMatch) {
      try { calId = decodeURIComponent(calIdMatch[1]); }
      catch (e) { calId = calIdMatch[1]; }
    }

    widget.setFlyers(flyers);
    widget.setEvents(events, { dev: devMode, source: source, calId: calId });
    if (canPrint) CalendarPrint.addButtons(rootEl, events);
  }

  /* Phase 1: local backup — renders immediately if available */
  IcalParser.fetchLocal()
    .then(function (backupText) {
      render(backupText, 'backup');
      /* Phase 2: live URL in background — only re-render if data changed */
      if (icalUrl) {
        IcalParser.fetchLive(icalUrl)
          .then(function (liveText) {
            if (IcalParser.fingerprint(liveText) !== IcalParser.fingerprint(backupText)) render(liveText, 'live');
          })
          .catch(function () {});
      }
    })
    .catch(function () {
      /* No local backup — load live directly */
      IcalParser.fetch(icalUrl)
        .then(function (t) { render(t, 'live'); })
        .catch(function (err) { widget.setError(err.message); });
    });
})();
