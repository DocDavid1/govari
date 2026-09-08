# גוב ארי v2.0 — מסירה (משפך ליד)

מסמכים נלווים: `AUDIT.md` (אודיט מלא + טענות + placeholders), `DEPLOY.md` (הקמה שלב-אחר-שלב), `content/changelog.md` (כל השינויים).

---

## 1. ארכיטקטורה לפני — ר' `AUDIT.md §1`
בקצרה: אתר סטטי + `POST /api/orders` (Express serverless ב-Vercel) שכתב לקובץ JSON על **דיסק ארעי** ללא `DATABASE_URL` → **כל ליד אבד**. אין מייל, אין מסד, אין Pixel. טופס דרש אימייל+כתובת+תקנון.

## 2–3. שינויים + קבצים
**חדש:** `server/src/{db,phone,leads,notify,outbox,admin}.js` · `server/migrations/001_init_leads.sql` · `server/test/phone.test.mjs` · `site/js/{config,track,lead-form}.js` · `AUDIT.md` · `DEPLOY.md` (נכתב מחדש) · `HANDOFF.md`
**שונה:** `server/{app,server}.js` · `server/src/{config,validate}.js` · `api/index.js` · `vercel.json` · `server/.env.example` · `.gitignore` · `site/*.html` (9) · `site/css/styles.css` · `site/js/main.js` · `content/changelog.md`

עיקרי השינוי:
- `POST /api/leads` — כתיבה אטומית ל-Postgres (טרנזקציה) → תשובה. התראות דרך **outbox** עם retry/backoff — לא חוסמות ולא מוחקות ליד.
- נירמול טלפון ישראלי (כל פורמט → E.164), דדופ לפי טלפון, `idempotency_key` נגד לחיצה כפולה.
- מצבי כשל: מסד נופל → מייל חירום; גם זה נכשל → הודעת אמת + WhatsApp/טלפון עם הפרטים שהוקלדו. אף פעם לא "נשמר" כוזב.
- פרונט מובייל-קודם: הירו עם טופס ליד קצר, "3 צעדים", רצועת CTA דביקה, Pixel + לכידת ייחוס.
- `/api/health`, `/admin/leads` (+CSV), honeypot, rate-limit, כותרות אבטחה, IP מגובב.
- אימייל בצ'קאאוט → אופציונלי. CTA ראשי "רוצה לשמוע פרטים?".

## 4. סכימת מסד — `server/migrations/001_init_leads.sql`
`leads` (קנוני, מפתח ייחודי `phone_normalized`) · `lead_submissions` (כל הגשה) · `lead_events` (outbox: `event_type`, `status`, `attempts`, `next_attempt_at`, `last_error`). אינדקסים: `created_at`, `phone_normalized`, `status`, `utm_campaign`, `(status,next_attempt_at)`. טריגר `updated_at`. רץ אוטומטית ב-cold start; או ידנית ב-Supabase SQL Editor.

## 5. משתני סביבה — טבלה מלאה ב-`DEPLOY.md §8`
חובה: `DATABASE_URL`, `PGSSL=true`, `IP_HASH_SALT`, `SITE_URL`, `SERVE_SITE=false`, `OWNER_EMAIL`.
מומלץ: `RESEND_API_KEY`+`FROM_EMAIL`, `META_PIXEL_ID`+`META_CAPI_TOKEN`.
אופציונלי: `ADMIN_USER`/`ADMIN_PASSWORD`, `OUTBOX_TICK_SECRET`, `SHEET_WEBHOOK_URL`.
**הפיקסל למדידת דפדפן נכנס ל-`site/js/config.js` (`metaPixelId`), לא ל-Vercel.**

## 6. Vercel — `DEPLOY.md §3, §6`
Import הריפו · Framework=Other · הזן env vars · Deploy. `vercel.json` כולל ניתוב, Cron (`/api/outbox/tick` כל דקה — Pro), וכותרות אבטחה. Hobby: Cron רץ יומי בלבד → השתמש ב-cron-job.org עם `OUTBOX_TICK_SECRET`.

## 7. Supabase — `DEPLOY.md §1`
New Project → Connection Pooling (Transaction, 6543) → `DATABASE_URL`. גיבוי: Database→Backups (Free=יומי; Pro=PITR).

## 8. Meta Pixel/CAPI — `DEPLOY.md §5`
Pixel ID → `site/js/config.js`. CAPI token → `META_CAPI_TOKEN`+`META_PIXEL_ID` ב-Vercel. אירועים: PageView, ViewContent, **Lead** (דפדפן+שרת, `event_id` זהה = דדופ). Lead נורה רק אחרי אישור שרת. בדיקה: Test Events + `META_TEST_EVENT_CODE`.

## 9. Resend — `DEPLOY.md §4`
אמת דומיין → API Key → `RESEND_API_KEY`+`FROM_EMAIL`. `OWNER_EMAIL`=יעד התראה. בלי מפתח: הליד נשמר, ההתראה ממתינה ב-outbox.

