-- Apply once after 008 in the ORIGINAL project. No table/data is dropped.
-- Keep 008's reachability, four-open-run limit and shared wallet budget.
-- Separate validated earnings from paid score so offline uploads never lose
-- points. Only paid points reach Lifetime Score, produce growth and Top 100.
begin;

alter table hf_private.runs add column pending_score bigint not null default 0 check(pending_score>=0);
create index hf_pending_rewards on hf_private.runs(user_id,started_at,id) where pending_score>0;

-- Recover rewards already consumed by 008 from its server-owned source/drop
-- records, including dead/complete/abandoned runs whose browser queue is gone.
-- DISTINCT prevents any historical duplicate source from adding an entitlement;
-- subtract paid run score, never reset a credited score or trust browser totals.
update hf_private.runs r set pending_score=greatest(0,
 coalesce((select sum(hf_private.forage_value(source)) from (select distinct unnest(r.foraged) as source) f),0)
 + coalesce((select sum(case r.loot[target+1] when 'small' then 1 when 'big' then 5 else 0 end)
   from (select distinct unnest(r.claimed) as target) c),0)-r.score)
where r.rules_version in (4,6);

-- The profile row serializes every budget use, across devices and runs. One
-- real-clock refill per call; settle older runs first. No client clock/amount.
create function hf_private.settle_rewards(p_user uuid) returns void
language plpgsql set search_path='' as $$
declare p hf_private.profiles; r record; tokens double precision; at_time timestamptz; credit bigint;
begin
 select * into p from hf_private.profiles where user_id=p_user for update;
 if not found then raise exception 'Create a profile first.'; end if;
 at_time:=clock_timestamp();
 tokens:=least(150,p.reward_tokens+greatest(0,extract(epoch from (at_time-p.reward_at))));
 for r in select id,pending_score from hf_private.runs where user_id=p_user and pending_score>0
   order by started_at,id for update loop
   credit:=least(r.pending_score,floor(tokens)::bigint);
   exit when credit<=0;
   tokens:=tokens-credit;
   update hf_private.runs set score=score+credit,pending_score=pending_score-credit where id=r.id;
 end loop;
 update hf_private.profiles set reward_tokens=tokens,reward_at=at_time where user_id=p_user;
end; $$;

-- v6 still checkpoints every paid delta. Historical v4 runs still wait for an
-- end state, but may receive additional paid deltas after they end. Upserting
-- those deltas preserves exactly-once lifetime entries for delayed settlement.
create or replace function hf_private.settle_lifetime() returns trigger
language plpgsql set search_path='' as $$
declare delta bigint;
begin
 if new.rules_version=6 or new.status in ('dead','complete','abandoned') then
   delta:=greatest(0,new.score-new.lifetime_credited);
   if new.rules_version=6 then
     if delta>0 then
       insert into hf_private.lifetime_entries(run_id,profile_id,points)
         values(new.id,new.user_id,delta)
         on conflict(run_id) do update set points=hf_private.lifetime_entries.points+excluded.points,
           recorded_at=clock_timestamp();
       update hf_private.profiles set total_score=total_score+delta,
         produce_points=produce_points+delta,updated_at=clock_timestamp() where user_id=new.user_id;
     end if;
   else
     insert into hf_private.lifetime_entries(run_id,profile_id,points)
       values(new.id,new.user_id,delta) on conflict(run_id) do update
         set points=hf_private.lifetime_entries.points+excluded.points,recorded_at=clock_timestamp();
     if delta>0 then
       update hf_private.profiles set total_score=total_score+delta,updated_at=clock_timestamp() where user_id=new.user_id;
     end if;
   end if;
   new.lifetime_credited:=new.score;
 end if;
 return new;
end; $$;

create or replace function hf_private.profile_json(p_user uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('name',p.name,'sqk',p.sqk,'total_score',p.total_score,'highest_map',p.highest_map,
 'pending_rewards',coalesce((select sum(pending_score) from hf_private.runs where user_id=p_user),0),
 'produce_points',p.produce_points,'cosmetics',p.cosmetics,'wallet',(select wallet from hf_private.wallet_profiles where profile_id=p_user),
 'purchases',coalesce((select jsonb_agg(item order by item) from hf_private.purchases where user_id=p_user),'[]'::jsonb),
 'badges',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'tier',b.tier,'source',b.source) order by b.earned_at,b.id)
 from hf_private.badges b where b.user_id=p_user and b.source in ('skill','contribution') and b.exchanged_at is null),'[]'::jsonb))
 from hf_private.profiles p where p.user_id=p_user;
$$;

create or replace function public.hf_progress(p_run uuid, p_events jsonb) returns jsonb
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
      if f<a.frame or f>a.frame+(case when a.weapon='bomb' then 600 when a.weapon in ('stomp','sword') then 1 else 100 end) then raise exception 'This attack has expired.'; end if;
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


-- A fresh device can settle all owned pending rewards with no browser queue.
-- Canonical identity is always derived from verified Web3 Auth, never input.
create function public.hf_settle_rewards() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=hf_private.player_id();
begin
 perform hf_private.settle_rewards(u);
 return jsonb_build_object('profile',hf_private.profile_json(u));
end; $$;

-- Reconcile lost replies without falsely treating validated points as paid.
create or replace function public.hf_run_state(p_run uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=hf_private.player_id(); r hf_private.runs;
begin
 perform 1 from hf_private.profiles where user_id=u for update;
 select * into r from hf_private.runs where id=p_run and user_id=u for update;
 if not found then raise exception 'This map does not belong to your profile.'; end if;
 return jsonb_build_object('status',r.status,'ack',r.seq,'pendingPoints',r.pending_score,
   'profile',hf_private.profile_json(u));
end; $$;

create or replace function public.hf_service_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion',7,'leaderboard','lifetime','rulesVersion',6,'migration',9);
$$;
revoke all on all functions in schema hf_private from public,anon,authenticated;
revoke all on function public.hf_progress(uuid,jsonb),public.hf_run_state(uuid),public.hf_settle_rewards() from public,anon,authenticated;
grant execute on function public.hf_progress(uuid,jsonb),public.hf_run_state(uuid),public.hf_settle_rewards() to authenticated;
-- Existing deny-by-default RLS and private-schema/table grants are unchanged.
notify pgrst,'reload schema';
commit;
