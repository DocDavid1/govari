// נקודת כניסה ל-Vercel (Serverless Function) — עוטפת את אפליקציית Express.
// מאתחל את מסד הנתונים פעם אחת לכל cold start, ואז מעביר את הבקשה ל-app.
import app from '../server/app.js';
import { initDb } from '../server/src/orders.js';

let ready = null;

export default async function handler(req, res) {
  if (!ready) ready = initDb().catch((e) => console.error('[db init]', e));
  await ready;
  return app(req, res);
}
