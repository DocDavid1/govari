// תבניות מייל בעברית (RTL). מחזירות { subject, html }.
import { config } from './config.js';

function money(n) {
  return `${Number(n).toLocaleString('he-IL')} ₪`;
}

function shell(title, bodyHtml) {
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"></head>
<body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#14141a">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="background:#0b0b0d;border-radius:14px 14px 0 0;padding:20px 24px;color:#fff">
      <span style="font-size:20px;font-weight:800">גוב ארי</span>
      <span style="color:#8a8a95;font-size:12px"> · מערכות אבטחה</span>
    </div>
    <div style="background:#fff;border:1px solid #e6e6ea;border-top:0;border-radius:0 0 14px 14px;padding:24px">
      <h1 style="font-size:20px;margin:0 0 16px">${title}</h1>
      ${bodyHtml}
    </div>
    <p style="color:#8a8a95;font-size:12px;text-align:center;margin-top:16px">גוב ארי מערכות · מצלמות רכב מחוברות 24/7</p>
  </div>
</body></html>`;
}

function orderTable(order) {
  const c = order.customer;
  return `
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 16px">
    <tr><td style="padding:6px 0;color:#666">מספר הזמנה</td><td style="padding:6px 0;font-weight:700">${order.id}</td></tr>
    <tr><td style="padding:6px 0;color:#666">מוצר</td><td style="padding:6px 0">${order.product}</td></tr>
    <tr><td style="padding:6px 0;color:#666">כמות</td><td style="padding:6px 0">${order.quantity}</td></tr>
    <tr><td style="padding:6px 0;color:#666">סכום</td><td style="padding:6px 0;font-weight:800">${money(order.amount)}</td></tr>
  </table>
  <table style="width:100%;border-collapse:collapse;font-size:14px;border-top:1px solid #eee;padding-top:8px">
    <tr><td style="padding:6px 0;color:#666">שם</td><td style="padding:6px 0">${c.name}</td></tr>
    <tr><td style="padding:6px 0;color:#666">טלפון</td><td style="padding:6px 0">${c.phone}</td></tr>
    <tr><td style="padding:6px 0;color:#666">אימייל</td><td style="padding:6px 0">${c.email}</td></tr>
    ${c.city ? `<tr><td style="padding:6px 0;color:#666">עיר</td><td style="padding:6px 0">${c.city}</td></tr>` : ''}
    ${c.address ? `<tr><td style="padding:6px 0;color:#666">כתובת</td><td style="padding:6px 0">${c.address}</td></tr>` : ''}
    ${c.notes ? `<tr><td style="padding:6px 0;color:#666">הערות</td><td style="padding:6px 0">${c.notes}</td></tr>` : ''}
  </table>`;
}

// מייל לבעלים — הזמנה חדשה התקבלה
export function ownerNewOrder(order) {
  return {
    subject: `🔔 הזמנה חדשה ${order.id} · ${money(order.amount)}`,
    html: shell('התקבלה הזמנה חדשה', `
      <p style="color:#444">הזמנה חדשה נכנסה למערכת (ממתינה לתשלום/יצירת קשר):</p>
      ${orderTable(order)}
      <p style="font-size:13px;color:#888">סטטוס: ${order.status === 'paid' ? 'שולם' : 'ממתין לתשלום'}</p>`),
  };
}

// מייל לבעלים — התקבל תשלום
export function ownerPaid(order) {
  return {
    subject: `✅ תשלום התקבל — הזמנה ${order.id} · ${money(order.amount)}`,
    html: shell('התקבל תשלום על הזמנה', `
      <p style="color:#444">התקבל תשלום על ההזמנה הבאה:</p>
      ${orderTable(order)}
      <p style="font-size:13px;color:#888">אסמכתת סליקה: ${order.payment.ref || '—'}</p>`),
  };
}

// מייל ללקוח — אישור תשלום/הזמנה
export function customerConfirmation(order, { paid }) {
  const title = paid ? 'התשלום התקבל — תודה על הזמנתך!' : 'קיבלנו את הזמנתך!';
  const intro = paid
    ? 'תודה שרכשת מגוב ארי מערכות. התשלום התקבל וההזמנה שלך נקלטה בהצלחה.'
    : 'תודה על הזמנתך מגוב ארי מערכות. קיבלנו את הפרטים וניצור איתך קשר להשלמת התהליך.';
  return {
    subject: paid ? `אישור תשלום · הזמנה ${order.id}` : `אישור הזמנה · ${order.id}`,
    html: shell(title, `
      <p style="color:#444">${intro}</p>
      ${orderTable(order)}
      <p style="color:#444">לכל שאלה אנחנו כאן: <a href="tel:0536813013" style="color:#e11623">053-6813013</a>
      או בוואטסאפ <a href="https://wa.me/972536813013" style="color:#e11623">כאן</a>.</p>`),
  };
}
