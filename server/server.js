// הרצה מקומית: מאתחל מסד + סכימת לידים ומריץ שרת שמגיש גם את האתר.
// (בפרודקשן ב-Vercel משתמשים ב-api/index.js במקום קובץ זה.)
import app from './app.js';
import { config, emailEnabled, paymentEnabled, metaCapiEnabled, adminEnabled, usePg, warnInsecureConfig } from './src/config.js';
import { initDb } from './src/orders.js';
import { initLeads } from './src/leads.js';

warnInsecureConfig();
Promise.allSettled([initDb(), initLeads()])
  .then((results) => {
    results.forEach((r) => r.status === 'rejected' && console.error('[init]', r.reason));
    app.listen(config.port, () => {
      console.log(`\n גוב ארי — שרת פועל`);
      console.log(` http://localhost:${config.port}`);
      console.log(` מסד:     ${usePg() ? 'PostgreSQL' : 'קובץ JSON מקומי (פיתוח)'}`);
      console.log(` מייל:    ${emailEnabled() ? 'פעיל (Resend)' : 'כבוי — הוסף RESEND_API_KEY'}`);
      console.log(` Meta CAPI: ${metaCapiEnabled() ? 'פעיל' : 'כבוי'}`);
      console.log(` אדמין:   ${adminEnabled() ? '/admin/leads פעיל' : 'כבוי (הוסף ADMIN_USER/PASSWORD)'}`);
      console.log(` סליקה:   ${paymentEnabled() ? config.payment.provider : 'ללא (מצב לידים)'}\n`);
    });
  })
  .catch((err) => {
    console.error('[init] כשל קריטי:', err);
    process.exit(1);
  });
