-- ============================================================
--  גוב ארי — הקשחת גישה לטבלאות PII
--  002 · additive · idempotent · לא הרסני · בטוח בהרצה חוזרת
--
--  מטרה: לחסום קריאה/כתיבה ציבורית (PostgREST / anon / authenticated)
--  לטבלאות שמכילות שם + טלפון. האפליקציה מתחברת עם תפקיד הבעלים
--  (postgres, דרך ה-pooler) ולכן ממשיכה לעבוד — בעלים עוקף RLS.
--
--  אין CREATE POLICY בכוונה: RLS פעיל + אפס policies + בלי FORCE =
--  "deny by default" לכל תפקיד שאינו הבעלים.
--
--  אין DROP · אין DELETE · אין ALTER על עמודות · אין שינוי נתונים.
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array['leads', 'lead_submissions', 'lead_events', 'orders']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on public.%I from anon', t);
      execute format('revoke all on public.%I from authenticated', t);
      -- public = כל תפקיד. הבעלים (postgres) לא מושפע מ-revoke על העמודה הזו.
      execute format('revoke all on public.%I from public', t);
    end if;
  end loop;
end $$;

-- ווידוא שגם רצפים לא נגישים ל-anon/authenticated (uuid default לא משתמש בהם,
-- אבל אם יתווסף עמוד serial בעתיד — כבר סגור).
do $$
declare s text;
begin
  for s in
    select sequence_name from information_schema.sequences where sequence_schema = 'public'
  loop
    execute format('revoke all on sequence public.%I from anon, authenticated', s);
  end loop;
end $$;
