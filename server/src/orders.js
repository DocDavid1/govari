import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', 'data', 'orders.json');

// אם הוגדר DATABASE_URL → משתמשים ב-PostgreSQL. אחרת → קובץ JSON מקומי (פיתוח).
const USE_PG = Boolean(config.databaseUrl);
let pool = null;
if (USE_PG) {
  const pg = (await import('pg')).default;
  pool = new pg.Pool({
    connectionString: config.databaseUrl,
    ssl: config.pgSsl ? { rejectUnauthorized: false } : false,
  });
}

// ---- אתחול: יצירת טבלה / תיקיית נתונים ----
export async function initDb() {
  if (!USE_PG) {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    console.log('[db] אחסון: קובץ JSON מקומי (ללא DATABASE_URL)');
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id          TEXT PRIMARY KEY,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      status      TEXT NOT NULL,
      amount      INTEGER NOT NULL,
      email       TEXT,
      data        JSONB NOT NULL
    );
  `);
  console.log('[db] אחסון: PostgreSQL מחובר');
}

// ---- עזרי קובץ JSON ----
async function readAll() {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}
async function writeAll(orders) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(orders, null, 2), 'utf8');
}

export function generateOrderId() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `GA-${stamp}-${rand}`;
}

function buildOrder({ quantity, customer, coupon }) {
  const unitPrice = config.product.price;
  const gross = unitPrice * quantity;
  const percent = coupon ? coupon.percent : 0;
  const discount = Math.round((gross * percent) / 100);
  const amount = Math.max(gross - discount, 0);
  return {
    id: generateOrderId(),
    createdAt: new Date().toISOString(),
    status: 'pending_payment',
    product: config.product.name,
    quantity,
    unitPrice,
    gross,
    coupon: coupon ? { code: coupon.code, percent } : null,
    discount,
    amount,
    currency: config.product.currency,
    customer,
    payment: { provider: config.payment.provider, ref: null, paidAt: null },
  };
}

export async function createOrder(input) {
  const order = buildOrder(input);
  if (USE_PG) {
    await pool.query(
      'INSERT INTO orders (id, created_at, status, amount, email, data) VALUES ($1,$2,$3,$4,$5,$6)',
      [order.id, order.createdAt, order.status, order.amount, order.customer.email, order]
    );
  } else {
    const orders = await readAll();
    orders.push(order);
    await writeAll(orders);
  }
  return order;
}

export async function getOrder(id) {
  if (USE_PG) {
    const r = await pool.query('SELECT data FROM orders WHERE id = $1', [id]);
    return r.rows[0] ? r.rows[0].data : null;
  }
  const orders = await readAll();
  return orders.find((o) => o.id === id) || null;
}

export async function markPaid(id, ref) {
  const order = await getOrder(id);
  if (!order) return null;
  order.status = 'paid';
  order.payment.ref = ref || null;
  order.payment.paidAt = new Date().toISOString();
  if (USE_PG) {
    await pool.query('UPDATE orders SET status = $1, data = $2 WHERE id = $3', ['paid', order, id]);
  } else {
    const orders = await readAll();
    const idx = orders.findIndex((o) => o.id === id);
    if (idx >= 0) { orders[idx] = order; await writeAll(orders); }
  }
  return order;
}

export async function listOrders() {
  if (USE_PG) {
    const r = await pool.query('SELECT data FROM orders ORDER BY created_at DESC');
    return r.rows.map((row) => row.data);
  }
  return readAll();
}
