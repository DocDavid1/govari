-- ============================================================
--  גוב ארי — אינספקציה READ-ONLY למסד הפרודקשן
--  הדבק ב-Supabase → SQL Editor → Run. שום דבר כאן לא משנה נתונים/סכימה.
--  שלח לי את הפלט (בלי PII) כדי להשלים את מטריצת ה-drift.
-- ============================================================

-- 1) טבלאות בסכימת public + בעלים + RLS + ספירת שורות משוערת
select c.relname                                   as table_name,
       pg_get_userbyid(c.relowner)                 as owner,
       c.relrowsecurity                            as rls_enabled,
       c.relforcerowsecurity                       as rls_forced,
       c.reltuples::bigint                         as est_rows
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;

-- 2) עמודות של הטבלאות שהאפליקציה מצפה להן
select table_name, ordinal_position, column_name, data_type,
       is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('leads','lead_submissions','lead_events','orders')
order by table_name, ordinal_position;

-- 3) אינדקסים
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('leads','lead_submissions','lead_events','orders')
order by 1,2;

-- 4) constraints (PK / FK / UNIQUE / CHECK)
select tc.table_name, tc.constraint_type, tc.constraint_name,
       kcu.column_name,
       ccu.table_name  as ref_table,
       ccu.column_name as ref_column,
       rc.delete_rule
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
       on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
left join information_schema.constraint_column_usage ccu
       on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
left join information_schema.referential_constraints rc
       on rc.constraint_name = tc.constraint_name and rc.constraint_schema = tc.table_schema
where tc.table_schema = 'public'
  and tc.table_name in ('leads','lead_submissions','lead_events','orders')
order by tc.table_name, tc.constraint_type;

-- 5) triggers + functions
select event_object_table as table_name, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where trigger_schema = 'public'
order by 1,2;

select p.proname as function_name, pg_get_function_identity_arguments(p.oid) as args, l.lanname as language
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public'
order by 1;

-- 6) RLS policies (מצופה: אפס על טבלאות ה-PII)
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by 1,2;

-- 7) GRANTs לתפקידי PostgREST (מצופה אחרי 002: ריק / רק לבעלים)
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated','service_role','public')
  and table_name in ('leads','lead_submissions','lead_events','orders')
order by table_name, grantee, privilege_type;

-- 8) extensions מותקנים
select extname, extversion from pg_extension order by 1;

-- 9) ספירת שורות מדויקת (ללא PII) — האם יש נתונים מהגרסה הישנה?
select 'leads'             as t, count(*) from public.leads
union all select 'lead_submissions', count(*) from public.lead_submissions
union all select 'lead_events',      count(*) from public.lead_events
union all select 'orders',           count(*) from public.orders;
-- (אם טבלה לא קיימת — השורה שלה תיתן שגיאה; הרץ את סעיף 1 קודם לדעת מה קיים.)
