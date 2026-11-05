-- Apply after 006 in the ORIGINAL project; installed migrations stay intact.
-- A wallet may play on several devices. Never end another device's v6 run:
-- its ordered events can still be queued offline. Each run closes via its own
-- validated death/finish events. No historical row is changed or reopened.
begin;

-- Keep the legacy single-run constraint, while permitting independent v6 runs.
drop index hf_private.hf_one_active_map;
create unique index hf_one_active_map on hf_private.runs(user_id)
 where status='active' and rules_version<>6;

create or replace function public.hf_start_run_v6(p_map integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=hf_private.player_id(); p hf_private.profiles; r hf_private.runs;
 drops text[]:='{}'; health double precision[]:='{}'; specs jsonb:='[]'; skills text[];
 i integer; roll double precision; kind text; size text; hp double precision;
begin
 select * into p from hf_private.profiles where user_id=u for update;
 if p_map is null or p_map not between 1 and 4 or p_map>p.highest_map then raise exception 'Choose an unlocked map from 1 to 4.'; end if;
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

-- An already-open legacy client must also leave the new devices' queues valid.
-- Its existing v4 start/settlement behavior otherwise stays the same.
create or replace function public.hf_start_run_v4(p_map integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=hf_private.player_id(); p hf_private.profiles; r hf_private.runs;
 drops text[]:='{}'; health double precision[]:='{}'; specs jsonb:='[]'; skills text[];
 i integer; roll double precision; kind text; size text; hp double precision;
begin
 select * into p from hf_private.profiles where user_id=u for update;
 if p_map is null or p_map<1 or p_map>p.highest_map then raise exception 'Choose an unlocked map.'; end if;
 update hf_private.runs set status='abandoned' where user_id=u and status='active' and rules_version<>6;
 for i in 1..31 loop
   roll:=random();
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

-- The game event protocol remains v6; the patch is required before ranked play.
create or replace function public.hf_service_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion',7,'leaderboard','lifetime','rulesVersion',6);
$$;
revoke all on function public.hf_start_run_v6(integer),public.hf_start_run_v4(integer) from public,anon,authenticated;
grant execute on function public.hf_start_run_v6(integer),public.hf_start_run_v4(integer) to authenticated;
-- hf_progress, lifetime checkpoints, ownership, timing, sequences and RLS are
-- unchanged. The existing profile lock serializes updates across all its runs.
notify pgrst, 'reload schema';
commit;
