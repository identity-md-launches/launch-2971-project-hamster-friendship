-- Additive seasonal/Dice upgrade. Apply AFTER 001 in the existing project.
-- No balances, purchases, profiles, run HP or authentication are reset.
begin;
alter table hf_private.profiles
  add column dice_rounds integer not null default 0,
  add column dice_correct integer not null default 0,
  add column dice_wins integer not null default 0,
  add column dice_draws integer not null default 0;
alter table hf_private.runs
  add column coin_drops boolean[] not null default array_fill(true,array[31]),
  add column monsters jsonb not null default '[]',
  add column rules_version integer not null default 2;
-- Legacy runs retain their HP, loot and guaranteed coins. New runs use v3.
create table hf_private.badges (
  user_id uuid not null references hf_private.profiles(user_id) on delete cascade,
  id text not null,
  source text not null check (source in ('dice','skill','contribution')),
  tier text not null check (tier in ('bronze','silver','gold')),
  earned_at timestamptz not null default clock_timestamp(),
  exchanged_at timestamptz,
  credited integer check (credited in (20,50,120)),
  primary key(user_id,id),
  check (source<>'dice' or (exchanged_at is null and credited is null))
);
create table hf_private.dice_receipts (
  user_id uuid not null references hf_private.profiles(user_id) on delete cascade,
  request uuid not null,
  prediction text not null check (prediction in ('HIGH','LOW')),
  a integer not null check (a between 1 and 6),
  b integer not null check (b between 1 and 6),
  outcome text not null check (outcome in ('HIGH','LOW','DRAW')),
  correct boolean not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(user_id,request)
);
alter table hf_private.badges enable row level security;
alter table hf_private.dice_receipts enable row level security;
revoke all on hf_private.badges,hf_private.dice_receipts from public,anon,authenticated;

create or replace function hf_private.profile_json(p_user uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('name',p.name,'sqk',p.sqk,'total_score',p.total_score,
    'highest_map',p.highest_map,'cosmetics',p.cosmetics,
    'purchases',coalesce((select jsonb_agg(item order by item) from hf_private.purchases where user_id=p_user),'[]'::jsonb),
    'dice',jsonb_build_object('rounds',p.dice_rounds,'correct',p.dice_correct,'wins',p.dice_wins,'draws',p.dice_draws),
    'badges',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'tier',b.tier,'source',b.source) order by b.earned_at,b.id) from hf_private.badges b where b.user_id=p_user and b.exchanged_at is null),'[]'::jsonb),
    'exchanged',coalesce((select jsonb_agg(b.id order by b.id) from hf_private.badges b where b.user_id=p_user and b.exchanged_at is not null),'[]'::jsonb))
  from hf_private.profiles p where p.user_id=p_user;
$$;

create function hf_private.award_skill(p_user uuid,p_map integer) returns void
language sql set search_path = '' as $$
  insert into hf_private.badges(user_id,id,source,tier)
  select p_user,'skill-'||t.tier,'skill',t.tier
  from (values ('bronze',1),('silver',3),('gold',5)) t(tier,maps)
  where p_map>=t.maps on conflict do nothing;
$$;
-- Retrospective earned skill badges use existing verified map progression.
insert into hf_private.badges(user_id,id,source,tier)
select p.user_id,'skill-'||t.tier,'skill',t.tier from hf_private.profiles p
cross join (values ('bronze',1),('silver',3),('gold',5)) t(tier,maps)
where p.highest_map-1>=t.maps on conflict do nothing;

