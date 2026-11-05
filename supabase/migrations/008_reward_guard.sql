-- Apply after 007 in the ORIGINAL project; installed migrations stay intact.
-- Closes forged forest-collectible credit: a collectible is accepted only when
-- the authored forest makes it reachable in the frames played, and every
-- ranked point a wallet earns, across all of its concurrent runs, is limited
-- by a server-owned real-time budget. No historical row, score, balance,
-- inventory, identity or run is reset; earned Lifetime Score is untouched.
-- The browser protocol (rules v6, schema 7) is unchanged.
begin;

-- Server-owned reward budget per canonical wallet profile. Existing profiles
-- start with a full budget, so no queued legitimate progress is withheld.
alter table hf_private.profiles
  add column reward_tokens double precision not null default 150 check (reward_tokens between 0 and 150),
  add column reward_at timestamptz not null default clock_timestamp();
-- The last accepted collectible of each run, for path-length checks.
alter table hf_private.runs
  add column forage_col integer,
  add column forage_frame integer;

-- Authored map column of each forest collectible (src/game.js buildEntities:
-- the 34 trail spots, basket 8, bush 55, chest 58, lanterns 93/174, log 127,
-- bush 177). All four maps share this authored forest. 0 = unknown.
create function hf_private.forage_column(source text) returns integer language sql immutable set search_path='' as $$
 select case
  when source ~ '^trail-([0-9]|[12][0-9]|3[0-3])$' then
   (array[14,16,24,40,41,49,50,62,66,67,70,71,79,80,85,86,90,106,108,115,121,124,125,136,145,147,153,158,162,168,171,173,178,180])[substr(source,7)::integer+1]
  when source='basket' then 8 when source='chest' then 58 when source='log' then 127
  when source='lantern-93' then 93 when source='lantern-174' then 174
  when source ~ '^bush-54-[0-2]$' then 55 when source ~ '^bush-176-[0-2]$' then 177
  else 0 end;
$$;
-- Fewest frames needed to cover a distance in columns. Chang spawns at
-- column 6 and never exceeds 1.9 px/frame (1.7 on foot, 1.9 in the reef
-- current); 2 px/frame plus 64 px of reach/interaction slack is conservative,
-- so honest play is never rejected.
create function hf_private.travel_frames(p_columns integer) returns integer language sql immutable set search_path='' as $$
 select greatest(0,abs(p_columns)*16-64)/2;
$$;

-- A wallet may keep up to four independent device runs; starting a fifth
-- closes its oldest open v6 run. Points already checkpointed stay credited.
create or replace function public.hf_start_run_v6(p_map integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=hf_private.player_id(); p hf_private.profiles; r hf_private.runs;
 drops text[]:='{}'; health double precision[]:='{}'; specs jsonb:='[]'; skills text[];
 i integer; roll double precision; kind text; size text; hp double precision;
begin
 select * into p from hf_private.profiles where user_id=u for update;
 if p_map is null or p_map not between 1 and 4 or p_map>p.highest_map then raise exception 'Choose an unlocked map from 1 to 4.'; end if;
 update hf_private.runs set status='abandoned' where id in (
   select id from hf_private.runs where user_id=u and status='active' and rules_version=6
   order by started_at desc, id offset 3);
 for i in 1..31 loop
   roll:=random();
   drops:=array_append(drops,case when roll<0.1 then 'big' when roll<0.5 then 'small' when roll<0.7 then 'coin' when roll<0.8 then 'gun' when roll<0.9 then 'sword' else 'bomb' end);
   kind:=case p_map when 1 then (array['moth','wasp','gnat'])[1+floor(random()*3)::integer]
     when 2 then (array['frost','penguinling'])[1+floor(random()*2)::integer]
     when 3 then (array['drake','cinder'])[1+floor(random()*2)::integer]
     else (array['reef','ray'])[1+floor(random()*2)::integer] end;
   size:=case when random()<0.5 then 'small' else 'large' end;
   hp:=ceil((case when i=31 then 300 when size='small' then 50 else 100 end)*power(1.2::double precision,p_map-1));
   health:=array_append(health,hp);
   if i<31 then specs:=specs||jsonb_build_array(jsonb_build_object('type',kind,'size',size,'hp',hp)); end if;
 end loop;
 select coalesce(array_agg(item),'{}'::text[]) into skills from hf_private.purchases where user_id=u and item in ('charged','piercing','ricochet','damage-10','damage-20','damage-25');
 insert into hf_private.runs(user_id,map,hp,loot,skills,monsters,rules_version) values(u,p_map,health,drops,skills,specs,6) returning * into r;
 return jsonb_build_object('id',r.id,'loot',r.loot,'monsters',r.monsters,'rulesVersion',6,'profile',hf_private.profile_json(u));
end; $$;

-- Identical to 006 except: forage reachability/path checks, and every ranked
-- point (forage or drop, v4 or v6) is drawn from the wallet's reward budget.
-- Over-budget events are still acknowledged (queues never jam) but credit 0.
create or replace function public.hf_progress(p_run uuid, p_events jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := hf_private.player_id(); r hf_private.runs; a hf_private.attacks;
  ev jsonb; k text; f integer; s integer; target integer; aid integer; weapon text;
  damage double precision; cooldown integer; hit_limit integer; last_burn integer; count_burn integer; points integer; source text;
  col integer; tokens double precision; budget_at timestamptz; credit integer; withheld integer := 0;
begin
  if u is null then raise exception 'Sign in to a cloud profile first.'; end if;
  if p_events is null or jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events) not between 1 and 128 or octet_length(p_events::text)>65536 then
    raise exception 'Submit 1–128 ordered game events.';
  end if;
  -- Same lock order in every mutation: profile, then run, then attack.
  select reward_tokens, reward_at into tokens, budget_at from hf_private.profiles where user_id=u for update;
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
      -- One budget per wallet across all runs and devices: 150 points held,
      -- refilled at 1 point per real second (honest play earns well under it).
      tokens := least(150, tokens + greatest(0, extract(epoch from (clock_timestamp()-budget_at))));
      budget_at := clock_timestamp();
      credit := least(points, floor(tokens)::integer);
      tokens := tokens-credit; withheld := withheld+points-credit;
      r.score:=r.score+credit;
    end if;
    r.seq := s; r.frame := f;
  end loop;
  update hf_private.profiles set reward_tokens=tokens, reward_at=budget_at where user_id=u;
  update hf_private.runs set status=r.status,seq=r.seq,frame=r.frame,hp=r.hp,coins=r.coins,weapons=r.weapons,
    claimed=r.claimed,foraged=r.foraged,forage_col=r.forage_col,forage_frame=r.forage_frame,score=r.score,
    ammo_gun=r.ammo_gun,ammo_grenade=r.ammo_grenade,sword=r.sword,last_attack=r.last_attack where id=r.id;
  return jsonb_build_object('ack',r.seq,'withheld',withheld,'profile',hf_private.profile_json(u));
end; $$;

-- Browsers keep the schema-7 contract; "migration" proves this guard is installed.
create or replace function public.hf_service_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion',7,'leaderboard','lifetime','rulesVersion',6,'migration',8);
$$;
revoke all on all functions in schema hf_private from public,anon,authenticated;
revoke all on function public.hf_start_run_v6(integer),public.hf_progress(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.hf_start_run_v6(integer),public.hf_progress(uuid,jsonb) to authenticated;
-- RLS remains deny-by-default: browsers access only verified, validated RPCs.
notify pgrst, 'reload schema';
commit;
