-- Run AFTER only the missing migrations, in the same production SQL Editor.
-- Read-only metadata/aggregate checks. Every boolean should be true.
begin read only;
select public.hf_service_status() = '{"schemaVersion":7,"rulesVersion":6,"leaderboard":"lifetime","migration":9}'::jsonb as current_service;
select to_regprocedure('hf_private.forage_column(text)') is not null
   and exists(select 1 from information_schema.columns where table_schema='hf_private' and table_name='profiles' and column_name='reward_tokens') as reward_guard_installed;
select exists(select 1 from information_schema.columns where table_schema='hf_private' and table_name='runs' and column_name='pending_score')
 and to_regprocedure('public.hf_settle_rewards()') is not null as deferred_rewards_installed;
select not has_function_privilege('anon','public.hf_settle_rewards()','EXECUTE')
 and has_function_privilege('authenticated','public.hf_settle_rewards()','EXECUTE') as settlement_access_secured;

select count(*) filter(where c.relname=any(array['profiles','catalogue','purchases','runs','attacks','badges','dice_receipts','wallet_profiles','legacy_tickets','settings','daily_scores','lifetime_entries']))=12 as expected_tables_present,
       coalesce(bool_and(c.relrowsecurity),false) as all_private_tables_have_rls,
       coalesce(bool_and(not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
         and not has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')),false) as browser_table_access_denied
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='hf_private' and c.relkind='r';
select not has_schema_privilege('anon','hf_private','USAGE')
   and not has_schema_privilege('authenticated','hf_private','USAGE') as private_schema_denied;
select not exists(select 1 from pg_policies where schemaname='hf_private' and permissive='PERMISSIVE') as no_permissive_private_policies;
select coalesce(bool_and(not has_function_privilege('anon',p.oid,'EXECUTE')
  and not has_function_privilege('authenticated',p.oid,'EXECUTE')),false) as private_helpers_denied
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='hf_private';

select has_function_privilege('anon','public.hf_lifetime_top100()','EXECUTE') as public_top100_available,
       has_function_privilege('authenticated','public.hf_progress(uuid,jsonb)','EXECUTE') as authenticated_progress_available,
       not has_function_privilege('anon','public.hf_progress(uuid,jsonb)','EXECUTE') as anonymous_progress_denied,
       not has_function_privilege('anon','public.hf_wallet_profile(uuid)','EXECUTE') as anonymous_profile_denied;
select coalesce(bool_and(p.prosecdef and p.proconfig @> array['search_path=""']),false) as rpc_search_paths_fixed
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('hf_wallet_profile','hf_profile','hf_progress','hf_purchase','hf_equip','hf_start_run_v6','hf_run_state','hf_settle_rewards','hf_lifetime_top100');

select not exists(select 1 from hf_private.wallet_profiles group by wallet having count(*)>1) as wallet_links_unique,
       not exists(select 1 from hf_private.wallet_profiles where wallet<>lower(wallet)) as wallets_canonical;
select exists(select 1 from pg_trigger where tgrelid='hf_private.profiles'::regclass and tgname='hf_retain_lifetime' and tgenabled='O') as lifetime_retention_enabled,
       exists(select 1 from pg_trigger where tgrelid='hf_private.runs'::regclass and tgname='hf_settle_lifetime' and tgenabled='O') as checkpoint_trigger_enabled;
select not exists(select 1 from hf_private.runs where rules_version=6 and score<>lifetime_credited) as scores_checkpointed;
with board as (select public.hf_lifetime_top100()->'rows' as rows),
 ranked as (select ordinality,(value->>'score')::bigint as score,
     lag((value->>'score')::bigint) over(order by ordinality) as previous_score
     from board,jsonb_array_elements(rows) with ordinality)
select (select jsonb_array_length(rows)<=100 from board) as top100_capped,
       not exists(select 1 from ranked where previous_score<score) as top100_descending;
commit;
