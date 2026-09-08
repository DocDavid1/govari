// הרצה מקומית: מאתחל מסד ומריץ שרת שמגיש גם את האתר.
// (בפרודקשן ב-Vercel משתמשים ב-api/index.js במקום קובץ זה.)
import app from './app.js';
import { config, emailEnabled, paymentEnabled } from './src/config.js';
import { initDb } from './src/orders.js';

initDb()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`\n גוב ארי — שרת הזמנות פועל`);
      console.log(` http://localhost:${config.port}`);
      console.log(` מייל: ${emailEnabled() ? 'פעיל (Resend)' : 'כבוי — הוסף RESEND_API_KEY'}`);
      console.log(` סליקה: ${paymentEnabled() ? config.payment.provider : 'ללא (מצב לידים)'}\n`);
    });
  })
  .catch((err) => {
    console.error('[db] כשל באתחול מסד הנתונים:', err);
    process.exit(1);
  });
