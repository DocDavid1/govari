# העלאה לאוויר — Vercel + Supabase

**סקירה:** Supabase = מסד הנתונים (PostgreSQL). Vercel = האירוח (האתר הסטטי + פונקציית ה-API, מאותו דומיין). אין צורך בשרת always-on.

מבנה הפרויקט לפריסה:
```
site/            ← האתר הסטטי (מוגש ע"י Vercel)
api/index.js     ← פונקציית Serverless (עוטפת את השרת)
server/          ← קוד השרת (app.js, src/, ...)
vercel.json      ← ניתוב: /api/* → פונקציה, השאר → site/
package.json     ← תלויות לפונקציה (root)
```

---

## שלב 1 — מסד נתונים ב-Supabase
1. ב-Supabase → הפרויקט שלך (או New Project).
2. **Project Settings → Database → Connection string → בחר "Connection pooling"** (מצב Transaction, פורט **6543**). זה חשוב ל-serverless.
3. העתק את ה-URI (בערך: `postgresql://postgres.[ref]:[סיסמה]@...pooler.supabase.com:6543/postgres`). זה ה-`DATABASE_URL`.

הטבלה תיווצר אוטומטית בהרצה הראשונה. (ליצירה ידנית — SQL בתחתית המסמך.)

## שלב 2 — העלאה ל-GitHub
העלה את כל תיקיית הפרויקט לריפו (site/, server/, api/, vercel.json, package.json). קבצי `.env` ו-`node_modules` לא מועלים (מוגדר ב-.gitignore).

## שלב 3 — פריסה ב-Vercel
1. Vercel → **Add New → Project → Import** את הריפו.
2. Framework Preset: **Other**. Root Directory: השאר את השורש (ריק). אין צורך ב-Build Command — `vercel.json` מגדיר הכל.
3. **Environment Variables** — הוסף:
   | משתנה | ערך |
   |---|---|
   | `DATABASE_URL` | ה-URI מ-Supabase (pooler, 6543) |
   | `PGSSL` | `true` |
   | `OWNER_EMAIL` | `davidazulay75@gmail.com` |
   | `RESEND_API_KEY` | מ-Resend (שלב 4) |
   | `FROM_EMAIL` | `orders@yourdomain` (דומיין מאומת) |
   | `SITE_URL` | כתובת הפרויקט (למשל `https://govari.vercel.app`), ובהמשך הדומיין |
   | `SERVE_SITE` | `false` (ב-Vercel האתר מוגש סטטית) |
   | `PAYMENT_PROVIDER` | `none` (עד חיבור סליקה) |
4. **Deploy**. בסיום תקבל כתובת `https://...vercel.app`.
5. **בדיקה:** גלוש ל-`/health` → אמור להחזיר JSON. בצע הזמנת בדיקה עם קופון `FREE` — ההזמנה תישמר ב-Supabase ויישלחו מיילים.

## שלב 4 — מיילים (Resend)
`resend.com` → אמת דומיין → צור API Key → הגדר `RESEND_API_KEY` + `FROM_EMAIL` ב-Vercel → Redeploy.

## שלב 5 — סליקה
מלא את `server/src/payment.js` לפי הספק, והגדר `PAYMENT_PROVIDER` + המפתחות ב-Vercel. ב-webhook אצל הספק הזן:
`https://<הדומיין>/api/payment/webhook`

## שלב 6 — דומיין
1. רכוש דומיין (Namecheap / GoDaddy / רשם ישראלי).
2. Vercel → Project → **Settings → Domains → Add** → הזן `govari.co.il` וגם `www.govari.co.il`.
3. אצל רשם הדומיין הוסף את הרשומות ש-Vercel מציג:
   - **Apex** (`govari.co.il`): רשומת `A` ל-`76.76.21.21` (או `ALIAS/ANAME` ל-`cname.vercel-dns.com`).
   - **www**: `CNAME` ל-`cname.vercel-dns.com`.
4. המתן להתפשטות ה-DNS (עד כמה שעות). Vercel מנפיק HTTPS אוטומטית.
5. עדכן את `SITE_URL` ב-Vercel לדומיין הסופי → Redeploy.

---

## הרצה מקומית (לבדיקה לפני העלאה)
```bash
cd server
npm install
cp .env.example .env    # אפשר להשאיר DATABASE_URL ריק (יעבוד עם קובץ JSON)
npm start               # http://localhost:3000
```

## צ'קליסט לפני עלייה לאוויר
- [ ] הסר קופון `FREE` מ-`server/src/coupons.js`
- [ ] אמת שמייל אישור מגיע ללקוח + התראה אליך
- [ ] בצע הזמנת אמת אחרי חיבור סליקה
- [ ] עו"ד עבר על תנאי שימוש + מדיניות פרטיות; מולאו הפרטים המסומנים [להשלמה]
- [ ] `SITE_URL` מצביע לדומיין הסופי

## יצירת טבלה ידנית (אופציונלי — Supabase → SQL Editor)
```sql
create table if not exists orders (
  id text primary key,
  created_at timestamptz not null default now(),
  status text not null,
  amount integer not null,
  email text,
  data jsonb not null
);
```

> חלופה ל-Vercel: הקובץ `render.yaml` בשורש מאפשר פריסה בלחיצה גם ב-Render (כולל Postgres מנוהל), אם תעדיף אירוח always-on.
