// שכבת גישה ל-PostgreSQL (Supabase). מודול זה משמעותי רק כאשר DATABASE_URL מוגדר.
// במצב פיתוח ללא DATABASE_URL — leads.js נופל אחורה לאחסון קובץ JSON.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { config, usePg } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

let pool = null;

export async function getPool() {
  if (!usePg()) return null;
  if (pool) return pool;
  const pg = (await import('pg')).default;
  pool = new pg.Pool({
    connectionString: config.databaseUrl,
    ssl: config.pgSsl ? { rejectUnauthorized: false } : false,
    max: 3,                      // serverless — בריכה קטנה
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
  });
  pool.on('error', (e) => console.error('[db] pool error:', e.message));
  return pool;
}

export async function query(text, params) {
  const p = await getPool();
  if (!p) throw new Error('DATABASE_URL not configured');
  return p.query(text, params);
}

/** טרנזקציה: fn מקבל client עם .query, מתבצע COMMIT/ROLLBACK אוטומטית. */
export async function tx(fn) {
  const p = await getPool();
  if (!p) throw new Error('DATABASE_URL not configured');
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}

let migrated = false;
export async function migrate() {
  if (!usePg() || migrated) return;
  const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, f), 'utf8');
    await query(sql);
  }
  migrated = true;
  console.log(`[db] PostgreSQL מחובר · ${files.length} מיגרציות הורצו`);
}

/** בדיקת חיים למסד — לשימוש ב-/api/health. */
export async function dbHealth() {
  if (!usePg()) return { mode: 'json-file', ok: true };
  try {
    const r = await query('select 1 as ok');
    return { mode: 'postgres', ok: r.rows[0].ok === 1 };
  } catch (e) {
    return { mode: 'postgres', ok: false, error: e.message };
  }
}

export function hashIp(ip) {
  return crypto
    .createHash('sha256')
    .update(String(ip || '') + '|' + config.ipHashSalt)
    .digest('hex')
    .slice(0, 32);
}
