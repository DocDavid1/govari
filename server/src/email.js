import { Resend } from 'resend';
import { config, emailEnabled } from './config.js';
import * as tpl from './templates.js';

const resend = emailEnabled() ? new Resend(config.email.resendApiKey) : null;

async function send(to, { subject, html }) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY חסר — מדלג על מייל "${subject}" אל ${to}`);
    return { sent: false, skipped: true };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: config.email.from,
      to,
      subject,
      html,
    });
    if (error) {
      console.error('[email] שגיאת Resend:', error);
      return { sent: false, error };
    }
    return { sent: true, id: data?.id };
  } catch (err) {
    console.error('[email] כשל בשליחה:', err);
    return { sent: false, error: err };
  }
}

// התראה לבעלים על הזמנה חדשה
export function notifyOwnerNewOrder(order) {
  return send(config.email.ownerEmail, tpl.ownerNewOrder(order));
}

// התראה לבעלים על תשלום שהתקבל
export function notifyOwnerPaid(order) {
  return send(config.email.ownerEmail, tpl.ownerPaid(order));
}

// אישור ללקוח (paid=true אחרי סליקה, אחרת אישור קבלת הזמנה)
export function sendCustomerConfirmation(order, { paid }) {
  return send(order.customer.email, tpl.customerConfirmation(order, { paid }));
}
