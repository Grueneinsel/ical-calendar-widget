/* main.js — widget entry point for widget.html (iframe mode) */
'use strict';

(function () {
  var cfg      = (typeof CW_CONFIG !== 'undefined') ? CW_CONFIG : {};
  var params   = new URLSearchParams(location.search);
  var icalUrl  = params.get('url') || (params.has('btc') ? cfg.calendarUrl : '') || '';
  cfg.email    = params.get('email') || cfg.email       || '';
  var devMode  = params.has('dev');
  var widget   = new CalendarWidget(document.getElementById('cw-root'));

  IcalParser.fetch(icalUrl)
    .then(function (text) {
      var events = IcalParser.parse(text, { dev: devMode });

      var today = new Date(); today.setHours(0, 0, 0, 0);
      var upcoming = devMode ? events : events.filter(function (e) { return e.start >= today; });

      var flyers = [];
      for (var i = 0; i < upcoming.length && flyers.length < 21; i++) {
        var atts = upcoming[i].attachments || [];
        for (var j = 0; j < atts.length && flyers.length < 21; j++) {
          if (atts[j].type === 'image') {
            var ev = upcoming[i];
            var emailInDesc = !!(cfg.email && ev.desc && ev.desc.indexOf(cfg.email) >= 0);
            flyers.push(Object.assign({
              eventTitle: ev.title,
              anmeldenEmail: emailInDesc ? cfg.email : null
            }, atts[j]));
          }
        }
      }

      widget.setFlyers(flyers);
      widget.setEvents(events, { dev: devMode });
    })
    .catch(function (err) { widget.setError(err.message); });
})();
