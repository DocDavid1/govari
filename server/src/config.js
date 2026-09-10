import 'dotenv/config';

const bool = (v, def = false) => (v == null || v === '' ? def : String(v) === 'true');

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  siteUrl: (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  serveSite: bool(process.env.SERVE_SITE, true),
  env: process.env.NODE_ENV || 'development',

  databaseUrl: process.env.DATABASE_URL || '',
  pgSsl: bool(process.env.PGSSL, true),

  // מלח לגיבוב IP (לא שומרים IP גולמי). ברירת מחדל חלשה — הגדר בפרודקשן.
  ipHashSalt: process.env.IP_HASH_SALT || 'govari-dev-salt',

  email: {
    resendApiKey: process.env.RESEND_API_KEY || '',
    from: `${process.env.FROM_NAME || 'גוב ארי מערכות'} <${process.env.FROM_EMAIL || 'onboarding@resend.dev'}>`,
    ownerEmail: process.env.OWNER_EMAIL || 'davidazulay75@gmail.com',
  },

  // Meta Conversions API (server-side). ריק = מדלגים (הפיקסל בדפדפן עדיין עובד).
  meta: {
    pixelId: process.env.META_PIXEL_ID || '',
    capiToken: process.env.META_CAPI_TOKEN || '',
    testEventCode: process.env.META_TEST_EVENT_CODE || '',
    graphVersion: process.env.META_GRAPH_VERSION || 'v21.0',
  },

  // ממשק אדמין (/admin/leads) — Basic Auth. ריק = האדמין כבוי (משתמשים בדשבורד Supabase).
  admin: {
    user: process.env.ADMIN_USER || '',
    password: process.env.ADMIN_PASSWORD || '',
  },

  // סוד להפעלת ה-outbox מבחוץ (Vercel Cron / cron-job.org). ריק בפרודקשן = הגנה רק דרך Cron header.
  outboxTickSecret: process.env.OUTBOX_TICK_SECRET || '',

  // גיבוי אופציונלי ל-Google Sheet (Apps Script Web App URL). לעולם לא מקור אמת.
  sheetWebhookUrl: process.env.SHEET_WEBHOOK_URL || '',

  payment: {
    provider: process.env.PAYMENT_PROVIDER || 'none',
    apiUrl: process.env.PAYMENT_API_URL || '',
    apiKey: process.env.PAYMENT_API_KEY || '',
    secret: process.env.PAYMENT_SECRET || '',
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || '',
  },

  product: {
    name: process.env.PRODUCT_NAME || 'מצלמת רכב גוב ארי — 4 ערוצים',
    price: parseInt(process.env.PRODUCT_PRICE || '1090', 10),
    currency: process.env.CURRENCY || 'ILS',
  },
};

// אזהרות תצורה לפרודקשן — נקרא פעם אחת באתחול. לא חושף סודות.
export function warnInsecureConfig() {
  const prod = config.env === 'production' || Boolean(process.env.VERCEL);
  const warn = (m) => console.warn(`[config] ⚠️  ${m}`);
  if (!config.databaseUrl) warn('DATABASE_URL חסר — לידים נשמרים לקובץ JSON ארעי. לא לפרודקשן.');
  if (prod && config.ipHashSalt === 'govari-dev-salt') warn('IP_HASH_SALT הוא ברירת המחדל — הגדר מחרוזת אקראית.');
  if (prod && !config.email.resendApiKey) warn('RESEND_API_KEY חסר — התראות ליד לא יישלחו (ימתינו ב-outbox).');
  if (prod && config.meta.pixelId && !config.meta.capiToken) warn('META_PIXEL_ID מוגדר אך META_CAPI_TOKEN חסר — אין Lead צד-שרת.');
  if (prod && config.meta.testEventCode) warn('META_TEST_EVENT_CODE מוגדר בפרודקשן — אירועים ילכו ל-Test Events בלבד.');
  if (prod && config.serveSite) warn('SERVE_SITE=true בפרודקשן — ב-Vercel האתר אמור להיות סטטי (false).');
}

export const usePg = () => Boolean(config.databaseUrl);
export const emailEnabled = () => Boolean(config.email.resendApiKey);
export const metaCapiEnabled = () => Boolean(config.meta.pixelId && config.meta.capiToken);
export const adminEnabled = () => Boolean(config.admin.user && config.admin.password);
export const sheetBackupEnabled = () => Boolean(config.sheetWebhookUrl);
export const paymentEnabled = () => config.payment.provider && config.payment.provider !== 'none';
