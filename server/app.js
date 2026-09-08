import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config, paymentEnabled, emailEnabled } from './src/config.js';
import { validateOrderInput } from './src/validate.js';
import { createOrder, getOrder, markPaid } from './src/orders.js';
import { getCoupon } from './src/coupons.js';
import * as email from './src/email.js';
import * as payment from './src/payment.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- Health ----
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    email: emailEnabled() ? 'on' : 'off (no RESEND_API_KEY)',
    payment: paymentEnabled() ? config.payment.provider : 'none',
  });
});

// ---- יצירת הזמנה ----
const orderLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20 });

app.post('/api/orders', orderLimiter, async (req, res) => {
  const { ok, errors, clean } = validateOrderInput(req.body);
  if (!ok) return res.status(400).json({ ok: false, errors });

  try {
    const coupon = getCoupon(req.body.coupon); // null אם לא תקין
    const order = await createOrder({ ...clean, coupon });

    // התראה לבעלים על כל הזמנה חדשה (תמיד)
    email.notifyOwnerNewOrder(order).catch((e) => console.error(e));

    // סכום 0 (למשל קופון FREE 100%) → אין צורך בתשלום. מסמנים "שולם" ושולחים אישורים.
    if (order.amount === 0) {
      const paidOrder = await markPaid(order.id, order.coupon ? 'COUPON:' + order.coupon.code : 'FREE');
      email.sendCustomerConfirmation(paidOrder, { paid: true }).catch((e) => console.error(e));
      email.notifyOwnerPaid(paidOrder).catch((e) => console.error(e));
      return res.json({
        ok: true,
        orderId: order.id,
        free: true,
        redirectUrl: `/order-success.html?order=${order.id}`,
      });
    }

    if (paymentEnabled()) {
      // יש סליקה → צור סשן תשלום והפנה את הלקוח
      const returnUrl = `${config.siteUrl}/api/payment/return?order=${order.id}`;
      const webhookUrl = `${config.siteUrl}/api/payment/webhook`;
      const { redirectUrl } = await payment.createCheckout(order, { returnUrl, webhookUrl });
      return res.json({ ok: true, orderId: order.id, paymentConfigured: true, redirectUrl });
    }

    // אין סליקה עדיין → שולחים ללקוח אישור קבלת הזמנה, ומחזירים לעמוד תודה
    email.sendCustomerConfirmation(order, { paid: false }).catch((e) => console.error(e));
    return res.json({
      ok: true,
      orderId: order.id,
      paymentConfigured: false,
      redirectUrl: `/order-success.html?order=${order.id}`,
    });
  } catch (err) {
    console.error('[orders] שגיאה:', err);
    return res.status(500).json({ ok: false, errors: ['שגיאה בשרת. נסו שוב או צרו קשר.'] });
  }
});

// ---- בדיקת קופון (לתצוגת הנחה בצ'קאאוט) ----
app.post('/api/coupon', (req, res) => {
  const c = getCoupon(req.body.code);
  if (!c) return res.json({ ok: false });
  res.json({ ok: true, code: c.code, percent: c.percent, label: c.label });
});

// ---- Webhook מהספק (אישור תשלום) ----
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

// ---- חזרת הדפדפן מהסליקה → עמוד תודה ----
app.get('/api/payment/return', async (req, res) => {
  const id = req.query.order;
  res.redirect(`/order-success.html?order=${encodeURIComponent(id || '')}`);
});

// ---- סטטוס הזמנה (לעמוד התודה) ----
app.get('/api/orders/:id', async (req, res) => {
  const order = await getOrder(req.params.id);
  if (!order) return res.status(404).json({ ok: false });
  res.json({
    ok: true,
    id: order.id,
    status: order.status,
    amount: order.amount,
    currency: order.currency,
    product: order.product,
  });
});

// ---- הגשת האתר הסטטי (מקומי בלבד; ב-Vercel האתר מוגש סטטית) ----
if (config.serveSite) {
  const siteDir = path.join(__dirname, '..', 'site');
  app.use(express.static(siteDir));
  app.get('/', (req, res) => res.sendFile(path.join(siteDir, 'index.html')));
}

export default app;
