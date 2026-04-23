/* main.js — widget entry point for widget.html (iframe mode) */
'use strict';

(function () {
  var cfg     = (typeof CW_CONFIG !== 'undefined') ? CW_CONFIG : {};
  var params  = new URLSearchParams(location.search);
  var icalUrl = params.get('url') || (params.has('btc') ? cfg.calendarUrl : '') || '';
  var devMode = params.has('dev');
  var widget  = new CalendarWidget(document.getElementById('cw-root'));

  if (!icalUrl && !params.has('btc')) {
    widget.setHint();
    return;
  }

  /* Auto-resize: notify parent whenever content height changes */
  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      window.parent.postMessage(
        { type: 'cw-resize', height: document.documentElement.scrollHeight }, '*'
      );
    }).observe(document.documentElement);
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
    var calId = calIdMatch ? decodeURIComponent(calIdMatch[1]) : null;

    widget.setFlyers(flyers);
    widget.setEvents(events, { dev: devMode, source: source, calId: calId });
  }

  /* Phase 1: local backup — renders immediately if available */
  IcalParser.fetchLocal()
    .then(function (text) {
      render(text, 'backup');
      /* Phase 2: live URL in background — overwrites if newer data arrives */
      if (icalUrl) {
        IcalParser.fetchLive(icalUrl)
          .then(function (t) { render(t, 'live'); })
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
