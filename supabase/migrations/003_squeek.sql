-- Apply after 001 and 002 to the EXISTING Supabase project. No player row,
-- balance, purchase, historical run, statistic or badge is deleted.
begin;

alter table hf_private.catalogue add column active boolean not null default true;
update hf_private.catalogue set active=false;
insert into hf_private.catalogue(id,price,slot,active) values
 ('costume-deadpool',50,'costume',true),('costume-batman',50,'costume',true),
 ('costume-spiderman',50,'costume',true),('costume-superman',50,'costume',true),
 ('costume-samurai',50,'costume',true),('damage-10',50,'upgrade',true),
 ('damage-20',50,'upgrade',true),('damage-25',150,'upgrade',true);

create table hf_private.wallet_profiles (
 auth_user uuid primary key references auth.users(id),
 profile_id uuid not null unique references hf_private.profiles(user_id),
 wallet text not null unique check(wallet ~ '^0x[0-9a-f]{40}$')
);
create table hf_private.legacy_tickets (
 ticket uuid primary key default gen_random_uuid(),
 profile_id uuid not null references hf_private.profiles(user_id),
 expires_at timestamptz not null default clock_timestamp()+interval '30 minutes',
 claimed_by uuid references auth.users(id)
);
create table hf_private.settings (
 singleton boolean primary key default true check(singleton),
 leaderboard_timezone text not null default 'UTC'
);
insert into hf_private.settings(singleton) values(true);
create function hf_private.validate_timezone() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.leaderboard_timezone) then raise exception 'Choose a valid IANA timezone.'; end if;
 return new;
end; $$;
create trigger hf_valid_timezone before insert or update on hf_private.settings for each row execute function hf_private.validate_timezone();
create table hf_private.daily_scores (
 profile_id uuid not null references hf_private.profiles(user_id),
 score_day date not null,
 timezone text not null,
 score integer not null check(score>0),
 reached_at timestamptz not null default clock_timestamp(),
 primary key(profile_id,score_day,timezone)
);
create index hf_daily_rank on hf_private.daily_scores(timezone,score_day,score desc,reached_at,profile_id);
alter table hf_private.runs add column claimed integer[] not null default '{}',
 add column foraged text[] not null default '{}', add column score integer not null default 0,
 add column daily_points integer not null default 0, add column score_day date,
 add column score_timezone text;
alter table hf_private.wallet_profiles enable row level security;
alter table hf_private.legacy_tickets enable row level security;
alter table hf_private.settings enable row level security;
alter table hf_private.daily_scores enable row level security;
revoke all on all tables in schema hf_private from public,anon,authenticated;

-- auth.identities is written by Supabase Auth AFTER signature verification.
-- Client-editable user_metadata and claimed wallet parameters are never trusted.
create function hf_private.wallet_address() returns text language sql stable security definer set search_path='' as $$
 select lower(identity_data->>'address') from auth.identities
 where user_id=auth.uid() and provider='web3' and identity_data->>'chain'='ethereum'
 and lower(identity_data->>'address') ~ '^0x[0-9a-f]{40}$' limit 1;
$$;
create function hf_private.player_id() returns uuid language plpgsql stable security definer set search_path='' as $$
declare p uuid; a text:=hf_private.wallet_address();
begin
 if a is null then raise exception 'Sign in with your wallet to save progress.'; end if;
 select profile_id into p from hf_private.wallet_profiles where auth_user=auth.uid() and wallet=a;
 if p is null then raise exception 'Open your wallet profile first.'; end if;
 return p;
end; $$;
create or replace function hf_private.profile_json(p_user uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('name',p.name,'sqk',p.sqk,'total_score',p.total_score,'highest_map',p.highest_map,
 'cosmetics',p.cosmetics,'wallet',(select wallet from hf_private.wallet_profiles where profile_id=p_user),
 'purchases',coalesce((select jsonb_agg(item order by item) from hf_private.purchases where user_id=p_user),'[]'::jsonb),
 'badges',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'tier',b.tier,'source',b.source) order by b.earned_at,b.id)
 from hf_private.badges b where b.user_id=p_user and b.source in ('skill','contribution') and b.exchanged_at is null),'[]'::jsonb))
 from hf_private.profiles p where p.user_id=p_user;
$$;
create function public.hf_prepare_legacy() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); t uuid; linked text;
begin
 if u is null then raise exception 'An existing browser session is required.'; end if;
 if hf_private.wallet_address() is not null then return jsonb_build_object('ticket',null); end if;
 perform 1 from hf_private.profiles where user_id=u for update;
 if not found then return jsonb_build_object('ticket',null); end if;
 select wallet into linked from hf_private.wallet_profiles where profile_id=u;
 if found then return jsonb_build_object('ticket',null,'wallet',linked); end if;
 insert into hf_private.legacy_tickets(profile_id) values(u) returning ticket into t;
 return jsonb_build_object('ticket',t);
