// ===== גוב ארי מערכות — interactions =====
(function () {
  'use strict';

  // נגישות: קישור "דלג לתוכן" + סימון אזור התוכן הראשי
  if (document.body && !document.querySelector('.skip-link')) {
    document.body.insertAdjacentHTML('afterbegin', '<a href="#content" class="skip-link">דלג לתוכן</a>');
  }
  var mainEl = document.querySelector('main');
  if (mainEl && !mainEl.id) mainEl.id = 'content';

  // Year
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // Sticky header state
  var header = document.querySelector('.site-header');
  function onScroll() {
    if (header) header.classList.toggle('scrolled', window.scrollY > 20);
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Mobile nav
  var burger = document.querySelector('.burger');
  if (burger && header) {
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'תפריט');
    burger.addEventListener('click', function () {
      var open = header.classList.toggle('mobile-open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    header.querySelectorAll('.nav-links a').forEach(function (a) {
      a.addEventListener('click', function () {
        header.classList.remove('mobile-open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Top offer bar — dismissible, remembered
  var topbar = document.getElementById('topbar');
  var tbClose = document.getElementById('tbClose');
  if (topbar && tbClose) {
    try { if (localStorage.getItem('gav-topbar') === 'hidden') topbar.classList.add('hide'); } catch (e) {}
    tbClose.addEventListener('click', function () {
      topbar.classList.add('hide');
      try { localStorage.setItem('gav-topbar', 'hidden'); } catch (e) {}
    });
  }

  // Scroll reveal
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); ro.unobserve(e.target); }
      });
    }, { threshold: 0.14 });
    reveals.forEach(function (el) { ro.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  // Autoplay short loops only when in view (saves battery/data)
  var vids = document.querySelectorAll('video[data-inview]');
  if ('IntersectionObserver' in window) {
    var vo = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var v = e.target;
        if (e.isIntersecting) { v.play().catch(function () {}); }
        else { v.pause(); }
      });
    }, { threshold: 0.35 });
    vids.forEach(function (v) { vo.observe(v); });
  }

  // Sticky story: highlight step + swap frame based on scroll
  var steps = document.querySelectorAll('.story-step');
  var frames = document.querySelectorAll('.story-media .frame');
  if (steps.length && frames.length && 'IntersectionObserver' in window) {
    var so = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var i = +e.target.getAttribute('data-step');
        steps.forEach(function (s) { s.classList.toggle('active', +s.getAttribute('data-step') === i); });
        frames.forEach(function (f) { f.classList.toggle('active', +f.getAttribute('data-step') === i); });
      });
    }, { threshold: 0.6 });
    steps.forEach(function (s) { so.observe(s); });
  }

  // Order form -> WhatsApp/summary (no backend; opens WhatsApp with prefilled text)
  var form = document.getElementById('orderForm');
  if (form) {
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var d = new FormData(form);
      var msg = 'הזמנה מראש — גוב ארי (דגם 24/7)%0A' +
        'שם: ' + (d.get('name') || '') + '%0A' +
        'טלפון: ' + (d.get('phone') || '') + '%0A' +
        'עיר: ' + (d.get('city') || '') + '%0A' +
        'הערות: ' + (d.get('notes') || '');
      window.open('https://wa.me/972536813013?text=' + msg, '_blank');
    });
  }

  // מצב כהה בלבד — הוסר מתג יום/לילה (פלטת שחור·זהב אחת)

  // ===== חלון המרה — exit-intent + טיימר + גלילה, פעם אחת לביקור =====
  (function ctaModal() {
    var seen = false;
    try { seen = sessionStorage.getItem('gav-cta') === '1'; } catch (e) {}
    if (seen) return;

    var modal = document.createElement('div');
    modal.className = 'cta-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML =
      '<div class="cta-modal-overlay" data-close></div>' +
      '<div class="cta-modal-card">' +
        '<button class="cta-modal-close" data-close aria-label="סגירה">×</button>' +
        '<div class="cta-modal-banner"><img src="assets/images/hero-bg.webp" alt="מצלמת גוב ארי"></div>' +
        '<div class="cta-modal-body">' +
          '<span class="cta-modal-flag">ללא תשלום עכשיו</span>' +
          '<h3>הדגם שנחת השבוע בישראל</h3>' +
          '<p class="cta-modal-sub">4 ערוצים, כיסוי 360° וחיבור 4G. משאירים פרטים בלי לשלם — נחזור אליכם לתיאום.</p>' +
          '<div class="cta-modal-price">1,090 <span class="cur">₪</span></div>' +
          '<div class="cta-modal-actions">' +
            '<a class="btn btn-primary btn-block btn-lg" href="checkout.html">להזמנה — ללא תשלום</a>' +
            '<a class="btn btn-ghost btn-block" href="https://wa.me/972536813013" target="_blank" rel="noopener">שאלה מהירה? וואטסאפ</a>' +
          '</div>' +
          '<p class="cta-modal-trust">0 ₪ בהזמנה · ללא כרטיס אשראי · אישור מיידי למייל</p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    function open() {
      if (seen) return;
      seen = true;
      try { sessionStorage.setItem('gav-cta', '1'); } catch (e) {}
      modal.classList.add('open');
    }
    function close() { modal.classList.remove('open'); }

    modal.addEventListener('click', function (e) {
      if (e.target.hasAttribute('data-close')) close();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    // exit-intent (דסקטופ): העכבר יוצא מהחלק העליון של החלון
    document.addEventListener('mouseout', function (e) {
      if (!e.relatedTarget && e.clientY <= 0) open();
    });
    // גיבוי בזמן (גם למובייל): אחרי 30 שניות
    setTimeout(open, 30000);
    // טריגר גלילה: אחרי 60% מהעמוד
    var scrolled = false;
    window.addEventListener('scroll', function () {
      if (scrolled) return;
      var p = (window.scrollY + window.innerHeight) / document.body.scrollHeight;
      if (p > 0.6) { scrolled = true; open(); }
    }, { passive: true });
  })();

  // ===== הודעת תרומה צדדית — עדינה, "נותנת חיות" (מוצגת אחרי בחירת עוגיות) =====
  function startDonate() {
    var dismissed = false;
    try { dismissed = localStorage.getItem('gav-donate') === '1'; } catch (e) {}
    if (dismissed) return;
    var t = document.createElement('div');
    t.className = 'donate-toast';
    t.setAttribute('role', 'status');
    t.innerHTML =
      '<svg class="heart" viewBox="0 0 24 24"><path d="M12 21s-7-4.35-9.5-8.5C.5 9 2 5.5 5.2 5.5c1.9 0 3 1 3.8 2 .8-1 1.9-2 3.8-2C16 5.5 17.5 9 15.5 12.5 13 16.65 12 21 12 21z"/></svg>' +
      '<span><b>10% מכל רכישה</b> נתרמים ללוחמי ופצועי צה"ל. <a href="index.html#donation" style="color:#fff;text-decoration:underline">לפרטים</a></span>' +
      '<button class="dt-close" aria-label="סגירה">×</button>';
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 4000);
    t.querySelector('.dt-close').addEventListener('click', function () {
      t.classList.remove('show');
      try { localStorage.setItem('gav-donate', '1'); } catch (e) {}
      setTimeout(function () { t.remove(); }, 500);
    });
  }

  // ===== באנר עוגיות (הסכמה) =====
  var cookieChoice = null;
  try { cookieChoice = localStorage.getItem('gav-cookie'); } catch (e) {}
  if (!cookieChoice) {
    var cb = document.createElement('div');
    cb.className = 'cookie-bar';
    cb.setAttribute('role', 'dialog');
    cb.setAttribute('aria-label', 'הודעה על שימוש בעוגיות');
    cb.innerHTML =
      '<p>אנו משתמשים בעוגיות כדי לתפעל את האתר ולשפר את חוויית הגלישה. לפרטים — <a href="privacy.html">מדיניות הפרטיות</a>.</p>' +
      '<div class="cookie-actions">' +
        '<button class="btn btn-ghost btn-sm" data-cookie="essential">חיוניות בלבד</button>' +
        '<button class="btn btn-primary btn-sm" data-cookie="all">מקובל</button>' +
      '</div>';
    document.body.appendChild(cb);
    setTimeout(function () { cb.classList.add('show'); }, 500);
    cb.addEventListener('click', function (e) {
      var c = e.target.getAttribute('data-cookie');
      if (!c) return;
      try { localStorage.setItem('gav-cookie', c); } catch (e2) {}
      cb.classList.remove('show');
      setTimeout(function () { cb.remove(); }, 400);
      startDonate();
    });
  } else {
    startDonate();
  }
})();
