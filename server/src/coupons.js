// קופונים — קל להוסיף/לשנות כאן.
// percent = אחוז ההנחה. FREE=100% משמש לבדיקת התהליך המלא ללא תשלום בפועל.
const COUPONS = {
  FREE: { percent: 100, label: 'קופון בדיקה — 100% הנחה' },
  // דוגמאות להמשך:
  // LAUNCH10: { percent: 10, label: 'מבצע השקה — 10% הנחה' },
};

export function getCoupon(code) {
  if (!code) return null;
  const key = String(code).trim().toUpperCase();
  const c = COUPONS[key];
  return c ? { code: key, percent: c.percent, label: c.label } : null;
}
