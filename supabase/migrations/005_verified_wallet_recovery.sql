-- Upgrade the existing project after 004. No player data or links are rewritten.
begin;

-- Auth verifies the signature, then stores provider.Claims inside identity_data.
-- These provider claims are nested; editable auth.users metadata is not evidence.
create or replace function hf_private.wallet_address() returns text
language sql stable security definer set search_path='' as $$
 select lower(identity_data #>> '{custom_claims,address}') from auth.identities
 where user_id=auth.uid() and provider='web3'
 and identity_data #>> '{custom_claims,chain}'='ethereum'
 and lower(identity_data #>> '{custom_claims,address}') ~ '^0x[0-9a-f]{40}$'
 limit 1;
$$;

-- An ended run cannot accept new events, but its last acknowledgement can still
-- reconcile a lost reply. Lock in the same order as progress/start/purchase so
-- status, acknowledgement and profile describe one authoritative snapshot.
create function public.hf_run_state(p_run uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=hf_private.player_id(); r hf_private.runs;
begin
 perform 1 from hf_private.profiles where user_id=u for update;
 select * into r from hf_private.runs where id=p_run and user_id=u for update;
 if not found then raise exception 'This map does not belong to your profile.'; end if;
 return jsonb_build_object('status',r.status,'ack',r.seq,
   'profile',hf_private.profile_json(u));
end;
$$;
revoke all on function public.hf_run_state(uuid) from public,anon,authenticated;
grant execute on function public.hf_run_state(uuid) to authenticated;

create or replace function public.hf_service_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion',5,'leaderboard','lifetime');
$$;
notify pgrst, 'reload schema';
commit;
