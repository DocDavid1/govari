// ולידציה בסיסית לקלט הזמנה — ללא תלות בספריות חיצוניות.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-\s()]{7,20}$/;

export function validateOrderInput(body) {
  const errors = [];
  const b = body || {};
  const c = b.customer || {};

  const name = String(c.name || '').trim();
  const phone = String(c.phone || '').trim();
  const email = String(c.email || '').trim();
  const quantity = parseInt(b.quantity || 1, 10);

  if (name.length < 2) errors.push('שם מלא חסר או קצר מדי');
  if (!PHONE_RE.test(phone)) errors.push('מספר טלפון לא תקין');
  if (email && !EMAIL_RE.test(email)) errors.push('כתובת אימייל לא תקינה'); // אימייל אופציונלי
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
    errors.push('כמות לא תקינה');
  }

  const clean = {
    quantity,
    customer: {
      name,
      phone,
      email,
      city: String(c.city || '').trim().slice(0, 80),
      address: String(c.address || '').trim().slice(0, 200),
      notes: String(c.notes || '').trim().slice(0, 500),
    },
  };

  return { ok: errors.length === 0, errors, clean };
}
