-- Apply once AFTER 009. Existing scores, inventory, pending rewards and queues
-- are not deleted or recalculated. New claims require a trusted engine replay.
-- Deploy functions/hf-replay alongside this migration; see REPLAY.md.
begin;

alter table hf_private.runs
 add column replay_version integer not null default 0,
 add column replay_state jsonb,
 add column replay_hash text;

create or replace function hf_private.apply_replayed_progress(p_run uuid, p_events jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := hf_private.player_id(); r hf_private.runs; a hf_private.attacks;
  ev jsonb; k text; f integer; s integer; target integer; aid integer; weapon text;
  damage double precision; cooldown integer; hit_limit integer; last_burn integer; count_burn integer; points integer; source text;
  col integer; pending bigint;
begin
  if u is null then raise exception 'Sign in to a cloud profile first.'; end if;
  if p_events is null or jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events) not between 1 and 128 or octet_length(p_events::text)>65536 then
    raise exception 'Submit 1–128 ordered game events.';
  end if;
  -- Same lock order in every mutation: profile, then run, then attack.
  perform 1 from hf_private.profiles where user_id=u for update;
  if not found then raise exception 'Create a profile first.'; end if;
  select * into r from hf_private.runs where id=p_run and user_id=u for update;
  if not found then raise exception 'This map does not belong to your profile.'; end if;
  for ev in select value from jsonb_array_elements(p_events) loop
    s := (ev->>'seq')::integer;
    if s is null or s < 1 then raise exception 'Missing event sequence.'; end if;
    if s <= r.seq then continue; end if; -- acknowledgement retries cannot double-credit
    if s <> r.seq+1 then raise exception 'Game events must arrive in order.'; end if;
    if r.rules_version not in (4,6) then raise exception 'Restart the map for the current rules. Your stored balance is unchanged.'; end if;
    if r.status <> 'active' then raise exception 'This map has already ended. Start it again.'; end if;
    points:=0;
    f := (ev->>'frame')::integer; k := ev->>'kind';
    if f is null or f < r.frame or f > floor(extract(epoch from (clock_timestamp()-r.started_at))*60)+120 then raise exception 'Invalid game timing.'; end if;
    if f > 10368000 then raise exception 'This run has expired. Start the map again.'; end if; -- 48 active hours
    if k = 'attack' then
      aid := (ev->>'attack')::integer; weapon := ev->>'weapon';
      if aid is null or aid < 1 or weapon is null or weapon not in ('shell','gun','sword','bomb','stomp') then raise exception 'Invalid attack.'; end if;
      cooldown := case weapon when 'gun' then 10 when 'sword' then 30 when 'bomb' then 60 when 'stomp' then 18 else 16 end;
      if f-coalesce((r.last_attack->>weapon)::integer,-10000) < cooldown then raise exception 'Attacks are too fast.'; end if;
      if weapon='gun' then
        if r.ammo_gun <= 0 then raise exception 'Collect a gun and ammunition first.'; end if;
        r.ammo_gun := r.ammo_gun-1;
      elsif weapon='bomb' then
        if r.ammo_grenade <= 0 then raise exception 'Collect a grenade first.'; end if;
        r.ammo_grenade := r.ammo_grenade-1;
      elsif weapon='sword' and not r.sword then raise exception 'Collect a sword first.';
      end if;
      insert into hf_private.attacks(run,id,weapon,frame) values(r.id,aid,weapon,f);
      r.last_attack := jsonb_set(r.last_attack,array[weapon],to_jsonb(f));
    elsif k = 'hit' then
      target := (ev->>'target')::integer; aid := (ev->>'attack')::integer;
      if target is null or target not between 0 and 30 then raise exception 'Unknown enemy.'; end if;
      if r.hp[target+1] <= 0 then raise exception 'This enemy is already defeated.'; end if;
      if target=30 and f<(case when r.rules_version=6 then (array[60,90,120,150])[r.map]*60 else 3600 end) then raise exception 'The boss has not appeared yet.'; end if;
      select * into a from hf_private.attacks where run=r.id and id=aid for update;
      if not found then raise exception 'A hit needs a valid attack.'; end if;
      if f<a.frame or f>a.frame+(case when a.weapon='bomb' then 600 when a.weapon='sword' then 8 when a.weapon='stomp' then 1 else 100 end) then raise exception 'This attack has expired.'; end if;
      if a.weapon='bomb' then
        last_burn := coalesce((a.burn_frames->>target::text)::integer,a.frame);
        count_burn := coalesce((a.burn_counts->>target::text)::integer,0);
        if f-last_burn<60 or count_burn>=8 then raise exception 'Burn damage is limited to 5 per second for 8 seconds.'; end if;
        a.burn_frames := jsonb_set(a.burn_frames,array[target::text],to_jsonb(f));
        a.burn_counts := jsonb_set(a.burn_counts,array[target::text],to_jsonb(count_burn+1));
      else
        hit_limit := case when a.weapon='shell' and 'piercing'=any(r.skills) then 3 else 1 end;
        if target=any(a.targets) or cardinality(a.targets)>=hit_limit then raise exception 'This attack has already hit its allowed targets.'; end if;
        a.targets := array_append(a.targets,target);
      end if;
      damage := case a.weapon when 'gun' then 20 when 'sword' then 50 when 'stomp' then 50 when 'bomb' then 5 else case when 'charged'=any(r.skills) then 37.5 else 25 end end;
      if a.weapon in ('gun','sword','bomb') then
        damage:=damage*(100+(case when 'damage-10'=any(r.skills) then 10 else 0 end)+(case when 'damage-20'=any(r.skills) then 20 else 0 end)+(case when 'damage-25'=any(r.skills) then 25 else 0 end))/100;
      end if;
      r.hp[target+1] := greatest(0,r.hp[target+1]-damage);
      update hf_private.attacks set targets=a.targets,burn_frames=a.burn_frames,burn_counts=a.burn_counts where run=a.run and id=a.id;
    elsif k in ('defeat','pickup') then
      target := (ev->>'target')::integer;
      if target is null or target not between 0 and 30 or r.hp[target+1]>0 then raise exception 'Defeat this enemy before claiming its drop.'; end if;
      if k='pickup' then
        if target=any(r.claimed) then raise exception 'This drop was already collected.'; end if;
        r.claimed:=array_append(r.claimed,target);
        weapon:=r.loot[target+1];
        if weapon='coin' then update hf_private.profiles set sqk=sqk+1 where user_id=u;
        elsif weapon='gun' then r.ammo_gun:=100;
        elsif weapon='bomb' then r.ammo_grenade:=r.ammo_grenade+3;
        elsif weapon='sword' then r.sword:=true;
        elsif weapon in ('small','big') then points:=case when weapon='big' then 5 else 1 end;
        else raise exception 'Unknown drop.'; end if;
      end if;
    elsif k='forage' then
      source:=ev->>'source'; points:=hf_private.forage_value(source); col:=hf_private.forage_column(source);
      if points=0 or col=0 then raise exception 'Unknown forest collectible.'; end if;
      if source=any(r.foraged) then raise exception 'This forest collectible was already collected.'; end if;
      -- Server-owned map progression: Chang starts at column 6, and each
      -- collectible must be reachable from the previous one in the frames played.
      if f < hf_private.travel_frames(col-6) then raise exception 'This forest collectible cannot be reached yet.'; end if;
      if r.forage_col is not null and f-r.forage_frame < hf_private.travel_frames(col-r.forage_col) then
        raise exception 'These forest collectibles are too far apart for the time played.';
      end if;
      r.forage_col:=col; r.forage_frame:=f;
      r.foraged:=array_append(r.foraged,source);
    elsif k='finish' then
      if r.rules_version=4 then
        if exists(select 1 from unnest(r.hp) h where h>0) or f<3600 then raise exception 'Defeat all 30 enemies and the boss to clear this map.'; end if;
      elsif r.hp[31]>0 or f<(array[60,90,120,150])[r.map]*60 then
        raise exception 'Defeat this map boss after its exploration timer to continue.';
      end if;
      r.status := 'complete';
      update hf_private.profiles set highest_map=greatest(highest_map,r.map+1),updated_at=clock_timestamp() where user_id=u;
      perform hf_private.award_skill(u,r.map);
    elsif k='checkpoint' then null;
    elsif k='death' then r.status := 'dead';
    else raise exception 'Unknown game event.';
    end if;
    if points>0 then
      -- Validated earnings are durable even when the wallet budget is empty.
      -- Retried sequences skip validation but still reach settlement below.
      r.pending_score:=r.pending_score+points;
    end if;
    r.seq := s; r.frame := f;
  end loop;
  update hf_private.runs set status=r.status,seq=r.seq,frame=r.frame,hp=r.hp,coins=r.coins,weapons=r.weapons,
    claimed=r.claimed,foraged=r.foraged,forage_col=r.forage_col,forage_frame=r.forage_frame,score=r.score,pending_score=r.pending_score,
    ammo_gun=r.ammo_gun,ammo_grenade=r.ammo_grenade,sword=r.sword,last_attack=r.last_attack where id=r.id;
  perform hf_private.settle_rewards(u);
  select pending_score into pending from hf_private.runs where id=r.id;
  -- ack confirms validation, not full payment. Clients retain their durable
  -- batch until pendingPoints=0. Death/completion never erases unpaid points.
  return jsonb_build_object('ack',r.seq,'pendingPoints',pending,'withheld',pending,
    'profile',hf_private.profile_json(u));
