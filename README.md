# גוב ארי מערכות — מבנה הפרויקט

אתר פרימיום למכירת מצלמת רכב + שרת הזמנות מלא (מסד נתונים, מיילים, סליקה) + צוות סוכני עיצוב.

## מפת הפרויקט
```
מצלמה/
├── site/                      ← האתר (HTML/CSS/JS סטטי, RTL, מצב יום/לילה)
│   ├── index.html             עמוד הבית (הירו + וידאו + יתרונות + תרומה + CTA)
│   ├── features.html          המצלמה — 4 ערוצים · 360° · 4K · 4G
│   ├── app.html               האפליקציה — ניטור, מפות, לייב 24/7
│   ├── preorder.html          הזמנה מראש (מחיר, מה כלול, התקנה עד הבית)
│   ├── checkout.html          צ'קאאוט (כמות, קופון, חתימה על תקנון+פרטיות)
│   ├── order-success.html     עמוד תודה
│   ├── terms.html             תנאי שימוש
│   ├── privacy.html           מדיניות פרטיות
│   ├── accessibility.html     הצהרת נגישות
│   ├── css/styles.css         מערכת העיצוב (פלטה: שחור · אדום · כחול)
│   ├── js/main.js             אינטראקציות (תפריט, פופאפ, עוגיות, תרומה, מצב)
│   └── assets/                images/ · videos/ (מעובדים ודחוסים ל-web)
│
├── server/                    ← שרת ההזמנות (Node/Express)
│   ├── app.js                 אפליקציית Express (כל ה-API)
│   ├── server.js              הרצה מקומית (npm start)
│   ├── src/
│   │   ├── config.js          קריאת הגדרות מ-.env
│   │   ├── orders.js          שמירת הזמנות — PostgreSQL (או JSON מקומי)
│   │   ├── email.js           מיילים אוטומטיים (Resend)
│   │   ├── templates.js       תבניות מייל בעברית
│   │   ├── payment.js         אדפטר סליקה גנרי (נקודת חיבור אחת)
│   │   ├── coupons.js         קופונים (FREE = 100% לבדיקה)
│   │   └── validate.js        ולידציית קלט
│   └── .env.example           תבנית הגדרות
│
├── api/index.js               ← פונקציית Vercel (עוטפת את השרת)
├── vercel.json                ← ניתוב: /api → פונקציה, השאר → site/
├── package.json               ← תלויות לפריסה
├── deploy.sh                  ← פריסה אוטונומית בפקודה אחת
├── DEPLOY.md                  ← מדריך פריסה מפורט (Vercel + Supabase + דומיין)
│
├── content/                   ← תוכן וניהול
│   ├── content.md             מקור האמת לתוכן
│   ├── changelog.md           יומן שינויים
│   ├── asset-catalog.md       קטלוג החומרים
│   └── sales-playbook.md      דוח: איך לגרום לאתר למכור
│
├── .claude/agents/            ← 🤖 צוות סוכני העיצוב
│   ├── creative-director.md   ⭐ מנהל קריאייטיב ברמת Apple (מנצח על כולם)
│   ├── media-curator.md       ניתוח וקטלוג חומרים
│   ├── design-cloner.md       שחזור מבנה מרפרנס עם התוכן שלנו
│   ├── conversion-strategist.md  אמון ומבנה שכנוע לקנייה
│   ├── ui-ux-designer.md      ליטוש UX, נגישות, רספונסיביות
│   ├── video-embedder.md      הטמעת וידאו פרימיום
│   ├── design-critic.md       ביקורת עיצוב + מניעת "ריח AI"
│   └── continuous-improver.md מחזורי שיפור מתמשכים
│
└── CLAUDE.md                  ← הנחיות הפרויקט
```

## סטאק
- **פרונט:** HTML/CSS/JS נקי, RTL, מצב יום/לילה, נגיש (WCAG 2.0 AA).
- **בק:** Node.js + Express (רץ כ-Serverless ב-Vercel).
- **מסד:** PostgreSQL (Supabase).
- **מיילים:** Resend. **סליקה:** אדפטר גנרי (מוכן לחיבור).

## הרצה מקומית
```bash
cd server && npm install && npm start      # http://localhost:3000
```
(בלי DATABASE_URL — עובד עם קובץ JSON מקומי.)

## פריסה לאוויר — פקודה אחת
```bash
bash ~/Desktop/מצלמה/deploy.sh
```
הסקריפט מעתיק לתיקייה באנגלית, מנקה, ומעלה ל-Vercel **בלי שאלות** (`--yes`).
לאחר מכן: להגדיר משתני סביבה ב-Vercel (DATABASE_URL וכו') — פירוט ב-`DEPLOY.md`.
```

