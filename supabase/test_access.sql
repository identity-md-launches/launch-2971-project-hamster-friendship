-- Zero-row permission probes, AFTER migration, in the production SQL Editor.
-- Does not invent an identity, change a score or grant any new privileges.
-- Success here establishes direct SQL permission denial, not Web3 login or
-- cross-wallet authorization. The real-wallet checks are separate.
begin;
set local role anon;
do $access$
begin
 begin
   execute 'update hf_private.profiles set total_score=total_score where false';
   raise exception 'SECURITY CHECK FAILED: anon has direct UPDATE access.';
 exception when insufficient_privilege then
   raise notice 'PASS: anon direct score update denied (42501).';
 end;
end;
$access$;
reset role;
set local role authenticated;
do $access$
begin
 begin
   execute 'update hf_private.profiles set total_score=total_score where false';
   raise exception 'SECURITY CHECK FAILED: authenticated has direct UPDATE access.';
 exception when insufficient_privilege then
   raise notice 'PASS: authenticated direct score update denied (42501).';
 end;
end;
$access$;
reset role;
rollback;
