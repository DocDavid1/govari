// נורמליזציה ואימות של מספרי טלפון ישראליים.
// המטרה: לעולם לא לאבד ליד תקין רק בגלל פורמט שונה של מספר.
//
// קלט אפשרי:  0501234567 · 050-123-4567 · 050 123 4567 · +972501234567 ·
//             972-50-1234567 · 00972501234567 · (050) 1234567
// פלט מנורמל: תמיד E.164 ישראלי — "+9725XXXXXXXX" למובייל, "+972NXXXXXXX" לקווי.

const IL_MOBILE_PREFIXES = ['50', '51', '52', '53', '54', '55', '56', '58', '59'];
// קידומות קוויות/עסקיות נפוצות (למקרה שלקוח משאיר מספר משרד)
const IL_LANDLINE_PREFIXES = ['2', '3', '4', '8', '9', '72', '73', '74', '76', '77', '78'];

/**
 * מנקה מספר לפורמט ספרתי בלבד, מזהה קידומת מדינה ומחזיר את "החלק הלאומי"
 * (בלי 0 מוביל, בלי 972).
 * @returns {string} ספרות בלבד של המספר הלאומי, או '' אם לא ניתן לפענח.
 */
function toNationalDigits(input) {
  if (input == null) return '';
  let s = String(input).trim();
  if (!s) return '';

  // המרת ספרות עבריות/ערביות-הודיות אם הודבקו, ואז השארת ספרות ו-+ בלבד
  s = s.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
       .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  s = s.replace(/[^\d+]/g, '');

  // צורות קידומת בינ"ל: +972 / 00972 / 972
  s = s.replace(/^\+/, '');
  if (s.startsWith('00')) s = s.slice(2);
  if (s.startsWith('972')) s = s.slice(3);

  // הסרת 0 לאומי מוביל
  s = s.replace(/^0+/, '');

  return s;
}

/**
 * מנרמל מספר ישראלי ל-E.164. מחזיר null אם המספר אינו נראה כמו מספר IL תקין.
 * @param {string} input
 * @returns {string|null}  למשל "+972501234567"
 */
export function normalizeILPhone(input) {
  const nat = toNationalDigits(input);
  if (!nat) return null;

  // מובייל: 9 ספרות, מתחיל ב-5X
  if (nat.length === 9 && nat[0] === '5' && IL_MOBILE_PREFIXES.includes(nat.slice(0, 2))) {
    return '+972' + nat;
  }
  // קווי: 8-9 ספרות, קידומת אזור מוכרת
  if (nat.length >= 8 && nat.length <= 9) {
    for (const p of IL_LANDLINE_PREFIXES) {
      if (nat.startsWith(p) && nat.length === (p.length + 7)) {
        return '+972' + nat;
      }
    }
  }
  return null;
}

/**
 * האם המספר הוא מובייל ישראלי תקין (הערוץ העיקרי ליצירת קשר חוזר).
 * @param {string} input
 * @returns {boolean}
 */
export function isValidILMobile(input) {
  const e164 = normalizeILPhone(input);
  if (!e164) return false;
  const nat = e164.slice(4); // אחרי "+972"
  return nat.length === 9 && nat[0] === '5' && IL_MOBILE_PREFIXES.includes(nat.slice(0, 2));
}

/**
 * מקבל טלפון תקין (מובייל או קווי). מקל ולא מפסיד לידים —
 * אם זו לא צורה ישראלית מוכרת אבל יש 7-15 ספרות, מחזיר true
 * (הנציג האנושי יסנן; עדיף ליד "מלוכלך" מאשר ליד אבוד).
 */
export function isPlausiblePhone(input) {
  if (isValidILMobile(input) || normalizeILPhone(input)) return true;
  const digits = String(input || '').replace(/[^\d]/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

/**
 * פורמט תצוגה ידידותי למספר מנורמל: "+972501234567" → "050-123-4567"
 */
export function formatILDisplay(e164OrRaw) {
  const e164 = normalizeILPhone(e164OrRaw) || String(e164OrRaw || '');
  const m = e164.match(/^\+972(\d{2})(\d{3})(\d{4})$/);
  if (m) return `0${m[1]}-${m[2]}-${m[3]}`;
  const l = e164.match(/^\+972(\d{1,2})(\d{3})(\d{4})$/);
  if (l) return `0${l[1]}-${l[2]}-${l[3]}`;
  return e164;
}

/** מספר לשימוש בקישור wa.me — ספרות בלבד עם קידומת מדינה, בלי + */
export function toWaNumber(e164OrRaw) {
  const e164 = normalizeILPhone(e164OrRaw);
  return e164 ? e164.replace('+', '') : String(e164OrRaw || '').replace(/[^\d]/g, '');
}
