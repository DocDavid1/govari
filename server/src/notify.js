// מטפלי התראות (outbox handlers). כל אחד מקבל (lead, submission) ומחזיר/זורק.
// כשלון נתפס ע"י ה-outbox ומתוזמן לניסיון חוזר — לעולם לא מוחק ליד.
import crypto from 'node:crypto';
import { Resend } from 'resend';
import { config, emailEnabled, metaCapiEnabled, sheetBackupEnabled } from './config.js';
import { formatILDisplay, toWaNumber } from './phone.js';

const resend = emailEnabled() ? new Resend(config.email.resendApiKey) : null;
const sha256 = (v) => crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');

// ---------- ADMIN_EMAIL ----------
export async function sendAdminEmail(lead, submission) {
  if (!resend) {
    // אין מפתח — לא מפילים את ה-outbox; נשאר pending לניסיון אחרי הגדרת המפתח.
    throw new Error('RESEND_API_KEY missing');
  }
  const disp = formatILDisplay(lead.phone_normalized || lead.phone_raw);
  const wa = toWaNumber(lead.phone_normalized || lead.phone_raw);
  const created = new Date(submission?.created_at || lead.created_at || Date.now())
    .toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
  const src = [lead.utm_source, lead.utm_campaign, lead.utm_content].filter(Boolean).join(' · ') || lead.source || 'ישיר';
  const repeat = (lead.submissions_count || 1) > 1 ? ` · ליד חוזר (הגשה #${lead.submissions_count})` : '';

  const html = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"></head>
<body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#14141a">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#0b0b0d;border-radius:14px 14px 0 0;padding:18px 22px;color:#fff">
      <span style="font-size:19px;font-weight:800">גוב ארי</span>
      <span style="color:#c9a24e;font-size:12px"> · ליד חדש מהאתר${repeat}</span>
    </div>
    <div style="background:#fff;border:1px solid #e6e6ea;border-top:0;border-radius:0 0 14px 14px;padding:22px">
      <table style="width:100%;border-collapse:collapse;font-size:15px">
        <tr><td style="padding:7px 0;color:#666;width:90px">שם</td><td style="padding:7px 0;font-weight:700">${escapeHtml(lead.full_name)}</td></tr>
        <tr><td style="padding:7px 0;color:#666">טלפון</td><td style="padding:7px 0;font-weight:800;font-size:17px">
          <a href="tel:${escapeHtml(disp.replace(/[^\d+]/g, ''))}" style="color:#0b7">${escapeHtml(disp)}</a></td></tr>
        ${lead.city ? `<tr><td style="padding:7px 0;color:#666">עיר</td><td style="padding:7px 0">${escapeHtml(lead.city)}</td></tr>` : ''}
        ${lead.email ? `<tr><td style="padding:7px 0;color:#666">אימייל</td><td style="padding:7px 0">${escapeHtml(lead.email)}</td></tr>` : ''}
        ${lead.notes ? `<tr><td style="padding:7px 0;color:#666">הערה</td><td style="padding:7px 0">${escapeHtml(lead.notes)}</td></tr>` : ''}
        <tr><td style="padding:7px 0;color:#666">מקור</td><td style="padding:7px 0">${escapeHtml(src)}</td></tr>
        <tr><td style="padding:7px 0;color:#666">זמן</td><td style="padding:7px 0">${escapeHtml(created)}</td></tr>
        <tr><td style="padding:7px 0;color:#666">מזהה</td><td style="padding:7px 0;color:#999;font-size:12px">${escapeHtml(lead.id)}</td></tr>
      </table>
      <div style="margin-top:18px;display:flex;gap:10px">
        <a href="tel:${escapeHtml(disp.replace(/[^\d+]/g, ''))}"
           style="background:#0b7;color:#fff;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:10px">📞 חייג עכשיו</a>
        <a href="https://wa.me/${escapeHtml(wa)}"
           style="background:#25d366;color:#fff;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:10px">💬 וואטסאפ</a>
      </div>
    </div>
    <p style="color:#8a8a95;font-size:12px;text-align:center;margin-top:14px">גוב ארי מערכות · התראת ליד אוטומטית</p>
  </div>
</body></html>`;

  const { data, error } = await resend.emails.send({
    from: config.email.from,
    to: config.email.ownerEmail,
    subject: `ליד חדש מגוב ארי — ${disp}${repeat}`,
    replyTo: lead.email || undefined,
    html,
  });
  if (error) throw new Error(`Resend: ${error.message || JSON.stringify(error)}`);
  return { id: data?.id };
}

// גרסה "חירום" — נקראת ישירות כשמסד הנתונים לא זמין (בלי lead מלא).
export async function sendEmergencyAdminEmail({ fullName, phoneRaw, city, notes, reason }) {
  if (!resend) throw new Error('RESEND_API_KEY missing');
  const disp = formatILDisplay(phoneRaw);
  const { data, error } = await resend.emails.send({
    from: config.email.from,
    to: config.email.ownerEmail,
    subject: `⚠️ ליד גוב ארי (מצב חירום — המסד לא זמין) — ${disp}`,
    html: `<div dir="rtl" style="font-family:Arial;font-size:15px">
      <p style="color:#b00"><b>שים לב:</b> מסד הנתונים לא היה זמין בעת קליטת הליד. פרטים מלאים למטה — נא לתעד ידנית.</p>
      <p>סיבה: ${escapeHtml(reason || '')}</p>
      <table>
        <tr><td style="color:#666;padding:4px 8px">שם</td><td style="padding:4px 8px"><b>${escapeHtml(fullName || '')}</b></td></tr>
        <tr><td style="color:#666;padding:4px 8px">טלפון</td><td style="padding:4px 8px"><b>${escapeHtml(disp)}</b></td></tr>
        <tr><td style="color:#666;padding:4px 8px">עיר</td><td style="padding:4px 8px">${escapeHtml(city || '')}</td></tr>
        <tr><td style="color:#666;padding:4px 8px">הערה</td><td style="padding:4px 8px">${escapeHtml(notes || '')}</td></tr>
      </table></div>`,
  });
  if (error) throw new Error(`Resend: ${error.message || JSON.stringify(error)}`);
  return { id: data?.id, emergency: true };
}

// ---------- META_CAPI ----------
export async function sendMetaCapi(lead, submission) {
  if (!metaCapiEnabled()) throw new Error('META_CAPI not configured');
  const { pixelId, capiToken, graphVersion, testEventCode } = config.meta;
  const nat = String(lead.phone_normalized || '').replace('+', '');
  const userData = {
    ph: nat ? [sha256(nat)] : undefined,
    fn: lead.full_name ? [sha256(lead.full_name)] : undefined,
    em: lead.email ? [sha256(lead.email)] : undefined,
    ct: lead.city ? [sha256(lead.city)] : undefined,
    country: [sha256('il')],
    client_user_agent: lead.user_agent || undefined,
    fbc: lead.fbc || undefined,
    fbp: lead.fbp || undefined,
  };
  Object.keys(userData).forEach((k) => userData[k] === undefined && delete userData[k]);

  const body = {
    data: [{
      event_name: 'Lead',
      event_time: Math.floor(new Date(submission?.created_at || Date.now()).getTime() / 1000),
      event_id: submission?.id || lead.id,          // דדופ מול פיקסל הדפדפן
      action_source: 'website',
      event_source_url: lead.page_url || config.siteUrl,
      user_data: userData,
      custom_data: { currency: config.product.currency, value: 0, content_name: 'callback_lead' },
    }],
  };
  if (testEventCode) body.test_event_code = testEventCode;
  body.access_token = capiToken; // בגוף ה-POST, לא ב-query — כדי שלא ידלוף ללוגים/שגיאות

  const url = `https://graph.facebook.com/${graphVersion}/${pixelId}/events`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`Meta CAPI network error: ${e.code || e.name || 'fetch failed'}`); // בלי URL/טוקן
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // מנקים כל token שמוחזר בטעות בגוף התשובה
    const safe = JSON.stringify(json).replace(/"access_token":"[^"]*"/g, '"access_token":"***"').slice(0, 300);
    throw new Error(`Meta CAPI ${res.status}: ${safe}`);
  }
  return json;
}

// ---------- SHEET_BACKUP ----------
export async function sendSheetBackup(lead, submission) {
  if (!sheetBackupEnabled()) throw new Error('SHEET_WEBHOOK_URL not configured');
  const res = await fetch(config.sheetWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: lead.id, created_at: submission?.created_at || lead.created_at,
      full_name: lead.full_name, phone: formatILDisplay(lead.phone_normalized),
      city: lead.city || '', email: lead.email || '', notes: lead.notes || '',
      utm_source: lead.utm_source || '', utm_campaign: lead.utm_campaign || '',
      utm_content: lead.utm_content || '', fbclid: lead.fbclid || '',
      status: lead.status,
    }),
  });
  if (!res.ok) throw new Error(`Sheet backup ${res.status}`);
  return { ok: true };
}

export const HANDLERS = {
  ADMIN_EMAIL: sendAdminEmail,
  META_CAPI: sendMetaCapi,
  SHEET_BACKUP: sendSheetBackup,
};

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
