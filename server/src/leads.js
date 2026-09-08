// ניהול לידים — מקור האמת. PostgreSQL בפרודקשן, קובץ JSON בפיתוח (ללא DATABASE_URL).
//
// עקרונות:
//  • כתיבת הליד היא אטומית ומצליחה/נכשלת לבד — לא תלויה במייל/אנליטיקס.
//  • כל הגשה נשמרת ב-lead_submissions (גם חוזרת). לעולם לא זורקים הגשה.
//  • ליד חוזר (אותו טלפון) מעדכן את הרשומה הקנונית ומוסיף הגשה + אירועים.
//  • כפילות לחיצה/רשת: idempotency_key מחזיר את אותה תוצאה בלי אירועים כפולים.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { config, usePg, metaCapiEnabled, sheetBackupEnabled } from './config.js';
import { query, tx, hashIp } from './db.js';
import { normalizeILPhone, isPlausiblePhone } from './phone.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const F = {
  leads: path.join(DATA_DIR, 'leads.json'),
  subs: path.join(DATA_DIR, 'lead_submissions.json'),
  events: path.join(DATA_DIR, 'lead_events.json'),
};

const MAX_ATTEMPTS = 6;
const BACKOFF_MIN = [0, 1, 5, 15, 60, 180]; // דקות לפי מספר ניסיון

const uuid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const clip = (s, n) => (s == null ? null : String(s).trim().slice(0, n) || null);

// ---------- עזרי JSON (מצב פיתוח) ----------
async function jread(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}
async function jwrite(file, rows) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(rows, null, 2), 'utf8');
  await fs.rename(tmp, file); // כתיבה אטומית
}

// mutex פשוט — מסדר את פעולות ה-JSON store כדי למנוע read-modify-write תחרותי (dev)
let jlock = Promise.resolve();
function withJsonLock(fn) {
  const run = jlock.then(fn, fn);
  jlock = run.then(() => {}, () => {});
  return run;
}

// ---------- אתחול ----------
export async function initLeads() {
  if (usePg()) {
    const { migrate } = await import('./db.js');
    await migrate();
  } else {
    await fs.mkdir(DATA_DIR, { recursive: true });
    console.log('[leads] אחסון: קובץ JSON מקומי (ללא DATABASE_URL) — לא לפרודקשן');
  }
}

// ---------- נירמול קלט ----------
export function cleanLeadInput(body = {}) {
  const errors = [];
  const b = body || {};
  const fullName = clip(b.full_name ?? b.fullName ?? b.name, 120) || '';
  const phoneRaw = String(b.phone ?? b.phone_raw ?? '').trim().slice(0, 40);

  if (fullName.length < 2) errors.push('חסר שם מלא');
  if (!isPlausiblePhone(phoneRaw)) errors.push('מספר טלפון לא תקין');

  const a = b.attribution || b;
  const clean = {
    fullName,
    phoneRaw,
    phoneNormalized: normalizeILPhone(phoneRaw) || phoneRaw.replace(/[^\d+]/g, ''),
    city: clip(b.city, 80),
    email: clip(b.email, 160),
    notes: clip(b.notes, 500),
    idempotencyKey: clip(b.idempotency_key ?? b.idempotencyKey, 64),
    attribution: {
      source: clip(a.source, 40) || 'website',
      pageUrl: clip(a.page_url ?? a.pageUrl, 500),
      referrer: clip(a.referrer, 500),
      landingPage: clip(a.landing_page ?? a.landingPage, 500),
      utmSource: clip(a.utm_source ?? a.utmSource, 120),
      utmMedium: clip(a.utm_medium ?? a.utmMedium, 120),
      utmCampaign: clip(a.utm_campaign ?? a.utmCampaign, 160),
      utmContent: clip(a.utm_content ?? a.utmContent, 160),
      utmTerm: clip(a.utm_term ?? a.utmTerm, 160),
      fbclid: clip(a.fbclid, 400),
      gclid: clip(a.gclid, 400),
      fbp: clip(a.fbp, 200),
      fbc: clip(a.fbc, 400),
    },
  };
  return { ok: errors.length === 0, errors, clean };
}

function plannedEvents() {
  const types = ['ADMIN_EMAIL'];
  if (metaCapiEnabled()) types.push('META_CAPI');
  if (sheetBackupEnabled()) types.push('SHEET_BACKUP');
  return types;
}

