// ממשק אדמין מינימלי לניהול לידים — /admin/leads. מוגן ב-HTTP Basic Auth.
// כבוי אם ADMIN_USER / ADMIN_PASSWORD לא הוגדרו (אפשר להשתמש בדשבורד Supabase).
import crypto from 'node:crypto';
import { config, adminEnabled } from './config.js';
import { listLeads, updateLead, countLeads, leadsCsv, STATUSES } from './leads.js';
import { formatILDisplay, toWaNumber } from './phone.js';

function timingSafeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function basicAuth(req, res, next) {
  if (!adminEnabled()) {
    return res.status(404).send('admin disabled');
  }
  const h = req.headers.authorization || '';
  const [scheme, encoded] = h.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [user, pass] = Buffer.from(encoded, 'base64').toString('utf8').split(':');
    if (timingSafeEqual(user, config.admin.user) && timingSafeEqual(pass, config.admin.password)) {
      return next();
    }
  }
  res.set('WWW-Authenticate', 'Basic realm="Govari Admin", charset="UTF-8"');
  return res.status(401).send('אימות נדרש');
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function renderLeadsPage(req, res) {
  const status = String(req.query.status || '');
  const q = String(req.query.q || '').slice(0, 80);
  const [rows, counts] = await Promise.all([
    listLeads({ limit: 300, status, q }),
    countLeads(),
  ]);

  const statusChips = ['', ...STATUSES].map((s) => {
    const label = s || 'הכל';
    const on = s === status ? 'background:#c9a24e;color:#1a1408' : 'background:#1c1c22;color:#a2a2ad';
    const href = `/admin/leads?status=${encodeURIComponent(s)}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
    return `<a href="${href}" style="${on};padding:6px 12px;border-radius:999px;text-decoration:none;font-size:13px">${esc(label)}</a>`;
  }).join(' ');

  const tr = rows.map((l) => {
    const disp = formatILDisplay(l.phone_normalized || l.phone_raw);
    const wa = toWaNumber(l.phone_normalized || l.phone_raw);
    const when = new Date(l.created_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
    const opts = STATUSES.map((s) => `<option value="${s}"${s === l.status ? ' selected' : ''}>${s}</option>`).join('');
    const src = [l.utm_source, l.utm_campaign].filter(Boolean).join(' / ') || l.source || '';
    return `<tr>
      <td style="white-space:nowrap;color:#7b7b86;font-size:12px">${esc(when)}</td>
      <td><b>${esc(l.full_name)}</b>${(l.submissions_count || 1) > 1 ? ` <span style="color:#c9a24e">×${l.submissions_count}</span>` : ''}</td>
      <td style="white-space:nowrap">
        <a href="tel:${esc(disp.replace(/[^\d+]/g, ''))}" style="color:#e7c877">${esc(disp)}</a>
        &nbsp;<a href="https://wa.me/${esc(wa)}" target="_blank" style="color:#25d366">wa</a>
      </td>
      <td>${esc(l.city || '')}</td>
      <td style="font-size:12px;color:#a2a2ad">${esc(src)}</td>
      <td>
        <form method="post" action="/admin/leads/${esc(l.id)}" style="display:flex;gap:6px;align-items:center">
          <select name="status" style="background:#151519;color:#f6f6f8;border:1px solid #333;border-radius:8px;padding:4px">${opts}</select>
          <button style="background:#c9a24e;border:0;border-radius:8px;padding:4px 10px;font-weight:700;cursor:pointer">שמור</button>
        </form>
      </td>
    </tr>`;
  }).join('');

  res.set('Content-Type', 'text/html; charset=utf-8').send(`<!DOCTYPE html><html lang="he" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>לידים · גוב ארי</title>
<style>
  body{margin:0;background:#08080a;color:#f6f6f8;font:14px/1.6 -apple-system,Segoe UI,Arial,sans-serif;padding:20px}
  h1{font-size:20px;margin:0 0 4px} .muted{color:#7b7b86}
  .bar{display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin:14px 0}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{text-align:right;padding:10px 8px;border-bottom:1px solid #1c1c22;vertical-align:top}
  th{color:#7b7b86;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.05em}
  input[type=search]{background:#151519;color:#f6f6f8;border:1px solid #333;border-radius:999px;padding:8px 14px;min-width:200px}
  a{color:#e7c877}
</style></head><body>
  <h1>לידים — גוב ארי</h1>
  <div class="muted">סה"כ ${counts.total} · חדשים ${counts.new} · ב-24ש׳ ${counts.last24h}</div>
  <div class="bar">
    <form method="get" action="/admin/leads">
      <input type="search" name="q" value="${esc(q)}" placeholder="חיפוש שם / טלפון / עיר">
      ${status ? `<input type="hidden" name="status" value="${esc(status)}">` : ''}
    </form>
    <div>${statusChips}</div>
    <a href="/admin/leads.csv" style="margin-inline-start:auto">⬇ ייצוא CSV</a>
  </div>
  <table>
    <thead><tr><th>זמן</th><th>שם</th><th>טלפון</th><th>עיר</th><th>מקור</th><th>סטטוס</th></tr></thead>
    <tbody>${tr || '<tr><td colspan="6" class="muted">אין לידים עדיין</td></tr>'}</tbody>
  </table>
</body></html>`);
}

export async function handleStatusUpdate(req, res) {
  await updateLead(req.params.id, { status: req.body.status, notes: req.body.notes });
  const back = req.get('referer') || '/admin/leads';
  res.redirect(303, back);
}

export async function handleCsv(req, res) {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="govari-leads-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(await leadsCsv());
}
