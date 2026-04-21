/* embed-init.js — native embed entry point.
   Usage: <div data-ical-url="https://...ics..."></div>
          <script src="embed.js"></script>               */
(function () {
  'use strict';

  /* inject widget CSS once into the host page */
  if (!document.getElementById('cw-embed-styles')) {
    var style = document.createElement('style');
    style.id  = 'cw-embed-styles';
    style.textContent = '__CSS__';
    document.head.appendChild(style);
  }

  function initAll() {
    var els = document.querySelectorAll('[data-ical-url]:not([data-cw-ready])');
    for (var i = 0; i < els.length; i++) {
      (function (el) {
        el.setAttribute('data-cw-ready', '1');
        var url    = el.getAttribute('data-ical-url');
        var widget = new CalendarWidget(el);
        if (!url) { widget.setError('Kein Kalender angegeben.'); return; }
        IcalParser.fetch(url)
          .then(function (t) { widget.setEvents(IcalParser.parse(t)); })
          .catch(function (e) { widget.setError(e.message); });
      }(els[i]));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