// ============================================================
//  createLead — כתיבה אטומית של ליד + הגשה + אירועי outbox
// ============================================================
export async function createLead(clean, meta = {}) {
  const ipHash = meta.ip ? hashIp(meta.ip) : null;
  const userAgent = clip(meta.userAgent, 400);

  if (usePg()) return createLeadPg(clean, { ipHash, userAgent });
  return createLeadJson(clean, { ipHash, userAgent });
}

async function createLeadPg(c, { ipHash, userAgent }) {
  return tx(async (db) => {
    // idempotency — הגשה שכבר נקלטה
    if (c.idempotencyKey) {
      const dup = await db.query(
        `select s.id as submission_id, s.lead_id from lead_submissions s where s.idempotency_key = $1`,
        [c.idempotencyKey]
      );
      if (dup.rows[0]) {
        return { leadId: dup.rows[0].lead_id, submissionId: dup.rows[0].submission_id, deduped: true, isNew: false };
      }
    }

    const at = c.attribution;
    const existing = await db.query('select id from leads where phone_normalized = $1 for update', [c.phoneNormalized]);
    let leadId;
    let isNew;

    if (existing.rows[0]) {
      leadId = existing.rows[0].id;
      isNew = false;
      await db.query(
        `update leads set
           full_name = $2, city = coalesce($3, city), email = coalesce($4, email),
           notes = coalesce($5, notes), phone_raw = $6,
           submissions_count = submissions_count + 1,
           status = case when status = 'lost' then 'new' else status end
         where id = $1`,
        [leadId, c.fullName, c.city, c.email, c.notes, c.phoneRaw]
      );
    } else {
      isNew = true;
      const ins = await db.query(
        `insert into leads
          (full_name, phone_raw, phone_normalized, city, email, notes, status,
           source, page_url, referrer, landing_page,
           utm_source, utm_medium, utm_campaign, utm_content, utm_term,
           fbclid, gclid, fbp, fbc, user_agent)
         values ($1,$2,$3,$4,$5,$6,'new',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         returning id`,
        [c.fullName, c.phoneRaw, c.phoneNormalized, c.city, c.email, c.notes,
         at.source, at.pageUrl, at.referrer, at.landingPage,
         at.utmSource, at.utmMedium, at.utmCampaign, at.utmContent, at.utmTerm,
         at.fbclid, at.gclid, at.fbp, at.fbc, userAgent]
      );
      leadId = ins.rows[0].id;
    }

    const sub = await db.query(
      `insert into lead_submissions
        (lead_id, full_name, phone_raw, phone_normalized, city, email, notes,
         page_url, referrer, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
         fbclid, gclid, fbp, fbc, user_agent, ip_hash, idempotency_key)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       returning id`,
      [leadId, c.fullName, c.phoneRaw, c.phoneNormalized, c.city, c.email, c.notes,
       at.pageUrl, at.referrer, at.utmSource, at.utmMedium, at.utmCampaign, at.utmContent, at.utmTerm,
       at.fbclid, at.gclid, at.fbp, at.fbc, userAgent, ipHash, c.idempotencyKey]
    );
    const submissionId = sub.rows[0].id;

    for (const type of plannedEvents()) {
      await db.query(
        `insert into lead_events (lead_id, submission_id, event_type, payload)
         values ($1,$2,$3,$4)`,
        [leadId, submissionId, type, JSON.stringify({ leadId, submissionId })]
      );
    }
    return { leadId, submissionId, isNew, deduped: false };
  });
}

