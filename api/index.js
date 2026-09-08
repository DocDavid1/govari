// נקודת כניסה ל-Vercel (Serverless Function) — עוטפת את אפליקציית Express.
// מאתחל מסד + סכימת לידים פעם אחת לכל cold start, ואז מעביר את הבקשה ל-app.
import app from '../server/app.js';
import { initDb } from '../server/src/orders.js';
import { initLeads } from '../server/src/leads.js';

let ready = null;

export default async function handler(req, res) {
  if (!ready) {
    ready = Promise.allSettled([initDb(), initLeads()]).then((results) => {
      results.forEach((r) => r.status === 'rejected' && console.error('[init]', r.reason));
    });
  }
  await ready;
  return app(req, res);
}
