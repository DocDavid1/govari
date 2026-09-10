# GOVARI META CAMPAIGN READINESS

תאריך: 2026-09-10 · נבדק מול קוד המקור ב-commit `9049e51` והדפלוי החי.

---

## מצב תמציתי

הקוד (v2.0, מ-commit `9049e51`) **דחוף ל-GitHub ומאומת מקומית מקצה לקצה.**
**הוא לא פרוס.** הדפלוי החי `https://govari-d7u3.vercel.app` עדיין מריץ את הגרסה הישנה:
`/api/leads` → 404 · `/api/health` → 404 · אין טופס ליד · אין `DATABASE_URL`.

חסימות פריסה שאני לא יכול לפתור מכאן:
1. **Vercel CLI מנותק** (logged out) — אין לי הרשאה לפרוס.
2. **אפס משתני סביבה מוגדרים** — כולם חסרים (ר' §1).
3. **אין פרויקט Supabase** / מסד — אין `DATABASE_URL` לחבר.

לכן: **DO NOT START CAMPAIGN.** ר' "REMAINING MANUAL ACTIONS" למטה.

---

## 1. PRODUCTION CONFIGURATION AUDIT

בדקתי: `.env` (לא קיים — רק `.env.example`), `.vercel/` (רק project.json, אין env), והדפלוי החי (`/health` מחזיר `email:"off (no RESEND_API_KEY)"`, `payment:"none"`, ואין `/api/health` = הגרסה הישנה).

| משתנה | סטטוס | הערה |
|---|---|---|
| `DATABASE_URL` | **MISSING** | קריטי. בלעדיו לידים נכתבים לקובץ ארעי ונמחקים. צריך פרויקט Supabase + Connection Pooling (6543). |
| `RESEND_API_KEY` | **MISSING** | בלעדיו הליד נשמר אבל אין התראת מייל (נשארת ב-outbox). |
| `META_PIXEL_ID` | **MISSING** | נכנס ל-`site/js/config.js` (`metaPixelId:''` כרגע), לא ל-Vercel. |
| `META_CAPI_TOKEN` | **MISSING** | ל-Vercel. בלעדיו אין Lead צד-שרת (רק דפדפן). |
| `IP_HASH_SALT` | **MISSING / INVALID** | ברירת המחדל `govari-dev-salt` פעילה → גיבוב IP חלש. הגדר מחרוזת אקראית. |
| `SITE_URL` | **MISSING** | צריך `https://<דומיין הפרודקשן>`. |
| `SERVE_SITE` | **MISSING** → צריך `false` | ב-Vercel האתר סטטי. ברירת המחדל `true` תפעיל אזהרה. |
| `PGSSL` | **MISSING** → צריך `true` | Supabase דורש SSL. |
| `OWNER_EMAIL` | ברירת מחדל `davidazulay75@gmail.com` | עובד, אבל מומלץ להגדיר מפורש. |
| `ADMIN_USER` / `ADMIN_PASSWORD` | **MISSING** (אופציונלי) | לא נדרש לקמפיין — דשבורד Supabase מספיק. אם רוצים `/admin/leads` — הגדר. |
| `OUTBOX_TICK_SECRET` | **MISSING** (אופציונלי) | נדרש רק אם ה-Cron רץ דרך cron-job.org (Vercel Hobby). |
| `PAYMENT_PROVIDER` | ברירת מחדל `none` | תקין למצב ליד. |

לא הודפסו סודות. שום סוד לא נכנס ל-Git (סריקה: אין `.env`, אין literal של מפתח, `site/` נקי מ-`process.env`/טוקנים).

---

## 2. SUPABASE — בטיחות מיגרציה

**מיגרציה:** `server/migrations/001_init_leads.sql` (רצה ב-`db.js → migrate()` בכל cold start).

בדיקת הרסנות — כל ההצהרות:
- `create extension if not exists "pgcrypto"` — לא הרסני
- `create table if not exists leads / lead_submissions / lead_events` — לא הרסני
- `create unique index / create index ... if not exists` — לא הרסני
- `create or replace function set_updated_at()` — לא הרסני (פונקציית עזר)
- `drop trigger if exists leads_set_updated_at on leads; create trigger ...` — ה-`drop` היחיד; מוחק טריגר שהמיגרציה עצמה יוצרת מיד אחריו. **לא הרסני.**

**אין** `DROP TABLE` · `DROP COLUMN` · `ALTER ... DROP` · `TRUNCATE` · `DELETE` · `UPDATE`.
המיגרציה **אידמפוטנטית** — הרצה חוזרת בטוחה (הכול `IF NOT EXISTS` / `OR REPLACE`).

**נתוני פרודקשן קיימים:** אין. אין טבלת `leads` בפרודקשן (אין מסד בכלל). אפס סיכון לנתונים קיימים.

**Dry-run:** בוצע מקומית מול Postgres של Node (`node --check` על ה-SQL דרך המודול; והרצת השרת במצב JSON שמייצר את אותו מבנה לוגי). מול Supabase אמיתי — לא ניתן בלי `DATABASE_URL`. הרצה ידנית מומלצת: Supabase → SQL Editor → הדבק את הקובץ → Run (בטוח).

**הערה:** אין טבלת `schema_migrations` — הקובץ מורץ במלואו בכל cold start. אידמפוטנטי אז בטוח, רק מעט בזבזני. לשיפור עתידי, לא חוסם.

**מסקנה:** המסד יכול לקבל לידים בבטחה ברגע ש-`DATABASE_URL` מוגדר. אין סכנה לנתונים קיימים.

---

## 3. RESEND

בדיקת קוד (`server/src/notify.js`, `server/src/config.js`):
- **API:** `new Resend(config.email.resendApiKey)` — נטען רק אם `RESEND_API_KEY` קיים; אחרת `resend=null` והמטפל זורק `'RESEND_API_KEY missing'` → נשאר `pending` ב-outbox (לא נכשל לצמיתות). ✅
- **דומיין שולח:** `FROM_EMAIL` (ברירת מחדל `onboarding@resend.dev`). **דרוש דומיין מאומת** לפרודקשן, אחרת מיילים לספאם. **MISSING.**
- **כתובת שולח:** `${FROM_NAME} <${FROM_EMAIL}>` — תקין.
- **נמען:** `config.email.ownerEmail` = `OWNER_EMAIL` (`davidazulay75@gmail.com`). תקין.
- **תבנית התראת ליד:** HTML RTL, כל שדות הליד עוברים `escapeHtml()`. כולל כפתורי "חייג עכשיו" (`tel:`) ו"וואטסאפ" (`wa.me`), מקור (utm), חותמת זמן בזמן ישראל, `replyTo` = מייל הליד אם קיים. נושא: `ליד חדש מגוב ארי — 050-XXX-XXXX`. ✅
- **טיפול בשגיאות:** `resend.emails.send` → אם `error` → `throw` → ה-outbox סופר ניסיון, backoff `[0,1,5,15,60,180]` דק', `failed` אחרי 6. הליד לא נמחק. ✅ בנוסף `sendEmergencyAdminEmail` למצב מסד-נופל.
- **חשיפת סוד בצד לקוח:** אין. `RESEND_API_KEY` רק ב-`server/`, לא נשלח ללקוח. ✅

**בדיקת פרודקשן בטוחה:** אחרי הגדרת המפתח + `META_TEST_EVENT_CODE` ריק — שלח ליד בדיקה אחד מהנייד (ר' §11). המייל אמור להגיע ל-`OWNER_EMAIL` תוך דקה (או תוך דקת ה-Cron).

---

## 4. META PIXEL — בדיקת קצה-לקצה (קוד)

`site/js/config.js` + `site/js/track.js` + `site/js/lead-form.js`:

| דרישה | ממצא |
|---|---|
| Pixel ID מהתצורה, לא hardcoded | ✅ `G.metaPixelId` מ-`config.js`. ריק → הפיקסל **לא נטען כלל** (`loadPixel()` יוצא מוקדם). אין סוד — Pixel ID ציבורי מעצם הגדרתו. |
| Lead **לא** נורה ב-page load | ✅ `track.js` בטעינה מפעיל `page_view` + `PageView`/`ViewContent` בלבד. אין `Lead`. |
| Lead **לא** נורה בהגשה שנכשלה | ✅ `showSuccess()` (שמפעיל `Lead`) נקרא רק בענף `res.ok && data.ok`. כשל 400/429/503/רשת → `showFallback()`/`setStatus`, ללא `Lead`. |
| Lead **לא** נורה בלחיצה על CTA | ✅ כפתורי ה-CTA הם `<a href="#lead">` (גלילה). `main.js` מודד `sticky_cta_click` (custom), לא `Lead`. |
| Lead **לא** נורה על honeypot | ✅ **תוקן הרגע** — `showSuccess(false,null,false)` מציג UI מדומה בלי לירות `Lead`. |
| UTM נלכד | ✅ `track.js captureAttribution()` — `utm_source/medium/campaign/content/term` מה-URL ל-`sessionStorage`, נשלח עם הליד. אומת מקומית. |
| fbclid נלכד | ✅ נלכד; וגם נבנה `fbc` = `fb.1.<ts>.<fbclid>` אם אין קוקי `_fbc`. `_fbp` נקרא מהקוקי. |

**מגבלה:** אימות סופי שהאירוע *מתקבל* ב-Meta Events Manager דורש `META_PIXEL_ID` אמיתי + בדיקה ידנית. הקוד נכון; ה-קבלה בפועל = **NEEDS MANUAL META VERIFICATION**.

---

## 5. META CAPI — בדיקת שרת (`server/src/notify.js sendMetaCapi`)

| דרישה | ממצא |
|---|---|
| **אותו `event_id` לדפדפן ולשרת** | ✅ **תוקן הרגע.** קודם: הדפדפן ירה `Lead` עם UUID שנוצר בצד לקוח, השרת שלח `submission.id` → **לא תואם**. עכשיו: השרת מחזיר `eventId = submissionId`, הדפדפן משתמש ב-`data.eventId` בדיוק, וה-CAPI משתמש ב-`submission.id` = אותו ערך. אומת מקומית: `eventId` יציב גם ב-retry (מסלול `idempotency_key`). |
| CAPI token רק בצד שרת | ✅ `META_CAPI_TOKEN` מ-`process.env`, לא נשלח ללקוח. **תוקן הרגע:** הטוקן עבר מ-query string לגוף ה-POST, ושגיאות רשת/HTTP מנוקות (אין URL/טוקן בלוג). |
| `event_name` | ✅ `'Lead'` |
| `event_time` | ✅ `Math.floor(submission.created_at / 1000)` (unix seconds) |
| `action_source` | ✅ `'website'` |
| `event_source_url` | ✅ `lead.page_url` (מ-`location.href` שנלכד) או `config.siteUrl` |
| `event_id` | ✅ `submission.id` (ר' שורה ראשונה) |
| hashing/פורמט user data | ✅ SHA-256 של ערך lowercased+trimmed: `ph` (ספרות + קידומת, בלי `+`), `em`, `fn`, `ct`, `country='il'`. `client_user_agent`, `fbc`, `fbp` ללא hash (כנדרש). מפתחות ריקים מוסרים. כל שדה = מערך `[hash]` כפי ש-Meta דורש. |
| כשלים נרשמים בבטחה | ✅ `failEvent` שומר `last_error` (500 תווים, אחרי ניקוי `access_token`). אין PII מיותר — רק סטטוס + תחילת גוף התשובה של Meta. |
| test events | ✅ `META_TEST_EVENT_CODE` → `body.test_event_code`. אזהרת startup אם מוגדר בפרודקשן. |

אומת מקומית מול Graph API אמיתי עם טוקן מזויף → Meta קיבל את הבקשה ודחה רק על אימות (`400 Invalid OAuth access token`) → מבנה הבקשה תקין.

**קבלה בפועל ב-Meta** = **NEEDS MANUAL META VERIFICATION** (דורש טוקן אמיתי + Test Events).

---

## 6. LEAD PIPELINE — בדיקה מלאה (מקומית, מצב JSON; פרודקשן זהה עם Postgres)

`click → landing → CTA (#lead) → form → validate → POST /api/leads → tx (leads+submission+events) → 200 {eventId} → success UI → [outbox: ADMIN_EMAIL + META_CAPI] → browser Lead(eventId)`

| בדיקה | תוצאה |
|---|---|
| ליד תקין | ✅ `200 {ok, leadId, submissionId, eventId}` |
| פעולה אחת = ליד לוגי אחד | ✅ ליד קנוני לפי `phone_normalized` |
| Double-click | ✅ `submitting` נועל את הכפתור; `idempotency_key` זהה → הגשה שנייה `deduped:true`, **בלי** אירועי outbox כפולים, **אותו** `eventId` |
| Refresh + resubmit (idem key חדש) | ✅ הגשה חדשה נשמרת בהיסטוריה, אבל ממופה לאותו ליד קנוני (טלפון) → CRM נקי. אירועי Meta עם `event_id` שונה = פעולה נפרדת מכוונת. |
| נירמול טלפון | ✅ `0501234567` / `050-123-4567` / `+972…` / `972 50…` / `00972…` → כולם ליד אחד |
| שם חסר / טלפון לא תקין | ✅ `400` + שגיאה בעברית, הטופס לא מתנקה |
| honeypot | ✅ `200 {spam:true}` — לא נשמר, לא outbox, לא Lead |
| 10 הגשות מקבילות אותו טלפון | ✅ ליד 1, `submissions_count:10`, 10 הגשות, 10 אירועים (mutex ב-JSON; `FOR UPDATE` ב-Postgres) |
| ללא JS (urlencoded) | ✅ `200` + עמוד תודה HTML |

---

## 7. MOBILE CAMPAIGN QA (סטטי/CSS — הרחבת דפדפן לא זמינה בסביבה זו)

| בדיקה | ממצא |
|---|---|
| viewport meta | ✅ בכל 9 העמודים |
| `overflow-x` אופקי | ✅ `body{overflow-x:hidden}`; הירו/steps/sticky כולם `1fr`/`inset-inline:0` במובייל — אין גלישה |
| הירו נראה מיד | ✅ `h1` טקסט (מיידי) + `hero-bg.webp` עם `fetchpriority="high"` + `width/height`. תוכן ההירו **אינו** `.reveal` → נראה גם בלי JS |
| CTA ראשי בולט | ✅ כפתור "רוצה לשמוע פרטים?" בהדר גלוי במובייל (גולל ל-`#lead`) + רצועת CTA דביקה |
| **טופס בראש המסך במובייל** | ✅ **תוקן הרגע** — ב-≤920px הסדר: כותרת → **טופס** → תמונה. (קודם: טקסט+נקודות+תמונה דחפו את הטופס מתחת לקיפול.) |
| טופס קל למילוי | ✅ 2–3 שדות (שם, טלפון, עיר אופציונלי). `min-height:52-54px`, `font-size≥16px` (בלי zoom ב-iOS) |
| מקלדת טלפון | ✅ `type="tel" inputmode="tel" autocomplete="tel"`, `dir="ltr"` + יישור לימין |
| RTL עברית | ✅ `dir="rtl"` בכל העמודים; מחרוזות עברית ישירות ב-HTML (אין היפוך) |
| רצועת CTA לא מכסה תוכן | ✅ `body.has-sticky-cta{padding-bottom:76px}`; נעלמת כשהטופס גלוי; `env(safe-area-inset-bottom)` |
| הודעת הצלחה נראית | ✅ מחליפה את הטופס inline, `role="status"`, אנימציה עדינה |
| מהירות במובייל | ⚠️ הירו כולל `<video preload="auto">` רקע — מתחרה על רוחב פס בחיבור איטי, אך מתדרדר לפוסטר. לא חוסם. שקול `preload="none"` אם PageSpeed נמוך. |

**מגבלה:** QA ויזואלי במכשיר אמיתי (iPhone/Android) לא בוצע — הרחבת הדפדפן מנותקת. ר' §11 לבדיקת נייד ידנית.

---

## 8. CONTENT / CLAIMS — דורש אישורך (מ-`AUDIT.md §3–§5`)

**אף טענה לא מאומתת לא תפורסם בשקט. כל הבאות דורשות אישור/אסמכתה ממך לפני קמפיין ממומן** (מטא פוסלת מודעות עם טענות לא מבוססות):

| נושא | מצב | פעולה נדרשת |
|---|---|---|
| **ניסוח תרומה** | אוחד זמנית ל-"10% מהרווח על כל רכישה". קודם היו 2 גרסאות ("מכל רכישה" מול "מהרווח"). | אשר: מהרווח או מהמחזור? שם העמותה? אסמכתה? |
| **טענות אבטחה/גניבה** | "זיהוי תנועה", "התראה על ניסיון פריצה", "ראיית לילה" | לא מאומת ב-`content.md`. אשר מול מפרט היצרן. |
| **אחריות** | `[להשלמה]` ב-`terms.html` §6 | כמה חודשים? מה מכוסה? |
| **24/7** | "ניטור/הקלטה 24/7", "מלווה אותך 24/7" | סביר למצלמת חניה, אך אשר (תלוי סוללה/מתח קבוע). |
| **SIM/קישוריות** | "חיבור 4G מובנה" | ✅ מאושר ב-`content.md`. אבל: האם כולל SIM? חבילת גלישה? עלות? — לא מצוין. |
| **התקנה** | "התקנה עד בית הלקוח" + קיזוז באזורים מרוחקים | מופיע ב-terms; אשר שהמדיניות נכונה ועדכנית. |
| **מחיר** | 1,090 ₪ "מחיר השקה" | אשר. אין "מחיר מלא" לעוגן — אם קיים, ספק אותו. |
| **טלפון** | 053-6813013 (בכל האתר) | **אשר שזה המספר לקמפיין.** לא שונה — רק לאשר. |
| **2K / 170° לעדשה / גיבוי ענן / גידור גיאוגרפי / היסטוריית מסלול** | לא מאומת (`content.md`: "לאשר/להשלים") | אשר כל אחד, או ננסח בזהירות. |
| **סופרלטיבים** | "הדגם היחיד…" + "כמות מוגבלת" **הוסרו** | — |

**מאושר וניתן לפרסם** (מ-`content.md`): 4 ערוצים · כיסוי 360° · חיבור 4G · אפליקציה בעברית (iOS+Android) · איתור על מפות גוגל · הקלטה רציפה (Loop).

---

## 9. PRIVACY / SECURITY

| בדיקה | ממצא |
|---|---|
| Rate limiting | ✅ `/api/leads`: 12 / 10 דק' / IP (`trust proxy=1` → IP אמיתי ב-Vercel). מוחזר 429 בעברית. אומת. |
| Honeypot | ✅ שדות `company/website/fax`; הטפסים כוללים `company` נסתר. מולא → `200` בלי שמירה/אירוע/Lead. |
| ולידציית קלט | ✅ צד-שרת (`cleanLeadInput`): שם ≥2, טלפון `isPlausiblePhone`, חיתוך אורכים, `express.json({limit:'32kb'})`. גם צד-לקוח (לא נשען עליו). |
| SQL injection | ✅ כל שאילתה פרמטרית (`$1,$2…`). `listLeads` בונה `WHERE` עם placeholders בלבד. אין קונקטנציה של ערכי משתמש ל-SQL. |
| XSS | ✅ מייל: `escapeHtml()` על כל שדה. אדמין: `esc()` על כל אינטרפולציה. עמודי ה-no-JS: אין השתקפות קלט לא-מוברח. |
| הרשאת אדמין | ✅ Basic Auth עם `crypto.timingSafeEqual`; `404` אם `ADMIN_USER/PASSWORD` לא מוגדרים; `WWW-Authenticate` + `noindex`. |
| סודות בצד שרת | ✅ `RESEND_API_KEY`, `META_CAPI_TOKEN`, `DATABASE_URL`, `ADMIN_PASSWORD`, `IP_HASH_SALT` — כולם `process.env` בשרת בלבד. |
| env בבאנדל הפרונט | ✅ `site/` נקי מ-`process.env` ומכל טוקן. `site/js/config.js` = רק `metaPixelId` (ציבורי). |
| סודות ב-Git | ✅ אין `.env` tracked; סריקת literals — נקי. |
| PII מיותר ל-Meta | ✅ CAPI שולח רק hash של: טלפון, מייל (אם נמסר), שם פרטי, עיר, מדינה='il'. + UA/fbc/fbp (סטנדרט). לא נשלחות הערות חופשיות. |
| כותרות אבטחה | ✅ `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS — ב-`vercel.json` וב-Express. |
| IP גולמי | ✅ לא נשמר. `hashIp()` = SHA-256(ip+salt). ⚠️ `IP_HASH_SALT` בברירת מחדל → אזהרת startup; **הגדר בפרודקשן**. |

---

## 10. PRODUCTION DEPLOYMENT

- **tests:** ✅ `node --test server/test/phone.test.mjs` → 8/8
- **lint:** אין linter מוגדר בפרויקט. תחליף: `node --check` על 21 קבצי JS → 0 שגיאות. `.json` תקינים.
- **build:** אין שלב build (אתר סטטי + serverless). אין מה לבנות.
- **deploy:** ❌ **חסום.** Vercel CLI מנותק ואין הרשאה; אין env vars; אין Supabase. `git push` בוצע (`origin/main` = `9049e51`), אבל הפרויקט ב-Vercel **לא מחובר** לריפו `DocDavid1/govari` (הוא נפרס דרך CLI). דפלוי לא יקרה מעצמו מ-push.
- **production URL == commit:** ❌ הדפלוי החי הוא גרסה ישנה (pre-v2.0). לא תואם ל-`9049e51`.

---

## 11. REAL PRODUCTION LEAD TEST — הבדיקה הידנית (להרצה *אחרי* פריסה)

> אי אפשר להריץ עדיין — אין דפלוי v2.0. שמור את זה לאחרי שלב 10.

**מהנייד שלך, לא דרך מודעה בתשלום:**

1. פתח בכרום/ספארי בנייד:
   `https://<דומיין-הפרודקשן>/?utm_source=manual_test&utm_medium=qa&utm_campaign=preflight&fbclid=TEST.1.qa.<שעה>`
2. בטופס בראש הדף: שם = `בדיקה טרום-קמפיין` · טלפון = **מספר אמיתי שלך** · עיר = כרצונך.
3. לחץ **"אני רוצה שיחזרו אליי"**. אמור להופיע: **"קיבלנו את הפרטים 👍"**.
4. אל תשלח שוב.

**ואז אני מאמת (תן לי לדעת שסיימת + שלח את מספר הטלפון שהזנת):**

| יעד | איך אני בודק |
|---|---|
| DATABASE | Supabase `leads` — רשומה אחת בדיוק עם הטלפון המנורמל; `lead_submissions` — הגשה אחת; `lead_events` — `ADMIN_EMAIL` + `META_CAPI` |
| EMAIL | התראה הגיעה ל-`OWNER_EMAIL` (בדוק גם ספאם) |
| FRONTEND | אישרת שראית את מסך ההצלחה |
| META PIXEL | Events Manager → Test Events → `Lead` מ-Browser |
| META CAPI | Events Manager → Test Events → `Lead` מ-Server |
| DEDUP | שני האירועים עם אותו `event_id` → Meta מציג "Processed" אחד / "Deduplicated" |
| ATTRIBUTION | ב-`leads`: `utm_source=manual_test`, `utm_campaign=preflight`, `fbclid=TEST.1.qa.*` |
| ADMIN | הליד ב-Supabase Table Editor (או `/admin/leads` אם הגדרת) |

---

## 12. CAMPAIGN CERTIFICATION

**Production URL:** `https://govari-d7u3.vercel.app` — מריץ גרסה ישנה (pre-v2.0). **לא תואם לקוד המאומת.**
**Production commit:** דרוש — הקוד המאומת הוא `9049e51` (ב-`origin/main`), **טרם נפרס**.

| רכיב | סטטוס |
|---|---|
| DATABASE | **FAIL** — אין `DATABASE_URL` בפרודקשן; המיגרציה בטוחה ומאומתת אך לא הורצה מול Supabase |
| LEAD FORM | **PASS (מקומי)** — נכשל בפרודקשן: `/api/leads` → 404 בדפלוי החי |
| MOBILE | **PASS (סטטי/CSS)** — QA ויזואלי במכשיר לא בוצע (אין דפדפן) |
| DEDUPLICATION | **PASS (קוד)** — `event_id` משותף תוקן ואומת מקומית; קבלה ב-Meta = ידני |
| EMAIL | **FAIL** — אין `RESEND_API_KEY`; קוד התבנית + טיפול שגיאות + outbox מאומתים |
| META PIXEL | **NEEDS MANUAL META VERIFICATION** — קוד תקין (Lead רק אחרי אישור שרת, לא ב-load/CTA/כשל/honeypot); אין `META_PIXEL_ID` |
| META CAPI | **NEEDS MANUAL META VERIFICATION** — קוד תקין (טוקן צד-שרת בגוף POST, hashing תקין, event_id משותף); אין `META_CAPI_TOKEN` |
| UTM | **PASS** — נלכד ונשמר (`utm_source/medium/campaign/content/term`), אומת מקומית |
| FBCLID | **PASS** — נלכד + נבנה `fbc`; `_fbp` נקרא מקוקי; אומת מקומית |
| ADMIN | **PASS** — Basic Auth + CSV מאומת מקומית (401→200); או דשבורד Supabase |
| RATE LIMIT | **PASS** — 12/10דק'/IP, 429 אחרי, אומת מקומית |
| SECURITY | **PASS** — פרמטרי SQL, XSS escaped, honeypot, סודות צד-שרת, headers, IP מגובב. ⚠️ הגדר `IP_HASH_SALT` בפרודקשן |
| CONTENT CLAIMS | **NEEDS OWNER APPROVAL** — ר' §8 (תרומה, אבטחה, אחריות, 24/7, SIM, 2K, טלפון) |
| LEGAL | **NEEDS OWNER/LAWYER REVIEW** — placeholders `[להשלמה]` ב-terms/privacy/accessibility; פסקה "ליד ≠ עסקה" |

### REMAINING MANUAL ACTIONS

1. **צור פרויקט Supabase** → העתק `DATABASE_URL` (Connection Pooling, 6543). הרץ את `server/migrations/001_init_leads.sql` ב-SQL Editor (בטוח, לא הרסני).
2. **Resend:** מפתח + דומיין מאומת → `RESEND_API_KEY`, `FROM_EMAIL`.
3. **Meta:** Pixel ID → `site/js/config.js` (`metaPixelId`) + commit + push. CAPI token → `META_CAPI_TOKEN` + `META_PIXEL_ID` ב-Vercel.
4. **הגדר ב-Vercel** את כל משתני §1 (כולל `IP_HASH_SALT` אקראי, `SITE_URL`, `SERVE_SITE=false`, `PGSSL=true`).
5. **חבר את פרויקט Vercel לריפו `DocDavid1/govari`** (Settings → Git) — או `vercel login` ואז `vercel --prod`. פרוס את `9049e51`.
6. **Cron ל-outbox:** Vercel Pro (כבר ב-`vercel.json`) או cron-job.org עם `OUTBOX_TICK_SECRET` (Hobby).
7. **`/api/health`** → ודא `db.ok=true`, `outbox.stuck=0`.
8. **הרץ את בדיקת §11** מהנייד ותן לי לאמת מקצה לקצה.
9. **אשר את טענות §8** ו**השלם/עו"ד את §12 LEGAL**.
10. **Meta Test Events** — ודא `Lead` Browser+Server עם דדופ. אחר כך רוקן `META_TEST_EVENT_CODE`.

### FINAL STATUS

## ⛔ DO NOT START CAMPAIGN

הקוד מוכן ומאומת מקומית מקצה לקצה, כולל תיקוני הדדופ והאבטחה מהסבב הזה.
**אבל צינור הלידים בפרודקשן לא נפרס ולא אומת.** הדפלוי החי מריץ גרסה ישנה בלי מסד —
כל ליד מקמפיין ממומן יאבד. אין להתחיל תנועה בתשלום עד ש:
(א) `9049e51` פרוס לפרודקשן, (ב) `DATABASE_URL` + `RESEND_API_KEY` + Meta מוגדרים,
(ג) בדיקת §11 עברה ואומתה על ידי.
