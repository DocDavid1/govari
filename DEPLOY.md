# העלאה לאוויר — גוב ארי (משפך ליד)

**מטרה:** תנועת מטא → ליד (שם + טלפון) שנשמר במסד, עם התראה מיידית. **לא צ'קאאוט.**

**סקירה:** Supabase = מסד הנתונים (מקור האמת). Vercel = אירוח (אתר סטטי + פונקציית API מאותו דומיין). Resend = מייל התראה. Meta Pixel + CAPI = מדידה.

```
site/            ← האתר הסטטי
api/index.js     ← פונקציית Vercel (עוטפת server/app.js)
server/          ← Express: /api/leads, /api/health, /api/outbox/tick, /admin/leads
server/migrations/001_init_leads.sql   ← סכימת הלידים (רצה אוטומטית)
vercel.json      ← ניתוב + Cron ל-outbox + כותרות אבטחה
```

---

## שלב 1 — Supabase (מסד)

1. [supabase.com](https://supabase.com) → **New Project**. שמור את סיסמת ה-DB.
2. **Project Settings → Database → Connection string → "Connection pooling"** (מצב **Transaction**, פורט **6543**) — חובה ל-serverless.
   מחרוזת בסגנון: `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`
   זהו `DATABASE_URL`.
3. הסכימה (`leads`, `lead_submissions`, `lead_events` + אינדקסים) נוצרת **אוטומטית** ב-cold start הראשון. ליצירה ידנית: **SQL Editor** → הדבק את תוכן `server/migrations/001_init_leads.sql`.
4. **גיבוי:** Supabase → **Database → Backups**. בתוכנית Free יש גיבוי יומי (שמירה 7 ימים). בתוכנית Pro — Point-in-Time Recovery. מומלץ Pro לפני קמפיין בהיקף.

## שלב 2 — GitHub

הריפו כבר קיים: `github.com/DocDavid1/govari`. דחוף שינויים (`git push`). `.env` ו-`node_modules` לא עולים (`.gitignore`).

## שלב 3 — Vercel

1. Vercel → **Add New → Project → Import** את `DocDavid1/govari`.
2. Framework Preset: **Other**. Root Directory: ריק. אין Build Command (`vercel.json` מגדיר הכול).
3. **Settings → Environment Variables** (ר' טבלה בשלב 8).
4. **Deploy**.
5. בדיקה: `/api/health` → JSON עם `"db":{"mode":"postgres","ok":true}`.

## שלב 4 — Resend (מייל התראת ליד)

1. [resend.com](https://resend.com) → הרשמה (יש Free).
2. **Domains → Add Domain** → אמת (`govari.co.il` או דומה) עם רשומות ה-DNS שמוצגות.
   לבדיקה מהירה בלבד: `FROM_EMAIL=onboarding@resend.dev` (עובד בלי דומיין מאומת, אבל מגיע לספאם).
3. **API Keys → Create** → הדבק ל-`RESEND_API_KEY`.
4. `OWNER_EMAIL` = לאן מגיעה ההתראה (כרגע `davidazulay75@gmail.com`).
5. בלי מפתח — האתר עובד, הליד נשמר, וההתראה נשארת ב-outbox לניסיון חוזר אחרי הגדרת המפתח.

## שלב 5 — Meta Pixel + Conversions API

1. **Events Manager** → צור/בחר Pixel → העתק את **Pixel ID**.
2. הדבק ב-`site/js/config.js` → `metaPixelId: 'המספר'` → commit + push. (ריק = הפיקסל כבוי, האתר עובד רגיל.)
3. **CAPI (מומלץ):** Events Manager → Settings → **Conversions API → Generate access token** → הדבק ל-`META_CAPI_TOKEN`, והגדר `META_PIXEL_ID` (אותו מספר) ב-Vercel.
4. אירועים: `PageView` + `ViewContent` (בדפדפן), `Lead` (בדפדפן **וגם** CAPI, עם `event_id` זהה → דדופ אוטומטי). `Lead` נורה **רק אחרי אישור השרת**.
5. בדיקה: Events Manager → **Test Events** → הגדר `META_TEST_EVENT_CODE` ב-Vercel זמנית → שלח ליד בדיקה → אמור להופיע גם כ-Browser וגם כ-Server עם דדופ.

## שלב 6 — Outbox Cron (חובה — הנתיב האמין להתראות)

הליד נשמר מיידית; ההתראות (מייל/CAPI/Sheet) נשלחות ע"י פועל שרץ כל דקה על `/api/outbox/tick`.

- **Vercel (Pro):** `vercel.json` כבר מגדיר `crons: [{ path: "/api/outbox/tick", schedule: "* * * * *" }]`. אין מה לעשות.
- **Vercel (Hobby — cron רץ פעם ביום בלבד):** השתמש ב-[cron-job.org](https://cron-job.org) (חינם):
  1. הגדר `OUTBOX_TICK_SECRET` ב-Vercel (מחרוזת אקראית).
  2. ב-cron-job.org: URL = `https://<דומיין>/api/outbox/tick?key=<הסוד>`, כל דקה.
- ידני לבדיקה: `curl "https://<דומיין>/api/outbox/tick?key=<הסוד>"` → מחזיר `{processed, done, failed}`.

## שלב 7 — אדמין לידים

- **הכי פשוט:** דשבורד Supabase → **Table Editor → leads** (מסונן, ממויין, ייצוא CSV). לא צריך כלום.
- **ממשק מובנה:** הגדר `ADMIN_USER` + `ADMIN_PASSWORD` ב-Vercel → `https://<דומיין>/admin/leads`
  (טבלה, סינון לפי סטטוס, חיפוש, קליק-לחיוג/וואטסאפ, עדכון סטטוס, ייצוא `/admin/leads.csv`).
  בלי המשתנים — הנתיב מחזיר 404.

## שלב 8 — טבלת משתני סביבה (Vercel → Settings → Environment Variables)

| משתנה | ערך | חובה? |
|---|---|---|
| `DATABASE_URL` | Supabase pooler, פורט 6543 | **כן** — בלעדיו לידים לא נשמרים בפרודקשן |
| `PGSSL` | `true` | כן |
| `IP_HASH_SALT` | מחרוזת אקראית ארוכה | כן (פרטיות) |
| `SITE_URL` | `https://<דומיין>` | כן |
| `SERVE_SITE` | `false` | כן (ב-Vercel האתר סטטי) |
| `RESEND_API_KEY` | מ-Resend | מומלץ מאוד |
| `FROM_EMAIL` | דוא"ל בדומיין מאומת | עם Resend |
| `OWNER_EMAIL` | יעד ההתראות | כן |
| `META_PIXEL_ID` | מ-Events Manager | למדידה |
| `META_CAPI_TOKEN` | מ-CAPI | למדידת שרת |
| `META_TEST_EVENT_CODE` | לבדיקה בלבד — ריק בפרודקשן | לא |
| `ADMIN_USER` / `ADMIN_PASSWORD` | לאדמין המובנה | אופציונלי |
| `OUTBOX_TICK_SECRET` | אם משתמשים ב-cron-job.org | לפי שלב 6 |
| `SHEET_WEBHOOK_URL` | Apps Script Web App (גיבוי ל-Sheet) | אופציונלי |
| `PAYMENT_PROVIDER` | `none` | כן |

> **הפיקסל (`metaPixelId`) לא ב-Vercel — הוא ב-`site/js/config.js` בקוד** (כי הוא רץ בדפדפן).

## שלב 9 — ניטור ו-uptime

- **בריאות:** `GET /api/health` — מחזיר `db`, `outbox` (pending/failed/stuck), דגלי email/CAPI. 503 אם המסד נפל או יש אירועים תקועים > 15 דק'.
- **Uptime חיצוני:** [UptimeRobot](https://uptimerobot.com) / [Better Stack](https://betterstack.com) — נטר את `/` ואת `/api/health` (מילת מפתח `"ok":true`), התראה אחרי 2 כשלים רצופים.
- **שגיאות (מומלץ):** [Sentry](https://sentry.io) — פרויקט Node ל-`server/` (עוטפים את `app.js`) ופרויקט Browser ל-`site/` (`<script>` של Sentry ב-`<head>`). כרגע שגיאות נרשמות ל-`console` → נראות ב-Vercel → Logs.
- **Backup ל-Google Sheet (אופציונלי):** Apps Script → `doPost(e)` שכותב שורה מ-`JSON.parse(e.postData.contents)` → Deploy as Web App (Anyone) → הדבק את ה-URL ב-`SHEET_WEBHOOK_URL`. נכשל בשקט, לא חוסם ליד.

## שלב 10 — דומיין

1. Vercel → Project → **Settings → Domains → Add** → `govari.co.il` + `www.govari.co.il`.
2. אצל הרשם: **Apex** = `A` ל-`76.76.21.21` (או `ALIAS`→`cname.vercel-dns.com`); **www** = `CNAME`→`cname.vercel-dns.com`.
3. המתן ל-DNS. Vercel מנפיק HTTPS אוטומטית.
4. עדכן `SITE_URL` → Redeploy. עדכן את הדומיין ב-Meta/Resend.

---

## הרצה מקומית

```bash
cd server && npm install
cp .env.example .env      # DATABASE_URL ריק = אחסון JSON מקומי (server/data/*.json) — dev בלבד
npm start                 # http://localhost:3000
node --test test/phone.test.mjs   # בדיקות נירמול טלפון
```

## ערכים שצריך לספק (דוד)

- [ ] `DATABASE_URL` מ-Supabase
- [ ] `RESEND_API_KEY` + דומיין מאומת ב-Resend (`FROM_EMAIL`)
- [ ] `META_PIXEL_ID` (→ `site/js/config.js`) + `META_CAPI_TOKEN`
- [ ] `IP_HASH_SALT` (מחרוזת אקראית)
- [ ] `ADMIN_USER` / `ADMIN_PASSWORD` (אם רוצים אדמין מובנה)
- [ ] **אישור מספר הטלפון 053-6813013** — או המספר הנכון לקמפיין
- [ ] אישור טענות שיווק (AUDIT.md §4) והכרעת ניסוח התרומה (§3)
- [ ] השלמת ה-placeholders המשפטיים (AUDIT.md §5) + בדיקת עו"ד

## צ'קליסט לפני קמפיין

- [ ] `/api/health` → `db.ok=true`, `outbox.stuck=0`
- [ ] ליד בדיקה → מופיע ב-Supabase `leads` + מייל התראה הגיע
- [ ] Meta Test Events → `Lead` מופיע Browser+Server עם דדופ
- [ ] Cron של ה-outbox רץ (Vercel Pro או cron-job.org)
- [ ] גיבוי Supabase מופעל
- [ ] Uptime monitor על `/` ו-`/api/health`
- [ ] עו"ד עבר על terms/privacy; placeholders מולאו
- [ ] `META_TEST_EVENT_CODE` רוקן
