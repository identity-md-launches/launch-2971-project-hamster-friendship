-- Existing project only: apply after 003, once, inside the same Supabase project.
-- No historical total, balance, inventory, identity or daily-score row is removed.
begin;

-- 003 has already credited every persisted point, including its active runs.
-- Record this baseline so finishing an old run cannot award those points again.
alter table hf_private.runs add column lifetime_credited bigint not null default 0;
update hf_private.runs set lifetime_credited=score;
create table hf_private.lifetime_entries (
 run_id uuid primary key references hf_private.runs(id),
 profile_id uuid not null references hf_private.profiles(user_id),
 points bigint not null check(points>=0),
 recorded_at timestamptz not null default clock_timestamp()
);
alter table hf_private.lifetime_entries enable row level security;
revoke all on hf_private.lifetime_entries from public,anon,authenticated;

-- A completed session includes death and an explicitly abandoned/restarted map.
-- In-progress score stays on the run; terminal transitions settle its uncredited
-- points once, in the SAME transaction as the validated events. Existing start
-- RPCs already hold the profile lock before ending the previous run.
create function hf_private.settle_lifetime() returns trigger
language plpgsql set search_path='' as $$
declare delta bigint;
begin
 if old.status='active' and new.status in ('dead','complete','abandoned') then
   delta:=greatest(0,new.score-new.lifetime_credited);
   insert into hf_private.lifetime_entries(run_id,profile_id,points)
     values(new.id,new.user_id,delta) on conflict(run_id) do nothing;
   if found then
     update hf_private.profiles set total_score=total_score+delta,
       updated_at=clock_timestamp() where user_id=new.user_id;
   end if;
   new.lifetime_credited:=new.score;
 end if;
 return new;
end; $$;
create trigger hf_settle_lifetime before update of status on hf_private.runs
 for each row execute function hf_private.settle_lifetime();

-- Protect totals against accidental resets, including cascading Auth deletion.
-- An administrator can explicitly disable a trigger; keep independent backups.
create function hf_private.protect_lifetime() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Lifetime profiles must be retained.'; end if;
 if new.total_score<old.total_score then raise exception 'Lifetime scores cannot decrease.'; end if;
 return new;
end; $$;
create trigger hf_retain_lifetime before update of total_score or delete on hf_private.profiles
 for each row execute function hf_private.protect_lifetime();

-- Auth may assign a different UUID to the same verified address (for example
-- old address casing). The canonical wallet remains the unique profile key.
-- Never trust a client-supplied address or editable user_metadata.
create or replace function hf_private.player_id() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare p uuid; a text:=hf_private.wallet_address();
begin
 if a is null then raise exception 'Sign in with your wallet to save progress.'; end if;
 select profile_id into p from hf_private.wallet_profiles where wallet=a;
 if p is null then raise exception 'Open your wallet profile first.'; end if;
 return p;
end; $$;

create or replace function public.hf_wallet_profile(p_legacy uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); a text:=hf_private.wallet_address(); p uuid; t hf_private.legacy_tickets;
begin
 if u is null or a is null then raise exception 'Sign in with your wallet to save progress.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(a,0));
 select profile_id into p from hf_private.wallet_profiles where wallet=a;
 if found then return hf_private.profile_json(p); end if; -- Never overwrite an existing wallet.
 if exists(select 1 from hf_private.wallet_profiles where wallet=a or auth_user=u) then raise exception 'This wallet is already linked to another profile. Contact the project owner.'; end if;
 if p_legacy is not null then
   select * into t from hf_private.legacy_tickets where ticket=p_legacy for update;
   if not found or t.claimed_by is not null or t.expires_at<clock_timestamp() then raise exception 'The legacy profile link expired. Reopen the original browser and retry login.'; end if;
   p:=t.profile_id;
   perform 1 from hf_private.profiles where user_id=p for update;
   if exists(select 1 from hf_private.wallet_profiles where profile_id=p) then raise exception 'This existing profile is already linked. Sign in with its wallet.'; end if;
   update hf_private.legacy_tickets set claimed_by=u where ticket=p_legacy;
 else
   p:=u; insert into hf_private.profiles(user_id) values(p) on conflict do nothing;
 end if;
 insert into hf_private.wallet_profiles(auth_user,profile_id,wallet) values(u,p,a);
 return hf_private.profile_json(p);
