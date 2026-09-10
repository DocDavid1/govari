/* ============================================================
   גוב ארי — טופס ליד עמיד. עדיפות עליונה: לא לאבד ליד.
   מפעיל כל <form data-lead-form> בעמוד.

   התנהגות:
   • Progressive enhancement — לטופס יש action/method אמיתיים; JS משפר.
   • כשל רשת → ניסיון חוזר עם backoff + ניסיון אוטומטי כשהחיבור חוזר.
   • כפילות לחיצה → נחסמת; idempotency_key זהה בין ניסיונות חוזרים.
   • כשלון מלא (מצב C) → מציג וואטסאפ + טלפון עם השם/מספר שכבר הוקלדו.
   • לעולם לא מנקה את השדות בכשל.
   • אירוע Lead (פיקסל/אנליטיקס) נורה רק אחרי אישור מהשרת.
   ============================================================ */
(function () {
  'use strict';
  var G = window.GOVARI || {};
  var track = window.govariTrack || function () {};

  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'x-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  // אימות טלפון מקל — תואם לשרת (isPlausiblePhone). לא מפסיד לידים.
  function phoneLooksOk(v) {
    var digits = String(v || '').replace(/[^\d]/g, '');
    if (/^0?5\d{8}$/.test(digits.replace(/^972/, '0'))) return true;      // מובייל IL
    if (/^9725\d{8}$/.test(digits)) return true;
    return digits.length >= 7 && digits.length <= 15;                      // סביר — הנציג יסנן
  }

  function init(form) {
    if (form.__leadInit) return;
    form.__leadInit = true;

    var nameEl = form.querySelector('[name="full_name"], [name="name"]');
    var phoneEl = form.querySelector('[name="phone"]');
    var cityEl = form.querySelector('[name="city"]');
    var submitBtn = form.querySelector('[type="submit"], button:not([type])');
    var statusEl = form.querySelector('[data-lead-status]') || (function () {
      var d = document.createElement('div');
      d.setAttribute('data-lead-status', '');
      d.setAttribute('role', 'alert');
      d.setAttribute('aria-live', 'assertive');
      d.style.cssText = 'display:none;margin-top:.7rem;font-size:.95rem;line-height:1.5';
      form.appendChild(d);
      return d;
    })();

    // תכונות נכונות לנייד/נגישות
    if (phoneEl) {
      phoneEl.type = 'tel';
      phoneEl.setAttribute('inputmode', 'tel');
      phoneEl.setAttribute('autocomplete', 'tel');
      phoneEl.setAttribute('dir', 'ltr');
      phoneEl.style.textAlign = 'right';
    }
    if (nameEl) nameEl.setAttribute('autocomplete', 'name');
    if (cityEl) cityEl.setAttribute('autocomplete', 'address-level2');

    var idemKey = uuid();
    var submitting = false;
    var started = false;
    var pendingRetry = null;

    form.addEventListener('input', function () {
      if (!started) { started = true; track('lead_form_started', { form: form.dataset.leadForm || 'lead' }); }
      hideStatus();
    });

    // תצוגת הטופס נספרת פעם אחת כשהוא נכנס למסך
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (e) {
          if (e.isIntersecting) { track('lead_form_view', { form: form.dataset.leadForm || 'lead' }); io.disconnect(); }
        });
      }, { threshold: 0.4 });
      io.observe(form);
    }

    function setStatus(html, tone) {
      statusEl.innerHTML = html;
      statusEl.style.display = 'block';
      statusEl.style.color = tone === 'error' ? '#ff8a8a' : (tone === 'ok' ? '#7ee0a5' : 'var(--muted, #a2a2ad)');
    }
    function hideStatus() { statusEl.style.display = 'none'; }

    function lock(on) {
      submitting = on;
      if (submitBtn) {
        submitBtn.disabled = on;
        if (on) { submitBtn.dataset.label = submitBtn.dataset.label || submitBtn.textContent; submitBtn.textContent = 'שולח…'; }
        else if (submitBtn.dataset.label) submitBtn.textContent = submitBtn.dataset.label;
      }
    }

    function values() {
      return {
        full_name: nameEl ? nameEl.value.trim() : '',
        phone: phoneEl ? phoneEl.value.trim() : '',
        city: cityEl ? cityEl.value.trim() : '',
        company: (form.querySelector('[name="company"]') || {}).value || '', // honeypot
      };
    }

    function validate(v) {
      if (!v.full_name || v.full_name.length < 2) { focusErr(nameEl, 'נא למלא שם מלא'); return false; }
      if (!phoneLooksOk(v.phone)) { focusErr(phoneEl, 'נא למלא מספר טלפון תקין'); return false; }
      return true;
    }
    function focusErr(el, msg) {
      setStatus(msg, 'error');
      if (el) { try { el.focus(); } catch (e) {} }
    }

    // eventId = מזהה ההגשה מהשרת. הוא זהה למזהה שבו משתמש ה-CAPI בצד השרת →
    // Meta מבצע דדופ בין אירוע הדפדפן לאירוע השרת. fireLead=false ל-honeypot.
    function showSuccess(deduped, eventId, fireLead) {
      if (fireLead !== false && eventId) {
        track('lead_submit_success', { form: form.dataset.leadForm || 'lead' }, { eventId: eventId });
      }
      var waText = 'היי, השארתי פרטים באתר גוב ארי ואשמח שתחזרו אליי. שם: ' + (values().full_name || '');
      var box = document.createElement('div');
      box.className = 'lead-success';
      box.setAttribute('role', 'status');
      box.style.cssText = 'text-align:center;padding:1.4rem 0';
      box.innerHTML =
        '<div style="font-size:2.2rem;line-height:1">👍</div>' +
        '<h3 style="margin:.5rem 0 .3rem">קיבלנו את הפרטים</h3>' +
        '<p style="color:var(--muted,#a2a2ad);margin:0 0 1rem">נציג של גוב ארי יחזור אליך בהקדם כדי לענות על שאלות ולבדוק התאמה. אין חיוב ולא בוצע תשלום.</p>' +
        '<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="' + G.waHref(waText) + '">שמור את המספר שלנו בוואטסאפ</a>';
      form.replaceWith(box);
    }

    // מצב C — לא הצלחנו לשמור. לא מנקים כלום. נותנים ערוץ ישיר.
    function showFallback() {
      var v = values();
      var waText = 'היי, ניסיתי להשאיר פרטים באתר וזה לא עבר. שם: ' + v.full_name + ' · טלפון: ' + v.phone;
      setStatus(
        'לא הצלחנו לשמור את הפרטים כרגע. אפשר לשלוח לנו הודעה בלחיצה אחת או להתקשר — הפרטים שהקלדת נשמרו כאן.' +
        '<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.7rem">' +
          '<a class="btn btn-primary btn-sm" target="_blank" rel="noopener" href="' + G.waHref(waText) + '">שליחה בוואטסאפ</a>' +
          '<a class="btn btn-ghost btn-sm" href="' + G.telHref + '">חייגו ' + (G.phone || '') + '</a>' +
        '</div>', 'error');
      track('lead_submit_error', { form: form.dataset.leadForm || 'lead', mode: 'fallback' });
    }

    async function send(v, attempt) {
      attempt = attempt || 1;
      var payload = {
        full_name: v.full_name,
        phone: v.phone,
        city: v.city || undefined,
        company: v.company || undefined,
        idempotency_key: idemKey,
        attribution: (window.govariAttribution ? window.govariAttribution() : {}),
      };

      var ctrl = ('AbortController' in window) ? new AbortController() : null;
      var to = ctrl ? setTimeout(function () { ctrl.abort(); }, 12000) : null;

      try {
        var res = await fetch(form.getAttribute('action') || G.leadEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
          body: JSON.stringify(payload),
          signal: ctrl ? ctrl.signal : undefined,
          keepalive: true,
        });
        if (to) clearTimeout(to);
        var data = {};
        try { data = await res.json(); } catch (e) {}

        if (res.ok && data.ok) { lock(false); showSuccess(data.deduped, data.eventId, true); return; }

        if (res.status === 400 && data.errors) {
          lock(false);
          setStatus(data.errors.join(' · '), 'error');
          track('lead_submit_error', { form: form.dataset.leadForm || 'lead', mode: 'validation' });
          return;
        }
        if (res.status === 429) {
          lock(false);
          setStatus((data.errors && data.errors[0]) || 'יותר מדי ניסיונות. נסו שוב עוד כמה דקות.', 'error');
          return;
        }
        // 503 / 5xx / fallback → מצב C
        lock(false);
        showFallback();
      } catch (err) {
        if (to) clearTimeout(to);
        // כשל רשת / timeout — ניסיון חוזר, ואם אין רשת נחכה לחזרתה
        if (attempt < 4 && navigator.onLine !== false) {
          setStatus('בעיית חיבור זמנית — מנסה שוב…', 'info');
          setTimeout(function () { send(v, attempt + 1); }, attempt * 1500);
          return;
        }
        if (navigator.onLine === false) {
          setStatus('אין חיבור לאינטרנט כרגע. נשלח אוטומטית ברגע שהחיבור יחזור — אל תסגרו את הדף.', 'info');
          pendingRetry = v;
          return;
        }
        lock(false);
        showFallback();
      }
    }

    window.addEventListener('online', function () {
      if (pendingRetry) {
        var v = pendingRetry; pendingRetry = null;
        setStatus('החיבור חזר — שולח…', 'info');
        send(v, 1);
      }
    });

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (submitting) return;
      hideStatus();
      var v = values();

      if (v.company) { showSuccess(false, null, false); return; } // honeypot — UI מדומה, בלי אירוע Lead
      if (!validate(v)) return;

      lock(true);
      track('lead_submit_attempt', { form: form.dataset.leadForm || 'lead' });
      send(v, 1);
    });
  }

  function boot() {
    document.querySelectorAll('form[data-lead-form]').forEach(init);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