end; $$;
create function public.hf_wallet_profile(p_legacy uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); a text:=hf_private.wallet_address(); p uuid; t hf_private.legacy_tickets;
begin
 if u is null or a is null then raise exception 'Sign in with your wallet to save progress.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(a,0));
 select profile_id into p from hf_private.wallet_profiles where auth_user=u and wallet=a;
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
create or replace function public.hf_profile(p_name text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=hf_private.player_id();
begin
 if p_name is not null then
   if char_length(trim(p_name)) not between 2 and 20 or trim(p_name) !~ '^[[:alnum:] _-]+$' then raise exception 'Use 2–20 letters, numbers, spaces, underscores or hyphens.'; end if;
   update hf_private.profiles set name=trim(p_name),updated_at=clock_timestamp() where user_id=u;
 end if;
 return hf_private.profile_json(u);
end; $$;
create or replace function public.hf_purchase(p_item text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=hf_private.player_id(); p hf_private.profiles; c hf_private.catalogue;
begin
 select * into p from hf_private.profiles where user_id=u for update;
 select * into c from hf_private.catalogue where id=p_item and active;
 if not found then raise exception 'Choose a current marketplace item.'; end if;
 if exists(select 1 from hf_private.purchases where user_id=u and item=p_item) then return hf_private.profile_json(u); end if;
 if p.sqk<c.price then raise exception 'Not enough SQK. Collect more coins before purchasing.'; end if;
 update hf_private.profiles set sqk=sqk-c.price where user_id=u;
 insert into hf_private.purchases(user_id,item,paid) values(u,c.id,c.price);
 if c.slot='upgrade' then update hf_private.runs set skills=array_append(skills,c.id) where user_id=u and status='active' and not c.id=any(skills); end if;
 return hf_private.profile_json(u);
end; $$;
create or replace function public.hf_equip(p_slot text,p_item text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=hf_private.player_id();
begin
 if p_slot is distinct from 'costume' then raise exception 'Choose the costume slot.'; end if;
 perform 1 from hf_private.profiles where user_id=u for update;
 if p_item is not null and not exists(select 1 from hf_private.purchases p join hf_private.catalogue c on c.id=p.item where p.user_id=u and p.item=p_item and c.slot='costume' and c.active) then raise exception 'Buy this costume before equipping it.'; end if;
 update hf_private.profiles set cosmetics=jsonb_set(cosmetics,array['costume'],coalesce(to_jsonb(p_item),'null'::jsonb)) where user_id=u;
 return hf_private.profile_json(u);
end; $$;
create function public.hf_start_run_v4(p_map integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=hf_private.player_id(); p hf_private.profiles; r hf_private.runs;
 drops text[]:='{}'; health double precision[]:='{}'; specs jsonb:='[]'; skills text[];
 i integer; roll double precision; kind text; size text; hp double precision;
begin
 select * into p from hf_private.profiles where user_id=u for update;
 if p_map is null or p_map<1 or p_map>p.highest_map then raise exception 'Choose an unlocked map.'; end if;
 update hf_private.runs set status='abandoned' where user_id=u and status='active';
 for i in 1..31 loop
   roll:=random(); -- Exactly ONE mutually exclusive reward selection per enemy.
   drops:=array_append(drops,case when roll<0.1 then 'big' when roll<0.5 then 'small' when roll<0.7 then 'coin' when roll<0.8 then 'gun' when roll<0.9 then 'sword' else 'bomb' end);
   kind:=(array['beetle','ant','larva','ember'])[1+floor(random()*4)::integer];
   size:=case when random()<0.5 then 'small' else 'large' end;
   hp:=ceil((case when i=31 then 300 when size='small' then 50 else 100 end)*power(1.2::double precision,p_map-1));
   health:=array_append(health,hp);
   if i<31 then specs:=specs||jsonb_build_array(jsonb_build_object('type',kind,'size',size,'hp',hp)); end if;
 end loop;
 select coalesce(array_agg(item),'{}'::text[]) into skills from hf_private.purchases where user_id=u and item in ('charged','piercing','ricochet','damage-10','damage-20','damage-25');
 insert into hf_private.runs(user_id,map,hp,loot,skills,monsters,rules_version) values(u,p_map,health,drops,skills,specs,4) returning * into r;
 return jsonb_build_object('id',r.id,'loot',r.loot,'monsters',r.monsters,'rulesVersion',4,'profile',hf_private.profile_json(u));
end; $$;

-- Old client entry points must not mint rewards through the removed features.
create or replace function public.hf_start_run_v3(p_map integer) returns jsonb language plpgsql security definer set search_path='' as $$
begin raise exception 'Reload squeek.hamster for the current game rules. Existing balances are kept.'; end; $$;
revoke all on function public.hf_dice(text,uuid),public.hf_exchange_badge(text) from public,anon,authenticated;
drop function public.hf_dice(text,uuid);
drop function public.hf_exchange_badge(text);

create function hf_private.forage_value(source text) returns integer language sql immutable set search_path='' as $$
 select case when source ~ '^trail-([0-9]|[12][0-9]|3[0-3])$' then 1
 when source='chest' then 6 when source in ('basket','log') then 2
 when source in ('lantern-93','lantern-174') then 10
 when source ~ '^bush-(54|176)-[0-2]$' then 1 else 0 end;
$$;

create or replace function public.hf_progress(p_run uuid, p_events jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := hf_private.player_id(); r hf_private.runs; a hf_private.attacks;
  ev jsonb; k text; f integer; s integer; target integer; aid integer; weapon text;
  damage double precision; cooldown integer; hit_limit integer; last_burn integer; count_burn integer; points integer; source text; day date; zone text;
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
      select leaderboard_timezone into zone from hf_private.settings where singleton;
      day:=(clock_timestamp() at time zone zone)::date;
      if r.score_day is distinct from day or r.score_timezone is distinct from zone then r.daily_points:=0; end if;
      r.score_day:=day; r.score_timezone:=zone; r.daily_points:=r.daily_points+points; r.score:=r.score+points;
      update hf_private.profiles set total_score=total_score+points,updated_at=clock_timestamp() where user_id=u;
      insert into hf_private.daily_scores(profile_id,score_day,timezone,score) values(u,day,zone,r.daily_points)
      on conflict(profile_id,score_day,timezone) do update set score=excluded.score,reached_at=clock_timestamp()
      where excluded.score>hf_private.daily_scores.score;
    end if;
    r.seq := s; r.frame := f;
  end loop;
  update hf_private.runs set status=r.status,seq=r.seq,frame=r.frame,hp=r.hp,coins=r.coins,weapons=r.weapons,
    claimed=r.claimed,foraged=r.foraged,score=r.score,daily_points=r.daily_points,score_day=r.score_day,score_timezone=r.score_timezone,ammo_gun=r.ammo_gun,ammo_grenade=r.ammo_grenade,sword=r.sword,last_attack=r.last_attack where id=r.id;
  return jsonb_build_object('ack',r.seq,'profile',hf_private.profile_json(u));
end; $$;


create function public.hf_daily_top100() returns jsonb language sql stable security definer set search_path='' as $$
 with config as (select leaderboard_timezone as zone from hf_private.settings where singleton),
 period as (select zone,(statement_timestamp() at time zone zone)::date as day from config),
 ranked as (select p.name,d.score,p.highest_map,d.reached_at,d.profile_id from hf_private.daily_scores d
 join hf_private.profiles p on p.user_id=d.profile_id join hf_private.wallet_profiles w on w.profile_id=p.user_id
 join period c on d.score_day=c.day and d.timezone=c.zone
 order by d.score desc,d.reached_at,d.profile_id limit 100)
 select jsonb_build_object('timezone',c.zone,'day',c.day,'resetsAt',((c.day+1)::timestamp at time zone c.zone),
 'rows',coalesce((select jsonb_agg(jsonb_build_object('name',name,'score',score,'highest_map',highest_map) order by score desc,reached_at,profile_id) from ranked),'[]'::jsonb)) from period c;
$$;
-- Compatibility readers now see only today's verified wallet ranking.
create or replace function public.hf_top100() returns table(name text,total_score bigint,highest_map integer)
language sql stable security definer set search_path='' as $$
 select x->>'name',(x->>'score')::bigint,(x->>'highest_map')::integer from jsonb_array_elements(public.hf_daily_top100()->'rows') x;
$$;
revoke all on all functions in schema hf_private from public,anon,authenticated;
revoke all on function public.hf_prepare_legacy(),public.hf_wallet_profile(uuid),public.hf_start_run_v4(integer),public.hf_daily_top100() from public,anon,authenticated;
grant execute on function public.hf_prepare_legacy(),public.hf_wallet_profile(uuid),public.hf_start_run_v4(integer) to authenticated;
grant execute on function public.hf_daily_top100() to anon,authenticated;
commit;
