/* main.js — widget entry point for widget.html (iframe mode) */
'use strict';

(function () {
  var cfg      = (typeof CW_CONFIG !== 'undefined') ? CW_CONFIG : {};
  var params   = new URLSearchParams(location.search);
  var icalUrl  = params.get('url')   || cfg.calendarUrl || '';
  cfg.email    = params.get('email') || cfg.email       || '';
  var widget   = new CalendarWidget(document.getElementById('cw-root'));

  if (!icalUrl) {
    widget.setError('Kein Kalender angegeben. Bitte ?url=\u2026 Parameter setzen.');
    return;
  }

  IcalParser.fetch(icalUrl)
    .then(function (text) {
      var events = IcalParser.parse(text);

      var flyers = [];
      for (var i = 0; i < events.length && flyers.length < 3; i++) {
        var atts = events[i].attachments || [];
        for (var j = 0; j < atts.length && flyers.length < 3; j++) {
          if (atts[j].type === 'image') {
            var ev = events[i];
            var emailInDesc = !!(cfg.email && ev.desc && ev.desc.indexOf(cfg.email) >= 0);
            flyers.push(Object.assign({
              eventTitle: ev.title,
              anmeldenEmail: emailInDesc ? cfg.email : null
            }, atts[j]));
          }
        }
      }

      widget.setFlyers(flyers);
      widget.setEvents(events);
    })
    .catch(function (err) { widget.setError(err.message); });
})();
