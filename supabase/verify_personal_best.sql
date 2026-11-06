-- Read-only, owner SQL Editor verification AFTER 011. Every boolean is true.
begin read only;
select public.hf_service_status()->>'scoreMode'='personal-best'
 and public.hf_service_status()->>'migration'='11' as personal_best_service;
select exists(select 1 from pg_trigger where tgname='hf_retain_lifetime' and tgenabled='O') as retention_enabled;
select not exists(
 select 1 from hf_private.profiles p where p.total_score<>greatest(
   coalesce((select b.reconstructed_best from hf_private.personal_best_baselines b where b.profile_id=p.user_id),0),
   coalesce((select max(r.score) from hf_private.runs r where r.user_id=p.user_id and
     (r.rules_version=6 or r.status in ('dead','complete','abandoned'))),0))
) as personal_best_matches_run_history;
select not exists(select 1 from hf_private.personal_best_baselines where previous_total_score>history_points)
 as backfill_has_server_history;
select c.relrowsecurity and not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
 and not has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') as baseline_private
 from pg_class c where c.oid='hf_private.personal_best_baselines'::regclass;
select not exists(select 1 from hf_private.runs where rules_version=6 and score<>lifetime_credited) as paid_points_checkpointed;
select public.hf_lifetime_top100()->>'scoreMode'='personal-best' as board_uses_personal_best;
select not has_function_privilege('authenticated','public.hf_replay_commit(uuid,uuid,integer,jsonb,jsonb,text)','EXECUTE')
 and not has_function_privilege('anon','public.hf_replay_commit(uuid,uuid,integer,jsonb,jsonb,text)','EXECUTE') as commit_server_only;
select has_function_privilege('authenticated','public.hf_start_run_v6(integer,integer)','EXECUTE')
 and not has_function_privilege('anon','public.hf_start_run_v6(integer,integer)','EXECUTE') as current_engine_wallet_only;
select count(*) filter(where previous_total_score<>reconstructed_best) as corrected_profiles,
 count(*) as archived_profiles from hf_private.personal_best_baselines;
commit;
