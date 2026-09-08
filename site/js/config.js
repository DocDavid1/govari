/* ============================================================
   גוב ארי — מקור אמת אחד לעובדות העסק (צד לקוח).
   כל טלפון / וואטסאפ / מחיר / קופי חוזר — מכאן בלבד.
   שרת: server/src/config.js (משתני סביבה).
   ============================================================ */
(function () {
  'use strict';

  var GOVARI = {
    brand: 'גוב ארי מערכות',

    // --- יצירת קשר (לאישור סופי מול דוד לפני קמפיין) ---
    phone: '053-6813013',
    phoneE164: '+972536813013',
    whatsapp: '972536813013',
    email: 'davidazulay75@gmail.com',

    // --- מחיר ---
    price: 1090,
    priceText: '1,090 ₪',
    priceNote: 'מחיר השקה — כולל התקנה. מוצג לשקיפות; אין חיוב בשלב יצירת הקשר.',

    // --- מדיניות ---
    noPaymentLine: 'ללא תשלום וללא התחייבות',
    installationPolicy: 'התקנה עד בית הלקוח בתיאום מראש. באזורים מרוחקים (מצפון לחיפה / מדרום לב"ש) — משלוח + הדרכת התקנה טלפונית, בקיזוז עלות ההתקנה.',

    // --- Meta Pixel (הדבק כאן את מזהה הפיקסל; ריק = הפיקסל כבוי, האתר עובד רגיל) ---
    metaPixelId: '',

    // --- נקודת קצה ללידים ---
    leadEndpoint: '/api/leads',

    // --- קופי CTA אחיד ---
    cta: {
      primary: 'רוצה לשמוע פרטים?',
      primaryShort: 'השאירו פרטים',
      button: 'אני רוצה שיחזרו אליי',
      reassure: 'ללא תשלום וללא התחייבות · נחזור אליכם בהקדם',
      whatsapp: 'שאלה מהירה בוואטסאפ',
    },
  };

  GOVARI.waHref = function (text) {
    var base = 'https://wa.me/' + GOVARI.whatsapp;
    return text ? base + '?text=' + encodeURIComponent(text) : base;
  };
  GOVARI.telHref = 'tel:' + GOVARI.phoneE164;

  window.GOVARI = GOVARI;
})();
