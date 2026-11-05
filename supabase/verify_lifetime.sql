-- Owner-only read-only post-migration verification; no credentials required here.
begin read only;
select public.hf_service_status(); -- schemaVersion=4, leaderboard=lifetime
select to_regprocedure('public.hf_daily_top100()') is null as daily_rpc_removed;
select count(*) = 2 as lifetime_triggers_present from pg_catalog.pg_trigger
where tgname in ('hf_settle_lifetime','hf_retain_lifetime') and tgenabled='O';
select not has_table_privilege('authenticated','hf_private.profiles','UPDATE')
 and not has_table_privilege('anon','hf_private.profiles','UPDATE') as direct_balance_writes_denied;
select has_function_privilege('anon','public.hf_lifetime_top100()','EXECUTE') as public_board_readable;
select public.hf_lifetime_top100(); -- actual verified rows, possibly empty
commit;
