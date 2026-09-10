# GOVARI — PRODUCTION ALIGNMENT PLAN

Commit audited: `f42ec20` (+ `002_rls_grants.sql` added this round → commit will change on push).
Supabase project: `gevkcslzkeosyrapdglz` (region **ap-southeast-1 / Singapore**, Postgres 17.6).
Vercel project: `govari` (`prj_17VONAbbTmFa2Jc9rnnCpRyAp8wj`), live URL `govari-d7u3.vercel.app` = **pre-v2.0**.

> Nothing below has been executed. I have **no Supabase credentials and no Vercel login**, so
> Phases 4/5/7-live/18/19/20 must be run by the owner. Read-only inspection first.

---

## STEP 0 — Read-only Supabase inspection (BEFORE anything)

Supabase → SQL Editor → paste **`server/sql/inspect_readonly.sql`** → Run.
Send me the output (no PII in it). This confirms:
- which tables already exist (old-site data?)
- current RLS / grants / policies
- extensions, indexes, constraints, triggers
- row counts

**Do not proceed to STEP 1 until this is reviewed.** If `leads`/`lead_submissions`/`lead_events`
already exist with a **different** column set → STOP and report (schema drift; needs a hand-written
additive `003_*.sql`, never an edit to `001`).

Expected clean-project result: tables `leads`/`lead_submissions`/`lead_events`/`orders` **do not exist**;
only Supabase system schemas populated.

---

## STEP 1 — DB migration(s)

