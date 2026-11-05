-- Owner-only, read-only snapshot. Run before and after migration 004 during a
-- maintenance window. Compare every field; keep output privately with backups.
-- Requires the existing 003 schema. No addresses or raw player rows are printed.
begin read only;
select count(*) as profiles, coalesce(sum(sqk),0) as sqk,
 coalesce(sum(total_score),0) as lifetime_score,
 md5(coalesce(string_agg(jsonb_build_array(user_id,name,sqk,total_score,highest_map,cosmetics)::text,'' order by user_id),'')) as profile_fingerprint
from hf_private.profiles;
select count(*) as purchases,
 md5(coalesce(string_agg(to_jsonb(p)::text,'' order by user_id,item),'')) as inventory_fingerprint
from hf_private.purchases p;
select count(*) as wallet_links, count(distinct wallet) as unique_wallets,
 md5(coalesce(string_agg(to_jsonb(w)::text,'' order by profile_id),'')) as identity_fingerprint
from hf_private.wallet_profiles w;
select count(*) as historical_daily_rows, coalesce(sum(score),0) as archived_daily_points
from hf_private.daily_scores;
commit;