function createLeadJson(c, meta) {
  return withJsonLock(() => createLeadJsonUnlocked(c, meta));
}
async function createLeadJsonUnlocked(c, { ipHash, userAgent }) {
  const [leads, subs, events] = await Promise.all([jread(F.leads), jread(F.subs), jread(F.events)]);

  if (c.idempotencyKey) {
    const dup = subs.find((s) => s.idempotency_key === c.idempotencyKey);
    if (dup) return { leadId: dup.lead_id, submissionId: dup.id, deduped: true, isNew: false };
  }

  const at = c.attribution;
  let lead = leads.find((l) => l.phone_normalized === c.phoneNormalized);
  let isNew = false;
  if (lead) {
    lead.full_name = c.fullName;
    lead.city = c.city || lead.city;
    lead.email = c.email || lead.email;
    lead.notes = c.notes || lead.notes;
    lead.phone_raw = c.phoneRaw;
    lead.submissions_count = (lead.submissions_count || 1) + 1;
    lead.updated_at = nowIso();
    if (lead.status === 'lost') lead.status = 'new';
  } else {
    isNew = true;
    lead = {
      id: uuid(), created_at: nowIso(), updated_at: nowIso(),
      full_name: c.fullName, phone_raw: c.phoneRaw, phone_normalized: c.phoneNormalized,
      city: c.city, email: c.email, notes: c.notes, status: 'new',
      source: at.source, page_url: at.pageUrl, referrer: at.referrer, landing_page: at.landingPage,
      utm_source: at.utmSource, utm_medium: at.utmMedium, utm_campaign: at.utmCampaign,
      utm_content: at.utmContent, utm_term: at.utmTerm, fbclid: at.fbclid, gclid: at.gclid,
      fbp: at.fbp, fbc: at.fbc, user_agent: userAgent, submissions_count: 1,
      contacted_at: null, installation_scheduled_at: null, closed_at: null,
    };
    leads.push(lead);
  }

  const submission = {
    id: uuid(), lead_id: lead.id, created_at: nowIso(),
    full_name: c.fullName, phone_raw: c.phoneRaw, phone_normalized: c.phoneNormalized,
    city: c.city, email: c.email, notes: c.notes,
    page_url: at.pageUrl, referrer: at.referrer,
    utm_source: at.utmSource, utm_medium: at.utmMedium, utm_campaign: at.utmCampaign,
    utm_content: at.utmContent, utm_term: at.utmTerm, fbclid: at.fbclid, gclid: at.gclid,
    fbp: at.fbp, fbc: at.fbc, user_agent: userAgent, ip_hash: ipHash,
    idempotency_key: c.idempotencyKey,
  };
  subs.push(submission);

  for (const type of plannedEvents()) {
    events.push({
      id: uuid(), lead_id: lead.id, submission_id: submission.id,
      event_type: type, status: 'pending', attempts: 0,
      next_attempt_at: nowIso(), created_at: nowIso(), processed_at: null,
      last_error: null, payload: { leadId: lead.id, submissionId: submission.id },
    });
  }

  await Promise.all([jwrite(F.leads, leads), jwrite(F.subs, subs), jwrite(F.events, events)]);
  return { leadId: lead.id, submissionId: submission.id, isNew, deduped: false };
}

// ============================================================
//  Outbox — claim / complete / reschedule
// ============================================================
export async function claimDueEvents(limit = 10) {
  if (usePg()) {
    const r = await query(
      `update lead_events e set status = 'processing'
         where e.id in (
           select id from lead_events
            where status in ('pending')
              and next_attempt_at <= now()
            order by next_attempt_at
            limit $1
            for update skip locked
         )
       returning e.*`,
      [limit]
    );
    return r.rows;
  }
  return withJsonLock(async () => {
    const events = await jread(F.events);
    const due = events.filter((e) => e.status === 'pending' && new Date(e.next_attempt_at) <= new Date()).slice(0, limit);
    due.forEach((e) => { e.status = 'processing'; });
    if (due.length) await jwrite(F.events, events);
    return due;
  });
}

export async function completeEvent(id) {
  if (usePg()) {
    await query(`update lead_events set status='done', processed_at=now(), last_error=null where id=$1`, [id]);
    return;
  }
  return withJsonLock(async () => {
    const events = await jread(F.events);
    const e = events.find((x) => x.id === id);
    if (e) { e.status = 'done'; e.processed_at = nowIso(); e.last_error = null; await jwrite(F.events, events); }
  });
}

