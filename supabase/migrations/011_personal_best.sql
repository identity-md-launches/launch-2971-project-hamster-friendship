-- Apply once AFTER 010 in the original project. One transaction, no data deletes.
-- Keep a database backup and run verify_personal_best.sql after applying.
begin;
set local lock_timeout = '5s';
select pg_advisory_xact_lock(hashtextextended('squeek:schema-migrations',0));
do $$ begin
 if public.hf_service_status()->>'migration' is distinct from '10' then
   raise exception 'Personal best requires inspected migration 010. Do not replay installed migrations.';
 end if;
end; $$;

-- Match the existing profile -> run lock order. No settlement can race backfill.
lock table hf_private.profiles in share row exclusive mode;
lock table hf_private.runs in share row exclusive mode;

-- Rules 2/3 awarded 100 per defeated regular enemy, 500 per boss, 1000
-- on completion. Their authoritative HP/status survives, even though 003 added
-- runs.score with a zero default. Rules 4/6 already store their paid run score.
-- Ledger points may be only a post-004 delta, so NEVER add them to runs.score.
create temporary table hf_pb_history on commit drop as
 select r.id,r.user_id,greatest(r.score::bigint,coalesce(l.points,0),
   case when r.rules_version in (2,3) then
     coalesce((select sum(case when ordinality=31 then 500 else 100 end)
       from unnest(r.hp) with ordinality h(hp,ordinality) where hp<=0),0)
       + case when r.status='complete' then 1000 else 0 end
   else 0 end) as points
 from hf_private.runs r left join hf_private.lifetime_entries l on l.run_id=r.id;

-- Preserve the original aggregate for every existing profile, including zero
-- scores and unlinked legacy profiles. This private audit is never client input.
create table hf_private.personal_best_baselines (
 profile_id uuid primary key references hf_private.profiles(user_id),
 previous_total_score bigint not null,
 reconstructed_best bigint not null,
 history_points bigint not null,
 history_runs bigint not null,
 recorded_at timestamptz not null default clock_timestamp()
);
alter table hf_private.personal_best_baselines enable row level security;
revoke all on hf_private.personal_best_baselines from public,anon,authenticated;
insert into hf_private.personal_best_baselines(profile_id,previous_total_score,reconstructed_best,history_points,history_runs)
 select p.user_id,p.total_score,coalesce(max(h.points),0),coalesce(sum(h.points),0),count(h.id)
 from hf_private.profiles p left join hf_pb_history h on h.user_id=p.user_id group by p.user_id;

-- A cumulative total alone cannot reveal a personal best. Refuse the whole
-- migration if positive credited history is missing, rather than invent a best
-- or silently replace an unreconstructable score with zero. Restore trusted
-- run history from the owner's backup and rerun; no browser import is allowed.
do $$ begin
 if exists(select 1 from hf_private.personal_best_baselines where previous_total_score>history_points) then
   raise exception 'Incomplete run history: restore trusted server run records before converting cumulative scores. All changes rolled back.';
 end if;
end; $$;

-- The one-time, audited correction may be lower than the old cumulative value.
-- Re-enable retention before commit; any failure rolls back the entire change.
alter table hf_private.profiles disable trigger hf_retain_lifetime;
update hf_private.profiles p set total_score=b.reconstructed_best
 from hf_private.personal_best_baselines b where p.user_id=b.profile_id and p.total_score<>b.reconstructed_best;
alter table hf_private.profiles enable trigger hf_retain_lifetime;

