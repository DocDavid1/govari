import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config, paymentEnabled, emailEnabled, usePg, metaCapiEnabled, adminEnabled } from './src/config.js';
import { validateOrderInput } from './src/validate.js';
import { createOrder, getOrder, markPaid } from './src/orders.js';
import { getCoupon } from './src/coupons.js';
import * as email from './src/email.js';
import * as payment from './src/payment.js';

import { cleanLeadInput, createLead } from './src/leads.js';
import { processOutbox, outboxHealth } from './src/outbox.js';
import { dbHealth } from './src/db.js';
import { sendEmergencyAdminEmail } from './src/notify.js';
import { basicAuth, renderLeadsPage, handleStatusUpdate, handleCsv } from './src/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1); // Vercel / פרוקסי — כדי ש-req.ip יהיה נכון ל-rate-limit

app.use(cors());
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));

// ---- כותרות אבטחה בסיסיות ----
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

const ipOf = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip;

// ============================================================
//  Health
// ============================================================
app.get(['/health', '/api/health'], async (req, res) => {
  const [db, ob] = await Promise.all([dbHealth(), outboxHealth()]);
  const healthy = db.ok !== false && (ob.stuck == null || ob.stuck === 0);
  res.status(healthy ? 200 : 503).json({
    ok: healthy,
    time: new Date().toISOString(),
    db,
    outbox: ob,
    email: emailEnabled() ? 'on' : 'off',
    metaCapi: metaCapiEnabled() ? 'on' : 'off',
    admin: adminEnabled() ? 'on' : 'off',
    payment: paymentEnabled() ? config.payment.provider : 'none',
  });
});

// ============================================================
//  לידים — הנתיב העיקרי (שם + טלפון → החברה מתקשרת חזרה)
// ============================================================
const leadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, errors: ['יותר מדי ניסיונות. נסו שוב עוד כמה דקות או התקשרו אלינו.'] },
});

// תשובת HTML מינימלית להגשת טופס ללא JS (progressive enhancement)
const wantsHtml = (req) =>
  req.get('x-requested-with') !== 'fetch' &&
  String(req.get('accept') || '').includes('text/html');
const htmlPage = (title, body) => `<!DOCTYPE html><html lang="he" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · גוב ארי</title><style>body{font:16px/1.7 -apple-system,Segoe UI,Arial,sans-serif;
background:#08080a;color:#f6f6f8;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px}
a{color:#e7c877}.c{max-width:420px}</style></head><body><div class="c">${body}</div></body></html>`;

app.post('/api/leads', leadLimiter, async (req, res) => {
  const asHtml = wantsHtml(req);

  // honeypot — שדה נסתר שבוט ממלא. מחזירים "הצלחה" בלי לשמור.
  if (req.body && (req.body.company || req.body.website || req.body.fax)) {
    return asHtml
      ? res.send(htmlPage('תודה', '<h1>קיבלנו את הפרטים 👍</h1><p><a href="/">חזרה לאתר</a></p>'))
      : res.json({ ok: true, leadId: 'skipped', spam: true });
  }

  const { ok, errors, clean } = cleanLeadInput(req.body);
  if (!ok) {
    return asHtml
      ? res.status(400).send(htmlPage('שגיאה', `<h1>לא הצלחנו לקלוט</h1><p>${errors.join(' · ')}</p><p><a href="/">חזרה</a></p>`))
      : res.status(400).json({ ok: false, errors });
  }

  const meta = { ip: ipOf(req), userAgent: req.get('user-agent') };

  try {
    const result = await createLead(clean, meta);

    // best-effort — הנתיב האמין הוא ה-Cron על /api/outbox/tick
    processOutbox({ max: 6 }).catch((e) => console.error('[outbox inline]', e.message));

    if (asHtml) {
      return res.send(htmlPage('תודה',
        '<h1>קיבלנו את הפרטים 👍</h1><p>נציג של גוב ארי יחזור אליך בהקדם. אין חיוב ולא בוצע תשלום.</p><p><a href="/">חזרה לאתר</a></p>'));
    }
    return res.json({
      ok: true,
      leadId: result.leadId,
      submissionId: result.submissionId,
      deduped: result.deduped || false,
      eventId: result.submissionId, // לדדופ מול פיקסל הדפדפן
    });
  } catch (err) {
    console.error('[leads] persistence failed:', err);

    // מצב B — המסד לא זמין. מנסים ערוץ חירום עמיד לפני שמצהירים הצלחה.
    let rescued = false;
    if (emailEnabled()) {
      try {
        await sendEmergencyAdminEmail({
          fullName: clean.fullName, phoneRaw: clean.phoneRaw,
          city: clean.city, notes: clean.notes, reason: err.message,
        });
        rescued = true;
      } catch (e2) {
        console.error('[leads] emergency email failed:', e2.message);
      }
    }

    if (rescued) {
      return asHtml
        ? res.send(htmlPage('תודה', '<h1>קיבלנו את הפרטים 👍</h1><p>נחזור אליך בהקדם.</p><p><a href="/">חזרה לאתר</a></p>'))
        : res.status(200).json({ ok: true, degraded: true, leadId: 'emergency' });
    }
    // מצב C — גם המסד וגם החירום נכשלו. אומרים אמת ומציעים ערוצים ישירים.
    const waMsg = encodeURIComponent(`היי, ניסיתי להשאיר פרטים באתר וזה לא עבר. שם: ${clean.fullName} · טלפון: ${clean.phoneRaw}`);
    if (asHtml) {
      return res.status(503).send(htmlPage('לא נשמר',
        `<h1>לא הצלחנו לשמור כרגע</h1><p>אפשר לשלוח לנו הודעה בלחיצה אחת או להתקשר.</p>
         <p><a href="https://wa.me/972536813013?text=${waMsg}">שליחה בוואטסאפ</a> · <a href="tel:+972536813013">חייגו 053-6813013</a></p>`));
    }
    return res.status(503).json({
      ok: false,
      errors: ['לא הצלחנו לשמור את הפרטים כרגע.'],
      fallback: true,
    });
  }
});

