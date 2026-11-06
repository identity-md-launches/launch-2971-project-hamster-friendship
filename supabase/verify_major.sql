-- Read-only owner verification AFTER applying 011 to the original project.
-- Does not expose addresses, keys, player names or raw player records.
begin read only;
select public.hf_service_status() = '{"schemaVersion":7,"leaderboard":"lifetime","rulesVersion":6,"migration":11,"validation":"replay-1","scoreMode":"personal-best","engineVersion":2}'::jsonb as current_service;
select exists(select 1 from information_schema.columns where table_schema='hf_private' and table_name='profiles' and column_name='produce_points') as produce_progress_present;
select bool_and(c.relrowsecurity) as all_private_tables_have_rls
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='hf_private' and c.relkind='r';
select not has_schema_privilege('anon','hf_private','USAGE') as anonymous_private_schema_denied,
 not has_schema_privilege('authenticated','hf_private','USAGE') as authenticated_private_schema_denied;
select not has_table_privilege('authenticated','hf_private.profiles','UPDATE') as profile_write_denied,
 not has_table_privilege('authenticated','hf_private.runs','UPDATE') as run_write_denied,
 not has_table_privilege('anon','hf_private.lifetime_entries','INSERT') as ledger_insert_denied;
select has_function_privilege('authenticated','public.hf_start_run_v6(integer)','EXECUTE') as verified_start_available,
 not has_function_privilege('anon','public.hf_start_run_v6(integer)','EXECUTE') as anonymous_start_denied,
 has_function_privilege('anon','public.hf_lifetime_top100()','EXECUTE') as public_rankings_available;
select not exists(select 1 from hf_private.wallet_profiles group by wallet having count(*)>1) as wallet_links_unique;
select not exists(select 1 from hf_private.runs where rules_version=6 and lifetime_credited<>score) as new_run_scores_checkpointed;
select coalesce(jsonb_array_length(public.hf_lifetime_top100()->'rows'),0)<=100 as leaderboard_capped;
commit;