-- Old open pages may finish their frozen run, but must reload before another.
-- Allowing new legacy runs would bypass the new 20% reward policy.
create or replace function public.hf_start_run(p_map integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to a cloud profile first.'; end if;
  raise exception 'Reload the website before starting another map to use the seasonal upgrade. Saved SQK, inventory and progression are kept.';
end; $$;

create function public.hf_start_run_v3(p_map integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); p hf_private.profiles; r hf_private.runs;
  drops text[] := '{}'; health double precision[] := '{}'; coins boolean[] := '{}';
  specs jsonb := '[]'; skills text[]; roll integer; i integer; kind text; size text; hp double precision;
begin
  if u is null then raise exception 'Sign in to a cloud profile first.'; end if;
  select * into p from hf_private.profiles where user_id=u for update;
  if not found then raise exception 'Create a profile first.'; end if;
  if p_map is null or p_map < 1 or p_map > p.highest_map then raise exception 'Choose an unlocked map.'; end if;
  update hf_private.runs set status='abandoned' where user_id=u and status='active';
  for i in 1..31 loop
    roll := floor(random()*10000)::integer;
    drops := array_append(drops,case when roll<900 then 'gun' when roll<1800 then 'sword' when roll<3000 then 'grenade' else null end);
    -- SQK is an independent 20% Bernoulli trial, unrelated to weapons or type.
    coins := array_append(coins,random()<0.2);
    kind := (array['beetle','ant','larva','ember'])[1+floor(random()*4)::integer];
    size := case when random()<0.5 then 'small' else 'large' end;
    hp := ceil((case when i=31 then 300 when size='small' then 50 else 100 end)*power(1.2::double precision,p_map-1));
    health := array_append(health,hp);
    if i<31 then specs := specs || jsonb_build_array(jsonb_build_object('type',kind,'size',size,'hp',hp,'damage',power(1.2::double precision,p_map-1))); end if;
  end loop;
  select coalesce(array_agg(item),'{}'::text[]) into skills from hf_private.purchases where user_id=u and item in ('charged','piercing','ricochet');
  insert into hf_private.runs(user_id,map,hp,loot,skills,coin_drops,monsters,rules_version) values(u,p_map,health,drops,skills,coins,specs,3) returning * into r;
  return jsonb_build_object('id',r.id,'loot',r.loot,'coinDrops',r.coin_drops,'monsters',r.monsters,'rulesVersion',3,'profile',hf_private.profile_json(u));
end; $$;

create or replace function public.hf_progress(p_run uuid, p_events jsonb) returns jsonb
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
        if not r.coin_drops[target+1] then raise exception 'This monster did not drop SQK.'; end if;
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
      perform hf_private.award_skill(u,r.map);
    elsif k='death' then r.status := 'dead';
    else raise exception 'Unknown game event.';
    end if;
    r.seq := s; r.frame := f;
  end loop;
  update hf_private.runs set status=r.status,seq=r.seq,frame=r.frame,hp=r.hp,coins=r.coins,weapons=r.weapons,
    ammo_gun=r.ammo_gun,ammo_grenade=r.ammo_grenade,sword=r.sword,last_attack=r.last_attack where id=r.id;
  return jsonb_build_object('ack',r.seq,'profile',hf_private.profile_json(u));
end; $$;


create function public.hf_dice(p_prediction text,p_request uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); r hf_private.dice_receipts; total integer; correct_count integer;
begin
  if u is null then raise exception 'Sign in to a cloud profile first.'; end if;
  if p_request is null or p_prediction is null or p_prediction not in ('HIGH','LOW') then raise exception 'Choose HIGH or LOW and a request ID.'; end if;
  perform 1 from hf_private.profiles where user_id=u for update;
  if not found then raise exception 'Create a profile first.'; end if;
  select * into r from hf_private.dice_receipts where user_id=u and request=p_request;
  if not found then
    -- Two independent uniform draws from disjoint equal-sized intervals.
    r.a := floor(random()*6)::integer+1; r.b := floor(random()*6)::integer+1;
    total := r.a+r.b; r.outcome := case when total=7 then 'DRAW' when total>7 then 'HIGH' else 'LOW' end;
    r.prediction := p_prediction; r.request := p_request; r.correct := p_prediction=r.outcome;
    insert into hf_private.dice_receipts(user_id,request,prediction,a,b,outcome,correct) values(u,p_request,p_prediction,r.a,r.b,r.outcome,r.correct);
    update hf_private.profiles set dice_rounds=dice_rounds+1,dice_correct=dice_correct+case when r.correct then 1 else 0 end,
      dice_wins=dice_wins+case when r.correct then 1 else 0 end,dice_draws=dice_draws+case when total=7 then 1 else 0 end
    where user_id=u returning dice_correct into correct_count;
    insert into hf_private.badges(user_id,id,source,tier)
    select u,'dice-'||t.tier,'dice',t.tier from (values ('bronze',20),('silver',50),('gold',100)) t(tier,threshold)
    where correct_count>=t.threshold on conflict do nothing;
  elsif r.prediction<>p_prediction then raise exception 'Retry with the original prediction for this request.';
  end if;
  return jsonb_build_object('profile',hf_private.profile_json(u),'round',jsonb_build_object('id',r.request,'dice',jsonb_build_array(r.a,r.b),'total',r.a+r.b,'prediction',r.prediction,'outcome',r.outcome,'correct',r.correct));
end; $$;

create function public.hf_exchange_badge(p_badge text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); b hf_private.badges; reward integer;
begin
  if u is null then raise exception 'Sign in to a cloud profile first.'; end if;
  perform 1 from hf_private.profiles where user_id=u for update;
  if not found then raise exception 'Create a profile first.'; end if;
  select * into b from hf_private.badges where user_id=u and id=p_badge for update;
  if not found or b.source not in ('skill','contribution') then raise exception 'Only earned skill or contribution badges can be exchanged. Dice achievements stay on display.'; end if;
  if b.exchanged_at is not null then return hf_private.profile_json(u); end if;
  reward := case b.tier when 'bronze' then 20 when 'silver' then 50 when 'gold' then 120 end;
  update hf_private.badges set exchanged_at=clock_timestamp(),credited=reward where user_id=u and id=p_badge;
  update hf_private.profiles set sqk=sqk+reward where user_id=u;
  return hf_private.profile_json(u);
end; $$;

-- Owner/database-only issuance: a unique verified contribution reference.
-- The public client never has authority to award these badges.
create function hf_private.award_contribution(p_user uuid,p_tier text,p_reference text) returns void
language plpgsql set search_path = '' as $$
begin
  if p_tier is null or p_tier not in ('bronze','silver','gold') or p_reference is null or char_length(trim(p_reference)) not between 1 and 120 then raise exception 'Supply a valid tier and verified contribution reference.'; end if;
  perform 1 from hf_private.profiles where user_id=p_user for update;
  if not found then raise exception 'Profile not found.'; end if;
  insert into hf_private.badges(user_id,id,source,tier) values(p_user,'contribution-'||trim(p_reference),'contribution',p_tier) on conflict do nothing;
end; $$;
revoke all on function hf_private.award_skill(uuid,integer),hf_private.award_contribution(uuid,text,text) from public,anon,authenticated;
revoke all on function public.hf_start_run_v3(integer),public.hf_dice(text,uuid),public.hf_exchange_badge(text) from public,anon,authenticated;
grant execute on function public.hf_start_run_v3(integer),public.hf_dice(text,uuid),public.hf_exchange_badge(text) to authenticated;
commit;
