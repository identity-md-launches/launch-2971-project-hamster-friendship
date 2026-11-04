-- Hamster Friendship upgrade. Apply once in the existing Supabase project.
-- Auth is Supabase anonymous Auth, NOT an unverified wallet address.
-- No table is directly exposed. All balances, prices, damage and scores are
-- calculated here; the browser submits ordered gameplay events, never totals.
begin;

create schema if not exists hf_private;
revoke all on schema hf_private from public, anon, authenticated;

create table hf_private.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Guest' check (char_length(name) between 2 and 20 and name ~ '^[[:alnum:] _-]+$'),
  sqk bigint not null default 0 check (sqk >= 0),
  total_score bigint not null default 0 check (total_score >= 0),
  highest_map integer not null default 1 check (highest_map > 0),
  cosmetics jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create index hf_leaderboard_order on hf_private.profiles(total_score desc, updated_at, user_id);
create table hf_private.catalogue (
  id text primary key, price integer not null check (price > 0), slot text not null
);
insert into hf_private.catalogue(id, price, slot) values
  ('vest',100,'vest'), ('shirt-coral',20,'shirt'), ('shirt-blue',20,'shirt'), ('shirt-purple',20,'shirt'),
  ('shell-teal',100,'shell'), ('shell-rose',100,'shell'), ('shell-gold',100,'shell'),
  ('charged',150,'skill'), ('piercing',250,'skill'), ('ricochet',300,'skill');
create table hf_private.purchases (
  user_id uuid not null references hf_private.profiles(user_id) on delete cascade,
  item text not null references hf_private.catalogue(id),
  paid integer not null check (paid > 0),
  purchased_at timestamptz not null default now(),
  primary key(user_id, item)
);
create table hf_private.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references hf_private.profiles(user_id) on delete cascade,
  map integer not null check (map > 0),
  started_at timestamptz not null default clock_timestamp(),
  status text not null default 'active' check (status in ('active','dead','complete','abandoned')),
  seq integer not null default 0,
  frame integer not null default 0,
  hp double precision[] not null,
  loot text[] not null,
  skills text[] not null default '{}',
  coins integer[] not null default '{}',
  weapons integer[] not null default '{}',
  ammo_gun integer not null default 0,
  ammo_grenade integer not null default 0,
  sword boolean not null default false,
  last_attack jsonb not null default '{}'
);
create index hf_runs_owner on hf_private.runs(user_id, started_at desc);
create unique index hf_one_active_map on hf_private.runs(user_id) where status = 'active';
create table hf_private.attacks (
  run uuid not null references hf_private.runs(id) on delete cascade,
  id integer not null,
  weapon text not null,
  frame integer not null,
  targets integer[] not null default '{}',
  burn_frames jsonb not null default '{}',
  burn_counts jsonb not null default '{}',
  primary key(run, id)
);
alter table hf_private.profiles enable row level security;
alter table hf_private.catalogue enable row level security;
alter table hf_private.purchases enable row level security;
alter table hf_private.runs enable row level security;
alter table hf_private.attacks enable row level security;
revoke all on all tables in schema hf_private from public, anon, authenticated;

