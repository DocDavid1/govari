// ============================================================
//  אדפטר סליקה גנרי — נקודת החיבור היחידה לספק התשלומים.
//  כשתבחר ספק (PayPlus / משולם / Cardcom / Tranzila / Stripe...),
//  מלא את שני הפונקציות למטה לפי ה-API שלו. שאר המערכת לא משתנה.
//
//  זרימה סטנדרטית (רוב הספקים בישראל):
//   1) createCheckout(): שולחים לספק סכום + מזהה הזמנה + returnUrl + webhookUrl,
//      מקבלים בחזרה כתובת של "דף תשלום מאובטח" (hosted page) ומפנים אליה את הלקוח.
//   2) הלקוח משלם בדף של הספק.
//   3) הספק שולח webhook לשרת שלנו (POST) עם תוצאת התשלום → verifyWebhook().
//   4) הלקוח מוחזר ל-returnUrl (עמוד תודה).
// ============================================================
import { config, paymentEnabled } from './config.js';

export function isConfigured() {
  return paymentEnabled();
}

/**
 * יוצר "סשן תשלום" אצל הספק ומחזיר כתובת הפניה.
 * @returns {Promise<{configured:boolean, redirectUrl:string|null}>}
 */
export async function createCheckout(order, { returnUrl, webhookUrl }) {
  if (!isConfigured()) {
    // עדיין ללא סליקה — ההזמנה נשמרת ומייל נשלח; אין הפניה לתשלום.
    return { configured: false, redirectUrl: null };
  }

  // ====== מלא כאן לפי הספק שבחרת ======
  // דוגמה כללית (החלף בכתובת ובגוף שה-API של הספק דורש):
  //
  //   const res = await fetch(config.payment.apiUrl, {
  //     method: 'POST',
  //     headers: {
  //       'Content-Type': 'application/json',
  //       'Authorization': `Bearer ${config.payment.apiKey}`,
  //     },
  //     body: JSON.stringify({
  //       amount: order.amount,
  //       currency: order.currency,      // 'ILS'
  //       order_id: order.id,
  //       description: order.product,
  //       customer: {
  //         name: order.customer.name,
  //         email: order.customer.email,
  //         phone: order.customer.phone,
  //       },
  //       success_url: returnUrl,        // חזרה לעמוד תודה
  //       callback_url: webhookUrl,      // לכאן הספק שולח את אישור התשלום
  //     }),
  //   });
  //   const data = await res.json();
  //   return { configured: true, redirectUrl: data.payment_page_url };
  //
  // הערות לפי ספק:
  //  • PayPlus:  POST /api/v1.0/PaymentPages/generateLink  → data.payment_page_link
  //  • משולם/Grow: POST /createPaymentProcess            → data.url
  //  • Cardcom:  LowProfile/Create                        → ResponseUrl
  //  • Tranzila: iframe/redirect עם terminal              → URL בנוי
  //  • Stripe:   stripe.checkout.sessions.create()        → session.url
  // ===================================

  throw new Error(
    `PAYMENT_PROVIDER="${config.payment.provider}" מוגדר אך createCheckout() טרם מומש. השלם את src/payment.js.`
  );
}

/**
 * מאמת ומפענח webhook מהספק.
 * חשוב: אמת חתימה (PAYMENT_WEBHOOK_SECRET) לפי הספק לפני שמסמנים "שולם".
 * @returns {{orderId:string|undefined, paid:boolean, ref:string|null}}
 */
export function verifyWebhook(req) {
  // ====== מלא כאן אימות חתימה לפי הספק ======
  // דוגמה: השווה חתימה מתוך header לחתימה שחישבת מ-body + PAYMENT_WEBHOOK_SECRET.
  // אם החתימה לא תואמת — החזר { paid:false }.
  const b = req.body || {};
  const orderId = b.order_id || b.orderId || b.more_info || undefined;
  const paid =
    b.status === 'paid' ||
    b.status === 'approved' ||
    b.transaction_type === 'charge' ||
    b.paid === true;
  const ref = b.transaction_id || b.transactionId || b.ref || b.approval_number || null;
  return { orderId, paid: Boolean(paid), ref };
}
