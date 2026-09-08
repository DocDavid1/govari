// מעבד ה-outbox: לוקח אירועים שהגיע זמנם, מפעיל את המטפל, מסמן done/מתזמן שוב.
// נקרא: (א) best-effort אחרי כתיבת ליד, (ב) ע"י Cron כל דקה — הנתיב האמין.
import { usePg } from './config.js';
import { query } from './db.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { claimDueEvents, completeEvent, failEvent, getLead } from './leads.js';
import { HANDLERS } from './notify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUBS_FILE = path.join(__dirname, '..', 'data', 'lead_submissions.json');

async function loadSubmission(id) {
  if (!id) return null;
  if (usePg()) {
    const r = await query('select * from lead_submissions where id = $1', [id]);
    return r.rows[0] || null;
  }
  try {
    const rows = JSON.parse(await fs.readFile(SUBS_FILE, 'utf8'));
    return rows.find((s) => s.id === id) || null;
  } catch { return null; }
}

/**
 * @param {{max?:number}} opts
 * @returns {Promise<{processed:number, done:number, failed:number, errors:string[]}>}
 */
export async function processOutbox({ max = 20 } = {}) {
  const summary = { processed: 0, done: 0, failed: 0, errors: [] };
  let events;
  try {
    events = await claimDueEvents(max);
  } catch (e) {
    summary.errors.push(`claim: ${e.message}`);
    return summary;
  }

  for (const ev of events) {
    summary.processed++;
    const handler = HANDLERS[ev.event_type];
    if (!handler) {
      await failEvent(ev.id, `no handler for ${ev.event_type}`);
      summary.failed++;
      continue;
    }
    try {
      const lead = await getLead(ev.lead_id);
      if (!lead) throw new Error('lead not found');
      const submission = await loadSubmission(ev.submission_id);
      await handler(lead, submission);
      await completeEvent(ev.id);
      summary.done++;
    } catch (e) {
      await failEvent(ev.id, e.message);
      summary.failed++;
      summary.errors.push(`${ev.event_type}: ${e.message}`);
    }
  }
  return summary;
}

/** ספירת אירועים תקועים — ל-/api/health ולניטור. */
export async function outboxHealth() {
  if (usePg()) {
    try {
      const r = await query(
        `select
           count(*) filter (where status = 'pending')::int  as pending,
           count(*) filter (where status = 'processing')::int as processing,
           count(*) filter (where status = 'failed')::int    as failed,
           count(*) filter (where status = 'pending' and next_attempt_at < now() - interval '15 minutes')::int as stuck`
      );
      return r.rows[0];
    } catch (e) {
      return { error: e.message };
    }
  }
  try {
    const rows = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'data', 'lead_events.json'), 'utf8'));
    return {
      pending: rows.filter((e) => e.status === 'pending').length,
      processing: rows.filter((e) => e.status === 'processing').length,
      failed: rows.filter((e) => e.status === 'failed').length,
      stuck: rows.filter((e) => e.status === 'pending' && Date.now() - new Date(e.next_attempt_at) > 9e5).length,
    };
  } catch { return { pending: 0, processing: 0, failed: 0, stuck: 0 }; }
}