create or replace function hf_private.settle_lifetime() returns trigger
language plpgsql set search_path='' as $$
declare delta bigint;
begin
 if new.rules_version=6 or new.status in ('dead','complete','abandoned') then
   delta:=greatest(0,new.score-new.lifetime_credited);
   if delta>0 then
     insert into hf_private.lifetime_entries(run_id,profile_id,points)
       values(new.id,new.user_id,delta) on conflict(run_id) do update
       set points=hf_private.lifetime_entries.points+excluded.points,recorded_at=clock_timestamp();
   end if;
   -- The existing reward budget, replay validation and profile lock remain
   -- authoritative. Growth still accumulates legitimate produce independently.
   update hf_private.profiles set total_score=greatest(total_score,new.score),
     produce_points=produce_points+case when new.rules_version=6 then delta else 0 end,
     updated_at=clock_timestamp()
   where user_id=new.user_id and (new.score>total_score or (new.rules_version=6 and delta>0));
   new.lifetime_credited:=greatest(new.lifetime_credited,new.score);
 end if;
 return new;
end; $$;

-- Both public readers continue using total_score, whose stored meaning is now
-- the maximum single-run score. Preserve deterministic ties and wallet privacy.
create or replace function public.hf_lifetime_top100() returns jsonb
language sql stable security definer set search_path='' as $$
 with ranked as (
   select p.user_id,p.name,p.total_score,p.highest_map from hf_private.profiles p
   join hf_private.wallet_profiles w on w.profile_id=p.user_id
   where p.total_score>0 order by p.total_score desc,p.user_id limit 100
 ) select jsonb_build_object('updatedAt',statement_timestamp(),'scoreMode','personal-best','rows',coalesce((
   select jsonb_agg(jsonb_build_object('name',name,'score',total_score,'highest_map',highest_map)
     order by total_score desc,user_id) from ranked),'[]'::jsonb));
$$;
create or replace function public.hf_top100()
returns table(name text,total_score bigint,highest_map integer)
language sql stable security definer set search_path='' as $$
 select p.name,p.total_score,p.highest_map from hf_private.profiles p
 join hf_private.wallet_profiles w on w.profile_id=p.user_id
 where p.total_score>0 order by p.total_score desc,p.user_id limit 100;
$$;

-- Existing runs keep the exact 010 engine and checkpoints. New runs use direct
-- touch's updated physics. Neither existing queues nor replay hashes are reset.
alter table hf_private.runs add column replay_engine integer not null default 1 check(replay_engine in (1,2));
-- The one-argument 010 RPC keeps engine 1 for already-open browser versions.
-- Current clients explicitly select engine 2 with the two-argument overload.
create function public.hf_start_run_v6(p_map integer,p_engine integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_engine is distinct from 2 then raise exception 'Choose the current game engine.'; end if;
 result:=public.hf_start_run_v6(p_map);
 update hf_private.runs set replay_version=1,replay_engine=2 where id=(result->>'id')::uuid;
 return result||jsonb_build_object('validation','replay-1','engineVersion',2);
end; $$;
revoke all on function public.hf_start_run_v6(integer,integer) from public,anon,authenticated;
grant execute on function public.hf_start_run_v6(integer,integer) to authenticated;
create or replace function public.hf_replay_context(p_run uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=hf_private.player_id(); r hf_private.runs;
begin
 select * into r from hf_private.runs where id=p_run and user_id=u;
 if not found then raise exception 'This map does not belong to your profile.'; end if;
 if r.replay_version<>1 then raise exception 'This older run has no movement replay. Unsent events need owner review; saved rewards are safe.'; end if;
 return jsonb_build_object('authUser',auth.uid(),'seq',r.seq,'status',r.status,'state',r.replay_state,'engineHash',r.replay_hash,
   'engineVersion',r.replay_engine,
   'maxFrame',least(10368000,floor(extract(epoch from (clock_timestamp()-r.started_at))*60)+120),
   'config',jsonb_build_object('map',r.map,'loot',r.loot,'monsters',r.monsters,'skills',r.skills,'profile',hf_private.profile_json(u)));
end; $$;
create or replace function public.hf_service_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion',7,'leaderboard','lifetime','scoreMode','personal-best',
   'rulesVersion',6,'migration',11,'validation','replay-1','engineVersion',2);
$$;
revoke all on all functions in schema hf_private from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