export async function failEvent(id, errMsg) {
  const msg = String(errMsg || 'error').slice(0, 500);
  if (usePg()) {
    await query(
      `update lead_events set
         attempts = attempts + 1,
         status = case when attempts + 1 >= $2 then 'failed' else 'pending' end,
         next_attempt_at = now() + (make_interval(mins => (case
             when attempts + 1 >= array_length($3::int[],1) then $3[array_length($3::int[],1)]
             else $3[attempts + 1] end))),
         last_error = $4
       where id = $1`,
      [id, MAX_ATTEMPTS, BACKOFF_MIN, msg]
    );
    return;
  }
  return withJsonLock(async () => {
    const events = await jread(F.events);
    const e = events.find((x) => x.id === id);
    if (e) {
      e.attempts = (e.attempts || 0) + 1;
      const mins = BACKOFF_MIN[Math.min(e.attempts, BACKOFF_MIN.length - 1)];
      e.next_attempt_at = new Date(Date.now() + mins * 60000).toISOString();
      e.status = e.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
      e.last_error = msg;
      await jwrite(F.events, events);
    }
  });
}

// ============================================================
//  קריאה — לאדמין / דוחות
// ============================================================
export async function getLead(id) {
  if (usePg()) {
    const r = await query('select * from leads where id = $1', [id]);
    return r.rows[0] || null;
  }
  const leads = await jread(F.leads);
  return leads.find((l) => l.id === id) || null;
}

export async function listLeads({ limit = 100, offset = 0, status = '', q = '' } = {}) {
  if (usePg()) {
    const where = [];
    const args = [];
    if (status) { args.push(status); where.push(`status = $${args.length}`); }
    if (q) { args.push(`%${q}%`); where.push(`(full_name ilike $${args.length} or phone_normalized ilike $${args.length} or phone_raw ilike $${args.length} or city ilike $${args.length})`); }
    const clause = where.length ? `where ${where.join(' and ')}` : '';
    args.push(limit); args.push(offset);
    const r = await query(
      `select * from leads ${clause} order by created_at desc limit $${args.length - 1} offset $${args.length}`,
      args
    );
    return r.rows;
  }
  let rows = await jread(F.leads);
  rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (status) rows = rows.filter((l) => l.status === status);
  if (q) {
    const s = q.toLowerCase();
    rows = rows.filter((l) => [l.full_name, l.phone_normalized, l.phone_raw, l.city].filter(Boolean).some((v) => String(v).toLowerCase().includes(s)));
  }
  return rows.slice(offset, offset + limit);
}

export async function countLeads() {
  if (usePg()) {
    const r = await query(
      `select
         count(*)::int as total,
         count(*) filter (where status = 'new')::int as new,
         count(*) filter (where created_at > now() - interval '24 hours')::int as last24h`
    );
    return r.rows[0];
  }
  const rows = await jread(F.leads);
  const dayAgo = Date.now() - 86400000;
  return {
    total: rows.length,
    new: rows.filter((l) => l.status === 'new').length,
    last24h: rows.filter((l) => new Date(l.created_at).getTime() > dayAgo).length,
  };
}

const STATUSES = ['new', 'contacted', 'qualified', 'installation_scheduled', 'won', 'lost'];
export { STATUSES };

export async function updateLead(id, patch = {}) {
  const allowed = {};
  if (patch.status && STATUSES.includes(patch.status)) allowed.status = patch.status;
  if (typeof patch.notes === 'string') allowed.notes = patch.notes.slice(0, 2000);
  if (!Object.keys(allowed).length) return getLead(id);

  const stamps = {};
  if (allowed.status === 'contacted') stamps.contacted_at = nowIso();
  if (allowed.status === 'installation_scheduled') stamps.installation_scheduled_at = nowIso();
  if (allowed.status === 'won' || allowed.status === 'lost') stamps.closed_at = nowIso();

  if (usePg()) {
    const fields = { ...allowed, ...stamps };
    const keys = Object.keys(fields);
    const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const r = await query(`update leads set ${set} where id = $1 returning *`, [id, ...keys.map((k) => fields[k])]);
    return r.rows[0] || null;
  }
  return withJsonLock(async () => {
    const leads = await jread(F.leads);
    const l = leads.find((x) => x.id === id);
    if (!l) return null;
    Object.assign(l, allowed, stamps, { updated_at: nowIso() });
    await jwrite(F.leads, leads);
    return l;
  });
}

export async function leadsCsv() {
  const rows = await listLeads({ limit: 5000 });
  const cols = ['created_at', 'full_name', 'phone_normalized', 'phone_raw', 'city', 'email',
    'status', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'fbclid', 'notes'];
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.join(',');
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n');
  return '﻿' + head + '\n' + body + '\n'; // BOM לפתיחה תקינה ב-Excel עברית
}
