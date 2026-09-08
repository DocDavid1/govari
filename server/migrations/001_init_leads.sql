-- ============================================================
--  גוב ארי — סכימת לידים (מקור האמת)
--  מריצים אוטומטית ב-initDb() בכל cold start (CREATE ... IF NOT EXISTS).
--  אפשר גם להריץ ידנית ב-Supabase → SQL Editor.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---- טבלת לידים קנונית: רשומה אחת ללקוח (מפתח = טלפון מנורמל) ----
create table if not exists leads (
  id                        uuid primary key default gen_random_uuid(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  full_name                 text not null,
  phone_raw                 text not null,
  phone_normalized          text not null,
  city                      text,
  email                     text,
  notes                     text,

  status                    text not null default 'new',   -- new | contacted | qualified | installation_scheduled | won | lost

  -- ייחוס (attribution) — נלכד מהדף בעת ההגשה הראשונה
  source                    text,
  page_url                  text,
  referrer                  text,
  landing_page              text,
  utm_source                text,
  utm_medium                text,
  utm_campaign              text,
  utm_content               text,
  utm_term                  text,
  fbclid                    text,
  gclid                     text,
  fbp                       text,   -- קוקי _fbp (לשיוך CAPI)
  fbc                       text,   -- קוקי _fbc / מ-fbclid

  user_agent                text,
  submissions_count         integer not null default 1,

  contacted_at              timestamptz,
  installation_scheduled_at timestamptz,
  closed_at                 timestamptz
);

create unique index if not exists leads_phone_normalized_key on leads (phone_normalized);
create index if not exists leads_created_at_idx  on leads (created_at desc);
create index if not exists leads_status_idx      on leads (status);
create index if not exists leads_utm_campaign_idx on leads (utm_campaign);

-- ---- כל הגשה נשמרת (גם חוזרת) — היסטוריה מלאה, אף פעם לא זורקים ----
create table if not exists lead_submissions (
  id                uuid primary key default gen_random_uuid(),
  lead_id           uuid not null references leads (id) on delete cascade,
  created_at        timestamptz not null default now(),

  full_name         text,
  phone_raw         text,
  phone_normalized  text,
  city              text,
  email             text,
  notes             text,

  page_url          text,
  referrer          text,
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  utm_content       text,
  utm_term          text,
  fbclid            text,
  gclid             text,
  fbp               text,
  fbc               text,

  user_agent        text,
  ip_hash           text,          -- SHA-256 של IP+salt (לא שומרים IP גולמי)
  idempotency_key   text           -- מזהה שנשלח מהדפדפן למניעת כפילות בלחיצה כפולה / retry
);

create index if not exists lead_submissions_lead_id_idx on lead_submissions (lead_id);
create index if not exists lead_submissions_created_at_idx on lead_submissions (created_at desc);
create unique index if not exists lead_submissions_idem_idx
  on lead_submissions (idempotency_key) where idempotency_key is not null;

-- ---- Outbox: כל התראה/אירוע חיצוני. כתיבת הליד לא תלויה בהם. ----
create table if not exists lead_events (
  id                uuid primary key default gen_random_uuid(),
  lead_id           uuid not null references leads (id) on delete cascade,
  submission_id     uuid references lead_submissions (id) on delete set null,

  event_type        text not null,                 -- ADMIN_EMAIL | META_CAPI | SHEET_BACKUP | ...
  status            text not null default 'pending', -- pending | processing | done | failed
  attempts          integer not null default 0,
  next_attempt_at   timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  processed_at      timestamptz,
  last_error        text,
  payload           jsonb
);

create index if not exists lead_events_due_idx on lead_events (status, next_attempt_at);
create index if not exists lead_events_lead_id_idx on lead_events (lead_id);

-- ---- trigger: עדכון updated_at ----
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists leads_set_updated_at on leads;
create trigger leads_set_updated_at before update on leads
  for each row execute function set_updated_at();
