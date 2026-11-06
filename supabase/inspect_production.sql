-- Run in SQL Editor for project nhtlwcukeyhvkrjveots BEFORE selecting migrations.
-- Read-only. No player names, addresses, tokens or raw records are returned.
-- Save the result privately. A REST 404 cannot establish that a table is absent.
begin read only;

select current_database() as database_name, current_user as inspection_role,
       statement_timestamp() as inspected_at;

-- Complete application table inventory, even before the schema exists.
with expected(name) as (values ('profiles'),('catalogue'),('purchases'),('runs'),
 ('attacks'),('badges'),('dice_receipts'),('wallet_profiles'),('legacy_tickets'),
 ('settings'),('daily_scores'),('lifetime_entries'),('personal_best_baselines'))
select 'hf_private' as schema_name, e.name as table_name,
       c.oid is not null as present, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as force_rls, c.reltuples::bigint as estimated_rows
from expected e left join pg_namespace n on n.nspname='hf_private'
left join pg_class c on c.relnamespace=n.oid and c.relname=e.name and c.relkind in ('r','p')
order by e.name;

-- Include existing public tables too, so an incompatible legacy schema is visible.
select table_schema,table_name,column_name,ordinal_position,data_type,
       udt_name,is_nullable,column_default
from information_schema.columns where table_schema in ('public','hf_private')
order by table_schema,table_name,ordinal_position;

select schemaname,tablename,indexname,indexdef from pg_indexes
where schemaname in ('public','hf_private') order by schemaname,tablename,indexname;

select n.nspname as schema_name,c.relname as table_name,k.conname,
       k.contype,pg_get_constraintdef(k.oid) as definition
from pg_constraint k join pg_class c on c.oid=k.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','hf_private') order by 1,2,3;

-- Zero policies on private RLS-enabled tables is intentional deny-by-default.
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname in ('public','hf_private') order by 1,2,3;

select n.nspname as schema_name,c.relname as table_name,c.relrowsecurity,
       c.relforcerowsecurity,role_name,
       has_table_privilege(role_name,c.oid,'SELECT') as can_select,
       has_table_privilege(role_name,c.oid,'INSERT') as can_insert,
       has_table_privilege(role_name,c.oid,'UPDATE') as can_update,
       has_table_privilege(role_name,c.oid,'DELETE') as can_delete
from pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join (values ('anon'),('authenticated')) r(role_name)
where n.nspname='hf_private' and c.relkind in ('r','p') order by 1,2,5;

select n.nspname as schema_name,p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,p.proconfig as function_settings,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='hf_private' or (n.nspname='public' and p.proname like 'hf\_%' escape '\')
order by 1,2,3;

select n.nspname as schema_name,c.relname as table_name,t.tgname,
       t.tgenabled,pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='hf_private' and not t.tgisinternal order by 1,2,3;

-- These notices work with an empty database and older migration versions.
do $inspection$
declare t record; summary jsonb; service jsonb;
begin
 if to_regprocedure('public.hf_service_status()') is not null then
   execute 'select public.hf_service_status()' into service;
   raise notice 'Installed service: %',service;
 else raise notice 'No service-status function: inspect structural version markers.';
 end if;
 if to_regclass('supabase_migrations.schema_migrations') is not null then
   for t in execute 'select version from supabase_migrations.schema_migrations order by version' loop
     raise notice 'Supabase migration version: %',t.version;
   end loop;
 end if;
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='hf_private' and c.relkind='r' order by c.relname loop
   execute format('select jsonb_build_object(''rows'',count(*),''fingerprint'',md5(coalesce(string_agg(row_data::text,'''' order by row_data::text),''''))) from (select to_jsonb(p) as row_data from hf_private.%I p) data',t.relname) into summary;
   raise notice 'Table hf_private.%: %',t.relname,summary;
 end loop;
end;
$inspection$;
commit;
