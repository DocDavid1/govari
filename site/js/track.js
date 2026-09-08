/* ============================================================
   גוב ארי — מדידה: Meta Pixel + לכידת ייחוס + אירועי משפך.
   עיקרון: כשל בסקריפט מדידה לעולם לא מפיל טופס. אירוע Lead רק אחרי
   אישור מהשרת. dataLayer נתמך אם קיים GTM.
   ============================================================ */
(function () {
  'use strict';
  var G = window.GOVARI || {};
  var LS_KEY = 'govari_attribution';

  /* ---------- לכידת ייחוס (UTM / fbclid / gclid / referrer) ---------- */
  function captureAttribution() {
    var stored = {};
    try { stored = JSON.parse(sessionStorage.getItem(LS_KEY) || '{}'); } catch (e) {}
    var q = new URLSearchParams(location.search);
    var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    var fresh = {};
    keys.forEach(function (k) { if (q.get(k)) fresh[k] = q.get(k).slice(0, 200); });
    if (q.get('fbclid')) fresh.fbclid = q.get('fbclid').slice(0, 400);
    if (q.get('gclid')) fresh.gclid = q.get('gclid').slice(0, 400);

    // הגשה ראשונה בביקור קובעת; לא דורסים ייחוס קיים אלא אם הגיע חדש
    var merged = Object.keys(fresh).length ? fresh : stored;
    if (!merged.landing_page) merged.landing_page = stored.landing_page || location.pathname;
    if (!merged.referrer) merged.referrer = stored.referrer || document.referrer || '';
    merged.page_url = location.href;

    try { sessionStorage.setItem(LS_KEY, JSON.stringify(merged)); } catch (e) {}
    return merged;
  }

  function readCookie(name) {
    var m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? m.pop() : '';
  }

  window.govariAttribution = function () {
    var a = captureAttribution();
    var out = {};
    Object.keys(a).forEach(function (k) { out[k] = a[k]; });
    var fbp = readCookie('_fbp'); if (fbp) out.fbp = fbp;
    var fbc = readCookie('_fbc');
    if (!fbc && a.fbclid) fbc = 'fb.1.' + Date.now() + '.' + a.fbclid;
    if (fbc) out.fbc = fbc;
    return out;
  };

  /* ---------- Meta Pixel — נטען רק אם יש מזהה ---------- */
  var pixelReady = false;
  function loadPixel() {
    if (pixelReady || !G.metaPixelId) return;
    try {
      /* eslint-disable */
      !function (f, b, e, v, n, t, s) {
        if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) };
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
        t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s)
      }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      /* eslint-enable */
      window.fbq('init', G.metaPixelId);
      window.fbq('track', 'PageView');
      pixelReady = true;
    } catch (e) { /* מדידה לא קריטית */ }
  }

  /* ---------- אירוע משפך אחיד ---------- */
  window.govariTrack = function (name, params, opts) {
    params = params || {};
    opts = opts || {};
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: 'govari_' + name }, params));
    } catch (e) {}
    try {
      if (window.fbq) {
        if (name === 'lead_submit_success') {
          window.fbq('track', 'Lead', { currency: 'ILS', value: 0 }, opts.eventId ? { eventID: opts.eventId } : undefined);
        } else if (name === 'hero_view' || name === 'lead_form_view') {
          window.fbq('track', 'ViewContent', { content_name: name });
        } else {
          window.fbq('trackCustom', 'govari_' + name, params);
        }
      }
    } catch (e) {}
    if (window.__govariDebug) console.log('[track]', name, params, opts);
  };

  captureAttribution();
  loadPixel();
  window.govariTrack('page_view', { path: location.pathname });
})();