Run **manually in Supabase SQL Editor, in order** (do not rely on the app's parallel auto-run for the first apply):

1. `server/migrations/001_init_leads.sql`
   - creates: `leads` (28 cols), `lead_submissions` (23), `lead_events` (11) + 9 indexes + FKs + `set_updated_at()` fn + `leads_set_updated_at` trigger.
   - `create ... if not exists` / `create or replace` / one self-recreating `drop trigger if exists`. **No DROP TABLE / DROP COLUMN / DELETE / UPDATE.** Idempotent. SHA256 `347428eceba1dc0b92e5da7cff938202304be8dbcf34a9fbd47ee0e0d3a2b3e3`.
2. `server/migrations/002_rls_grants.sql`
   - `alter table … enable row level security` + `revoke all … from anon, authenticated, public` for `leads`, `lead_submissions`, `lead_events`, `orders` (each guarded by `to_regclass(...) is not null`).
   - **No CREATE POLICY** (deliberate — RLS on + 0 policies + not FORCE = deny-all except table owner). Idempotent, additive, reversible.
   - Note: `orders` is created lazily by `server/src/orders.js` on first cold start. If it doesn't exist yet when `002` runs, it's skipped; re-run `002` after `orders` appears (or the app re-runs it next cold start).

> `orders` table itself is created by `server/src/orders.js:initDb()` at runtime (not in a migration file). That's existing behaviour — leave as is unless you want an explicit `000_orders.sql`.

---

## STEP 2 — RLS / grants verification

Re-run **`server/sql/inspect_readonly.sql`** sections 1, 6, 7. Expected:
- §1: `rls_enabled = true` for `leads`, `lead_submissions`, `lead_events`, `orders`
- §6: **zero rows** (no policies on the PII tables)
- §7: **zero rows** for `anon` / `authenticated` on those tables (only `service_role`/owner may remain)

If any `anon`/`authenticated` grant survives → re-run `002` or add explicit `revoke`.

---

## STEP 3 — Supabase verification (schema contract)

Compare `inspect_readonly.sql` §2–§5 against **"CURRENT EXPECTED SCHEMA"** in the end-to-end report.
All columns/types/indexes/FKs/trigger must be present. Any `MISSING` → hand-write `003_*.sql` (additive). Any `EXTRA` old column → leave it (harmless, additive plan preserves old data).

---

## STEP 4 — Vercel environment variables

Project → Settings → Environment Variables (Production scope). From the ENV CONTRACT:

| var | value | notes |
|---|---|---|
| `DATABASE_URL` | Supabase **Transaction pooler**, port **6543** | `…pooler.supabase.com:6543/postgres`. Not session (5432). |
| `PGSSL` | `true` | |
| `IP_HASH_SALT` | long random string | not the dev default |
| `SITE_URL` | `https://<production domain>` | |
| `SERVE_SITE` | `false` | static site served by Vercel, not Express |
| `OWNER_EMAIL` | lead-notification recipient | |
| `RESEND_API_KEY` | from Resend | |
| `FROM_EMAIL` | address on a **verified** Resend domain | |
| `META_PIXEL_ID` | from Events Manager | **also** paste into `site/js/config.js` and push |
| `META_CAPI_TOKEN` | from Events Manager → Conversions API | server-only |
| `META_TEST_EVENT_CODE` | test code — **remove before campaign** | optional |
| `ADMIN_USER` / `ADMIN_PASSWORD` | only if using `/admin/leads` | optional (Supabase dashboard is enough) |
| `OUTBOX_TICK_SECRET` | random — only if cron via cron-job.org | see STEP 7 |
| `SHEET_WEBHOOK_URL` | optional Google-Sheet mirror | optional |

Do **not** set: `PORT`, `NODE_ENV` (Vercel sets it), `PRODUCT_*` (defaults fine).

---

## STEP 5 — Resend config

1. Add + verify sending domain (DNS records).
2. `FROM_EMAIL` on that domain, `FROM_NAME=גוב ארי מערכות`.
3. `OWNER_EMAIL` = where the alert goes.
4. API key → `RESEND_API_KEY`.
Without a key: lead still saved; `ADMIN_EMAIL` event stays `pending` and retries once the key is set.

---

## STEP 6 — Meta config

1. Events Manager → Pixel → copy **Pixel ID** → `site/js/config.js` `metaPixelId` → commit + push.
2. Conversions API → generate token → `META_CAPI_TOKEN` + `META_PIXEL_ID` in Vercel.
3. Test Events → temporary `META_TEST_EVENT_CODE` in Vercel for the smoke test.
4. Browser `Lead` and server `Lead` share `event_id = submission id` → dedup automatic.

---

## STEP 7 — Deployment

**Root cause the live site is stale:** the Vercel project `govari` is **not linked to the GitHub repo** `DocDavid1/govari` (repo created 2026‑09‑08; project was CLI-deployed earlier). Pushing to `main` deploys nothing.

Fix (choose one):
- **A (recommended):** Vercel → Project `govari` → Settings → **Git → Connect Git Repository** → `DocDavid1/govari`, Production Branch = `main`. Then every push to `main` auto-deploys.
- **B:** `vercel login` then `vercel --prod` from the repo root (uses the linked `.vercel/project.json`).

**`vercel.json` finding — must fix before deploy:** the file uses the legacy `builds` + `routes` keys. When `builds` is present, Vercel **ignores top-level `crons` and `headers`** → the outbox cron and security headers would silently not apply. Replace with the modern schema (see report §14 for the exact file). Verify on a **preview deployment** first.

Cron: after `vercel.json` is modernised, `crons: [{ "path": "/api/outbox/tick", "schedule": "* * * * *" }]` needs a **Pro** plan for minute granularity. On **Hobby**, use cron-job.org hitting `https://<domain>/api/outbox/tick?key=<OUTBOX_TICK_SECRET>` every minute.

---

## STEP 8 — `/api/health`

`GET https://<domain>/api/health` → expect `200` and:
```
{ "ok": true, "db": { "mode": "postgres", "ok": true }, "outbox": { "stuck": 0, ... },
  "email": "on", "metaCapi": "on", ... }
```
`db.mode` must be `postgres` (not `json-file`). `503` / `mode:"json-file"` ⇒ `DATABASE_URL` missing or wrong.

---

## STEP 9 — Real lead smoke test (owner, from phone)

Open on your phone (not via a paid ad):
```
https://<domain>/?utm_source=manual_test&utm_medium=qa&utm_campaign=preflight&fbclid=TEST.1.qa.<time>
```
Fill the top form: name `בדיקה טרום-קמפיין`, **your real phone**, city optional → "אני רוצה שיחזרו אליי" → see **"קיבלנו את הפרטים 👍"**. Do not resubmit. Tell me + send the phone you used.

---

## STEP 10 — Pixel / CAPI verification (me, using your inspect output + Events Manager)

- Supabase `leads`: exactly **one** row for the normalized phone; `lead_submissions`: one; `lead_events`: `ADMIN_EMAIL` + `META_CAPI`.
- Events Manager → Test Events: `Lead` from **Browser** and **Server**, same `event_id`, shown deduplicated.
- `leads` row has `utm_source=manual_test`, `utm_campaign=preflight`, `fbclid=TEST.1.qa.*`.

---

## STEP 11 — Admin verification

Supabase Table Editor → `leads` → the test lead visible. Or `/admin/leads` (if `ADMIN_USER/PASSWORD` set) → 401 without auth, lead listed with auth, status dropdown saves.

---

## STEP 12 — Campaign certification

Only when STEP 2, 3, 8, 9, 10, 11 all pass **against live infra**, and STEP 7's `vercel.json` fix is deployed, and the content/legal owner actions (report §16) are resolved →
re-issue the **GOVARI END-TO-END PRODUCTION ALIGNMENT REPORT** with `FINAL STATUS: READY FOR PAID META TRAFFIC`.

Until then: **DO NOT DEPLOY / DO NOT START CAMPAIGN.**