## 10. ערכים שצריך ממך (דוד)
- [ ] `DATABASE_URL` (Supabase)
- [ ] `RESEND_API_KEY` + דומיין מאומת
- [ ] `META_PIXEL_ID` (→ config.js) + `META_CAPI_TOKEN`
- [ ] `IP_HASH_SALT` (מחרוזת אקראית ארוכה)
- [ ] `ADMIN_USER`/`ADMIN_PASSWORD` (אם רוצים אדמין מובנה)
- [ ] **אישור מספר הטלפון 053-6813013** (לא שונה — רק לאשר)
- [ ] הכרעה: ניסוח התרומה (`AUDIT.md §3`)
- [ ] אישור טענות שיווק (`AUDIT.md §4`)
- [ ] השלמת placeholders משפטיים + עו"ד (`AUDIT.md §5`)
- [ ] מחיר עוגן ("מחיר מלא") אם קיים

## 11. טענות מוצר לא פתורות — `AUDIT.md §4`
2K Ultra HD · 170° לעדשה · "בלי נקודות עיוורון" · גיבוי אוטומטי לענן · ראיית לילה · חיישן G/זיהוי תנועה · גידור גיאוגרפי/היסטוריית מסלול · פרטי התרומה (עמותה). **מאושרים** ב-`content.md`: 4 ערוצים, 360°, 4G, אפליקציה עברית, איתור גוגל מפות, הקלטה רציפה.

## 12. Placeholders משפטיים לא פתורים — `AUDIT.md §5`
terms: ח.פ., כתובת, זמן אספקה, תקופת אחריות, מחוז שיפוט. privacy: ממונה פרטיות, ניסוח "סליקה". accessibility: רכז נגישות, תאריך מבדק. + פסקה שמבהירה שהשארת פרטים ≠ עסקה/תשלום. **טעון עו"ד.**

## 13. תוצאות בדיקה (מקומי, מצב JSON — פרודקשן זהה עם Postgres)
| בדיקה | תוצאה |
|---|---|
| 9 עמודים + 4 קבצי JS + CSS | 200 |
| `node --check` על 20 קבצי JS | עבר |
| בדיקות נירמול טלפון (`node --test`) | 8/8 עברו |
| טלפון בכל פורמט (`0501112233`, `050-111-2233`, `+972…`, `972 50…`, `00972…`) | כולם `ok`, כולם ממופים לליד קנוני אחד |
| שם חסר / טלפון לא תקין | 400 עם שגיאה בעברית |
| honeypot מלא | 200, לא נשמר (`spam:true`) |
| `idempotency_key` פעמיים | הגשה שנייה `deduped:true`, אין אירועים כפולים |
| 10 הגשות מקבילות אותו טלפון | ליד 1, `submissions_count:10`, 10 הגשות, 10 אירועים (mutex) |
| הגשת טופס ללא JS (urlencoded, Accept:html) | 200 + עמוד תודה HTML |
| `/admin/leads` בלי auth / עם auth | 401 / 200 |
| `/admin/leads.csv` | CSV עם BOM, שורות תקינות |
| rate-limit (13 בקשות ב-10 דק') | 7×200 ואז 429 |
| `/api/health` | `ok:true`, מדווח db+outbox+דגלים |

## 14. תוצאות בדיקת מצבי כשל
| תרחיש | התנהגות שנצפתה |
|---|---|
| **A** — מסד מצליח, מייל נכשל (אין `RESEND_API_KEY`) | הליד נשמר, המבקר רואה הצלחה, אירוע `ADMIN_EMAIL` נשאר `pending` עם `attempts=1` — יישלח כשיוגדר מפתח. |
| **B** — מסד לא זמין, מייל חירום זמין | מנסה `sendEmergencyAdminEmail`; אם מצליח → `{ok:true, degraded:true}`. |
| **C** — מסד לא זמין **וגם** אין ערוץ חירום | `503 {ok:false, fallback:true}` — **לא** מצהיר "נשמר". הלקוח מציג WhatsApp+טלפון עם השם/מספר. השדות לא מתנקים. |
| כשל רשת בדפדפן | `js/lead-form.js`: עד 3 ניסיונות חוזרים; אם `navigator.onLine=false` → ממתין ל-`online` ושולח. |
| Pixel/אנליטיקס חסומים (ad-blocker) | `try/catch` סביב כל קריאת מדידה — הטופס נשלח כרגיל. |
| כשל התראה ב-outbox | `failEvent` → `attempts++`, backoff `[0,1,5,15,60,180]` דק', `failed` אחרי 6 — **הליד נשאר**. |

## 15. צ'קליסט לפני קמפיין — ר' גם `DEPLOY.md`
- [ ] `DATABASE_URL` מוגדר · `/api/health` → `db.ok=true`
- [ ] ליד בדיקה מופיע ב-Supabase `leads` + מייל התראה הגיע
- [ ] Cron ל-outbox פעיל (Vercel Pro או cron-job.org)
- [ ] `META_PIXEL_ID` ב-config.js · Test Events מראה Lead (Browser+Server, dedup)
- [ ] `IP_HASH_SALT` = מחרוזת אקראית (לא ברירת המחדל)
- [ ] גיבוי Supabase פעיל · Uptime monitor על `/` ו-`/api/health`
- [ ] עו"ד עבר על terms/privacy · placeholders מולאו
- [ ] טלפון 053-6813013 אושר · טענות `AUDIT.md §4` אושרו · תרומה `§3` הוכרעה
- [ ] `META_TEST_EVENT_CODE` רוקן

---

### הרצה מקומית
```bash
cd server && npm install
cp .env.example .env        # DATABASE_URL ריק = JSON מקומי (dev)
npm start                   # http://localhost:3000
node --test test/phone.test.mjs
```