end; $$;
-- Preserve the accepted run generator and its random server-owned loot/specs.
alter function public.hf_start_run_v6(integer) set schema hf_private;
create function public.hf_start_run_v6(p_map integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=hf_private.hf_start_run_v6(p_map);
 update hf_private.runs set replay_version=1 where id=(result->>'id')::uuid;
 return result||jsonb_build_object('validation','replay-1');
end; $$;

-- Browsers may retry ALREADY acknowledged batches to settle old pending
-- rewards. They cannot use the former RPC to mint any new entitlement.
create or replace function public.hf_progress(p_run uuid,p_events jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=hf_private.player_id(); r hf_private.runs;
begin
 perform 1 from hf_private.profiles where user_id=u for update;
 select * into r from hf_private.runs where id=p_run and user_id=u for update;
 if not found then raise exception 'This map does not belong to your profile.'; end if;
 if p_events is null or jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events) not between 1 and 128 or octet_length(p_events::text)>65536 then raise exception 'Submit ordered game events.'; end if;
 if exists(select 1 from jsonb_array_elements(p_events) ev where (ev->>'seq') is null or (ev->>'seq')::integer<1 or (ev->>'seq')::integer>r.seq) then
   raise exception 'Movement replay is required. Keep the pending save and update the game.';
 end if;
 perform hf_private.settle_rewards(u);
 select * into r from hf_private.runs where id=p_run;
 return jsonb_build_object('ack',r.seq,'pendingPoints',r.pending_score,'profile',hf_private.profile_json(u));
end; $$;

-- Read-only context is safe to expose to its verified owner. Only the Edge
-- function writes a checkpoint. A client-supplied snapshot is never accepted.
create function public.hf_replay_context(p_run uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=hf_private.player_id(); r hf_private.runs;
begin
 select * into r from hf_private.runs where id=p_run and user_id=u;
 if not found then raise exception 'This map does not belong to your profile.'; end if;
 if r.replay_version<>1 then raise exception 'This older run has no movement replay. Unsent events need owner review; saved rewards are safe.'; end if;
 return jsonb_build_object('authUser',auth.uid(),'seq',r.seq,'status',r.status,'state',r.replay_state,'engineHash',r.replay_hash,
   'maxFrame',least(10368000,floor(extract(epoch from (clock_timestamp()-r.started_at))*60)+120),
   'config',jsonb_build_object('map',r.map,'loot',r.loot,'monsters',r.monsters,'skills',r.skills,'profile',hf_private.profile_json(u)));
end; $$;

-- service_role-only compare-and-swap. The Edge function derives p_auth_user
-- using the caller's verified JWT/context, never from the submitted JSON.
-- Profile/run locks and one transaction couple replay state to exactly-once
-- rewards. Losing an HTTP reply cannot advance either of them twice.
create function public.hf_replay_commit(p_auth_user uuid,p_run uuid,p_previous integer,p_events jsonb,p_state jsonb,p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; r hf_private.runs; result jsonb;
begin
 if p_auth_user is null or p_previous is null then raise exception 'Missing verified replay identity or sequence.'; end if;
 perform set_config('request.jwt.claim.sub',p_auth_user::text,true);
 perform set_config('request.jwt.claims',jsonb_set(coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb),'{sub}',to_jsonb(p_auth_user::text))::text,true);
 u:=hf_private.player_id();
 perform 1 from hf_private.profiles where user_id=u for update;
 select * into r from hf_private.runs where id=p_run and user_id=u for update;
 if not found then raise exception 'This map does not belong to your profile.'; end if;
 if r.replay_version<>1 or r.seq<>p_previous then raise exception 'Save changed during replay. Retry the pending save.'; end if;
 if p_hash is null or length(p_hash)<>64 or (r.replay_hash is not null and r.replay_hash<>p_hash) then raise exception 'Replay engine version changed. Keep the pending save.'; end if;
 if p_state is null or jsonb_typeof(p_state)<>'object' or octet_length(p_state::text)>262144 then raise exception 'Invalid replay state.'; end if;
 if jsonb_array_length(p_events)=0 then
   perform hf_private.settle_rewards(u);
   select * into r from hf_private.runs where id=p_run;
   result:=jsonb_build_object('ack',r.seq,'pendingPoints',r.pending_score,'profile',hf_private.profile_json(u));
 else
   result:=hf_private.apply_replayed_progress(p_run,p_events);
   update hf_private.runs set replay_state=p_state,replay_hash=p_hash where id=p_run;
 end if;
 return result;
end; $$;

-- Old unsent claims lack controls and cannot be distinguished from forged
-- claims. Expose that fact so the existing recovery flow archives (not deletes)
-- them for owner review and allows a new verified run. Paid/pending data stays.
create or replace function public.hf_run_state(p_run uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=hf_private.player_id(); r hf_private.runs;
begin
 select * into r from hf_private.runs where id=p_run and user_id=u;
 if not found then raise exception 'This map does not belong to your profile.'; end if;
 return jsonb_build_object('status',r.status,'ack',r.seq,'pendingPoints',r.pending_score,
   'validation',case when r.replay_version=1 then 'replay-1' else 'legacy-unverifiable' end,
   'profile',hf_private.profile_json(u));
end; $$;

create or replace function public.hf_service_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion',7,'leaderboard','lifetime','rulesVersion',6,'migration',10,'validation','replay-1');
$$;
revoke all on all functions in schema hf_private from public,anon,authenticated;
revoke all on function public.hf_start_run_v6(integer),public.hf_progress(uuid,jsonb),public.hf_replay_context(uuid),
 public.hf_replay_commit(uuid,uuid,integer,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.hf_start_run_v6(integer),public.hf_progress(uuid,jsonb),public.hf_replay_context(uuid) to authenticated;
grant execute on function public.hf_replay_commit(uuid,uuid,integer,jsonb,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