// ============================================================
//  Outbox tick — Vercel Cron / cron-job.org
// ============================================================
app.all(['/api/outbox/tick', '/api/cron/outbox'], async (req, res) => {
  const secret = config.outboxTickSecret;
  const provided = req.query.key || req.get('x-outbox-key') || '';
  const isVercelCron = Boolean(req.get('x-vercel-cron'));
  if (secret && provided !== secret && !isVercelCron) {
    return res.status(403).json({ ok: false });
  }
  const summary = await processOutbox({ max: 40 });
  res.json({ ok: true, ...summary });
});

// ============================================================
//  אדמין לידים (Basic Auth; כבוי ללא ADMIN_USER/PASSWORD)
// ============================================================
app.get('/admin/leads.csv', basicAuth, handleCsv);
app.get('/admin/leads', basicAuth, renderLeadsPage);
app.post('/admin/leads/:id', basicAuth, handleStatusUpdate);

// ============================================================
//  הזמנה מלאה (משני — נשאר לתאימות; ה-CTA הקר הוא ליד)
// ============================================================
const orderLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

app.post('/api/orders', orderLimiter, async (req, res) => {
  const { ok, errors, clean } = validateOrderInput(req.body);
  if (!ok) return res.status(400).json({ ok: false, errors });

  try {
    const coupon = getCoupon(req.body.coupon);
    const order = await createOrder({ ...clean, coupon });
    email.notifyOwnerNewOrder(order).catch((e) => console.error(e));

    if (order.amount === 0) {
      const paidOrder = await markPaid(order.id, order.coupon ? 'COUPON:' + order.coupon.code : 'FREE');
      email.sendCustomerConfirmation(paidOrder, { paid: true }).catch((e) => console.error(e));
      email.notifyOwnerPaid(paidOrder).catch((e) => console.error(e));
      return res.json({ ok: true, orderId: order.id, free: true, redirectUrl: `/order-success.html?order=${order.id}` });
    }
    if (paymentEnabled()) {
      const returnUrl = `${config.siteUrl}/api/payment/return?order=${order.id}`;
      const webhookUrl = `${config.siteUrl}/api/payment/webhook`;
      const { redirectUrl } = await payment.createCheckout(order, { returnUrl, webhookUrl });
      return res.json({ ok: true, orderId: order.id, paymentConfigured: true, redirectUrl });
    }
    email.sendCustomerConfirmation(order, { paid: false }).catch((e) => console.error(e));
    return res.json({ ok: true, orderId: order.id, paymentConfigured: false, redirectUrl: `/order-success.html?order=${order.id}` });
  } catch (err) {
    console.error('[orders] שגיאה:', err);
    return res.status(500).json({ ok: false, errors: ['שגיאה בשרת. נסו שוב או צרו קשר.'] });
  }
});

app.post('/api/coupon', (req, res) => {
  const c = getCoupon(req.body.code);
  if (!c) return res.json({ ok: false });
  res.json({ ok: true, code: c.code, percent: c.percent, label: c.label });
});

app.post('/api/payment/webhook', async (req, res) => {
  try {
    const { orderId, paid, ref } = payment.verifyWebhook(req);
    if (paid && orderId) {
      const order = await markPaid(orderId, ref);
      if (order) {
        email.sendCustomerConfirmation(order, { paid: true }).catch((e) => console.error(e));
        email.notifyOwnerPaid(order).catch((e) => console.error(e));
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[webhook] שגיאה:', err);
    res.status(200).json({ ok: false });
  }
});

app.get('/api/payment/return', async (req, res) => {
  const id = req.query.order;
  res.redirect(`/order-success.html?order=${encodeURIComponent(id || '')}`);
});

app.get('/api/orders/:id', async (req, res) => {
  const order = await getOrder(req.params.id);
  if (!order) return res.status(404).json({ ok: false });
  res.json({ ok: true, id: order.id, status: order.status, amount: order.amount, currency: order.currency, product: order.product });
});

// ---- הגשת האתר הסטטי (מקומי בלבד; ב-Vercel האתר מוגש סטטית) ----
if (config.serveSite) {
  const siteDir = path.join(__dirname, '..', 'site');
  app.use(express.static(siteDir));
  app.get('/', (req, res) => res.sendFile(path.join(siteDir, 'index.html')));
}

// ---- מטפל שגיאות אחרון — אין stack ללקוח ----
app.use((err, req, res, next) => {
  console.error('[unhandled]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ ok: false, errors: ['שגיאה בשרת.'] });
});

export default app;