create function hf_private.profile_json(p_user uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('name',p.name,'sqk',p.sqk,'total_score',p.total_score,
    'highest_map',p.highest_map,'cosmetics',p.cosmetics,
    'purchases',coalesce((select jsonb_agg(item order by item) from hf_private.purchases where user_id=p_user),'[]'::jsonb))
  from hf_private.profiles p where p.user_id=p_user;
$$;
revoke all on function hf_private.profile_json(uuid) from public, anon, authenticated;

create function public.hf_profile(p_name text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Sign in to a cloud profile first.'; end if;
  if p_name is not null and (char_length(trim(p_name)) not between 2 and 20 or trim(p_name) !~ '^[[:alnum:] _-]+$') then
    raise exception 'Use 2–20 letters, numbers, spaces, underscores or hyphens.';
  end if;
  insert into hf_private.profiles(user_id) values(u) on conflict do nothing;
  if p_name is not null then update hf_private.profiles set name=trim(p_name), updated_at=clock_timestamp() where user_id=u; end if;
  return hf_private.profile_json(u);
end; $$;

create function public.hf_purchase(p_item text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); p hf_private.profiles; c hf_private.catalogue;
begin
  if u is null then raise exception 'Sign in to a cloud profile first.'; end if;
  select * into p from hf_private.profiles where user_id=u for update;
  if not found then raise exception 'Create a profile first.'; end if;
  select * into c from hf_private.catalogue where id=p_item;
  if not found then raise exception 'Choose an item from the marketplace.'; end if;
  if exists(select 1 from hf_private.purchases where user_id=u and item=p_item) then return hf_private.profile_json(u); end if;
  if p.sqk < c.price then raise exception 'Not enough SQK. Collect more coins before purchasing.'; end if;
  update hf_private.profiles set sqk=sqk-c.price where user_id=u;
  insert into hf_private.purchases(user_id,item,paid) values(u,c.id,c.price);
  return hf_private.profile_json(u);
end; $$;

create function public.hf_equip(p_slot text, p_item text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Sign in to a cloud profile first.'; end if;
  if p_slot not in ('shirt','vest','shell') or p_slot is null then raise exception 'Choose a cosmetic slot.'; end if;
  perform 1 from hf_private.profiles where user_id=u for update;
  if not found then raise exception 'Create a profile first.'; end if;
  if p_item is not null and not exists (
    select 1 from hf_private.purchases p join hf_private.catalogue c on c.id=p.item
    where p.user_id=u and p.item=p_item and c.slot=p_slot
  ) then raise exception 'Buy this cosmetic before equipping it.'; end if;
  update hf_private.profiles set cosmetics=jsonb_set(cosmetics,array[p_slot],coalesce(to_jsonb(p_item),'null'::jsonb)) where user_id=u;
  return hf_private.profile_json(u);
end; $$;

create function public.hf_start_run(p_map integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); p hf_private.profiles; r hf_private.runs;
  drops text[] := '{}'; health double precision[] := '{}'; skills text[]; roll integer; i integer;
begin
  if u is null then raise exception 'Sign in to a cloud profile first.'; end if;
  select * into p from hf_private.profiles where user_id=u for update;
  if not found then raise exception 'Create a profile first.'; end if;
  if p_map is null or p_map < 1 or p_map > p.highest_map then raise exception 'Choose an unlocked map.'; end if;
  -- Serialize starts per profile and invalidate previous browser tabs/runs.
  update hf_private.runs set status='abandoned' where user_id=u and status='active';
  for i in 1..31 loop
    roll := floor(random()*10000)::integer;
    drops := array_append(drops,case when roll < 900 then 'gun' when roll < 1800 then 'sword' when roll < 3000 then 'grenade' else null end);
    health := array_append(health,ceil((case when i=31 then 500 else 100 end)*power(1.2::double precision,p_map-1)));
  end loop;
  select coalesce(array_agg(item),'{}'::text[]) into skills from hf_private.purchases where user_id=u and item in ('charged','piercing','ricochet');
  insert into hf_private.runs(user_id,map,hp,loot,skills) values(u,p_map,health,drops,skills) returning * into r;
  return jsonb_build_object('id',r.id,'loot',r.loot,'profile',hf_private.profile_json(u));
end; $$;

create function public.hf_progress(p_run uuid, p_events jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); r hf_private.runs; a hf_private.attacks;
  ev jsonb; k text; f integer; s integer; target integer; aid integer; weapon text;
  damage double precision; cooldown integer; hit_limit integer; last_burn integer; count_burn integer;
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
    if r.status <> 'active' then raise exception 'This map has already ended. Start it again.'; end if;
    f := (ev->>'frame')::integer; k := ev->>'kind';
    if f is null or f < r.frame or f > floor(extract(epoch from (clock_timestamp()-r.started_at))*60)+120 then raise exception 'Invalid game timing.'; end if;
    if f > 10368000 then raise exception 'This run has expired. Start the map again.'; end if; -- 48 active hours
    if k = 'attack' then
      aid := (ev->>'attack')::integer; weapon := ev->>'weapon';
      if aid is null or aid < 1 or weapon is null or weapon not in ('shell','gun','sword','grenade','stomp') then raise exception 'Invalid attack.'; end if;
      cooldown := case weapon when 'gun' then 10 when 'sword' then 30 when 'grenade' then 60 when 'stomp' then 18 else 16 end;
      if f-coalesce((r.last_attack->>weapon)::integer,-10000) < cooldown then raise exception 'Attacks are too fast.'; end if;
      if weapon='gun' then
        if r.ammo_gun <= 0 then raise exception 'Collect a gun and ammunition first.'; end if;
        r.ammo_gun := r.ammo_gun-1;
      elsif weapon='grenade' then
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
      if f<a.frame or f>a.frame+(case when a.weapon='grenade' then 600 when a.weapon in ('stomp','sword') then 1 else 100 end) then raise exception 'This attack has expired.'; end if;
      if a.weapon='grenade' then
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
      damage := case a.weapon when 'gun' then 20 when 'sword' then 50 when 'stomp' then 50 when 'grenade' then 5 else case when 'charged'=any(r.skills) then 37.5 else 25 end end;
      r.hp[target+1] := greatest(0,r.hp[target+1]-damage);
      update hf_private.attacks set targets=a.targets,burn_frames=a.burn_frames,burn_counts=a.burn_counts where run=a.run and id=a.id;
      if r.hp[target+1]=0 then
        update hf_private.profiles set total_score=total_score+(case when target=30 then 500 else 100 end),updated_at=clock_timestamp() where user_id=u;
      end if;
    elsif k in ('defeat','collect','weapon') then
      target := (ev->>'target')::integer;
      if target is null or target not between 0 and 30 or r.hp[target+1]>0 then raise exception 'Defeat this enemy before claiming its drop.'; end if;
      if k='collect' then
        if target=any(r.coins) then raise exception 'This SQK coin was already collected.'; end if;
        r.coins := array_append(r.coins,target);
        update hf_private.profiles set sqk=sqk+1 where user_id=u;
      elsif k='weapon' then
        if target=any(r.weapons) or r.loot[target+1] is null then raise exception 'No unclaimed weapon dropped here.'; end if;
        r.weapons := array_append(r.weapons,target);
        if r.loot[target+1]='gun' then r.ammo_gun := r.ammo_gun+30;
        elsif r.loot[target+1]='grenade' then r.ammo_grenade := r.ammo_grenade+3;
        else r.sword := true; end if;
      end if;
    elsif k='finish' then
      if exists(select 1 from unnest(r.hp) h where h>0) or f<3600 then raise exception 'Defeat all 30 enemies and the boss to clear this map.'; end if;
      r.status := 'complete';
      update hf_private.profiles set highest_map=greatest(highest_map,r.map+1),total_score=total_score+1000,updated_at=clock_timestamp() where user_id=u;
    elsif k='death' then r.status := 'dead';
    else raise exception 'Unknown game event.';
    end if;
    r.seq := s; r.frame := f;
  end loop;
  update hf_private.runs set status=r.status,seq=r.seq,frame=r.frame,hp=r.hp,coins=r.coins,weapons=r.weapons,
    ammo_gun=r.ammo_gun,ammo_grenade=r.ammo_grenade,sword=r.sword,last_attack=r.last_attack where id=r.id;
  return jsonb_build_object('ack',r.seq,'profile',hf_private.profile_json(u));
end; $$;

create function public.hf_top100() returns table(name text,total_score bigint,highest_map integer)
language sql stable security definer set search_path = '' as $$
  select p.name,p.total_score,p.highest_map from hf_private.profiles p where p.total_score>0
  order by p.total_score desc,p.updated_at,p.user_id limit 100;
$$;

revoke all on function public.hf_profile(text), public.hf_purchase(text), public.hf_equip(text,text),
  public.hf_start_run(integer), public.hf_progress(uuid,jsonb), public.hf_top100() from public, anon, authenticated;
grant execute on function public.hf_profile(text), public.hf_purchase(text), public.hf_equip(text,text),
  public.hf_start_run(integer), public.hf_progress(uuid,jsonb) to authenticated;
grant execute on function public.hf_top100() to anon, authenticated;
commit;