end; $$;

create or replace function public.hf_progress(p_run uuid, p_events jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := hf_private.player_id(); r hf_private.runs; a hf_private.attacks;
  ev jsonb; k text; f integer; s integer; target integer; aid integer; weapon text;
  damage double precision; cooldown integer; hit_limit integer; last_burn integer; count_burn integer; points integer; source text;
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
    if r.rules_version<>4 then raise exception 'Restart the map for the current rules. Your stored balance is unchanged.'; end if;
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
      if target=30 and f<3600 then raise exception 'The boss has not appeared yet.'; end if;
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
      source:=ev->>'source'; points:=hf_private.forage_value(source);
      if points=0 then raise exception 'Unknown forest collectible.'; end if;
      if source=any(r.foraged) then raise exception 'This forest collectible was already collected.'; end if;
      r.foraged:=array_append(r.foraged,source);
    elsif k='finish' then
      if exists(select 1 from unnest(r.hp) h where h>0) or f<3600 then raise exception 'Defeat all 30 enemies and the boss to clear this map.'; end if;
      r.status := 'complete';
      update hf_private.profiles set highest_map=greatest(highest_map,r.map+1),updated_at=clock_timestamp() where user_id=u;
      perform hf_private.award_skill(u,r.map);
    elsif k='death' then r.status := 'dead';
    else raise exception 'Unknown game event.';
    end if;
    if points>0 then
      r.score:=r.score+points;
    end if;
    r.seq := s; r.frame := f;
  end loop;
  update hf_private.runs set status=r.status,seq=r.seq,frame=r.frame,hp=r.hp,coins=r.coins,weapons=r.weapons,
    claimed=r.claimed,foraged=r.foraged,score=r.score,ammo_gun=r.ammo_gun,ammo_grenade=r.ammo_grenade,sword=r.sword,last_attack=r.last_attack where id=r.id;
  return jsonb_build_object('ack',r.seq,'profile',hf_private.profile_json(u));
end; $$;


-- Daily data remains as a private historical archive. No runtime RPC writes or
-- filters by a day, timezone, reset deadline or expiry. There was no scheduled
-- reset in migrations 001–003. No unrelated cron job is changed by this migration.
create function public.hf_service_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion',4,'leaderboard','lifetime');
$$;
create function public.hf_lifetime_top100() returns jsonb
language sql stable security definer set search_path='' as $$
 with ranked as (
   select p.user_id,p.name,p.total_score,p.highest_map from hf_private.profiles p
   join hf_private.wallet_profiles w on w.profile_id=p.user_id
   where p.total_score>0 order by p.total_score desc,p.user_id limit 100
 ) select jsonb_build_object('updatedAt',statement_timestamp(),'rows',coalesce((
   select jsonb_agg(jsonb_build_object('name',name,'score',total_score,
     'highest_map',highest_map) order by total_score desc,user_id) from ranked
 ),'[]'::jsonb));
$$;
create or replace function public.hf_top100()
returns table(name text,total_score bigint,highest_map integer)
language sql stable security definer set search_path='' as $$
 select p.name,p.total_score,p.highest_map from hf_private.profiles p
 join hf_private.wallet_profiles w on w.profile_id=p.user_id
 where p.total_score>0 order by p.total_score desc,p.user_id limit 100;
$$;
drop function public.hf_daily_top100();
revoke all on all functions in schema hf_private from public,anon,authenticated;
revoke all on function public.hf_lifetime_top100(),public.hf_service_status() from public,anon,authenticated;
grant execute on function public.hf_lifetime_top100(),public.hf_service_status() to anon,authenticated;
notify pgrst, 'reload schema';
commit;
