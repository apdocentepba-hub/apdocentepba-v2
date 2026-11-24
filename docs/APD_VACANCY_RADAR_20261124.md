# Historical vacancy radar — fixed aggregate snapshot
Extracted 24/11/2026 from existing Supabase history, cutoff 02/11/2026 UTC. Latest observation per source_offer_key (not necessarily final result). 9,905 unique offers, six districts, 2,332 desiertas, 6,405 designadas, 1,168 other states. Sample partial, no applicant or score data. District/cargo groups require >=30 combined outcomes; absent group does not imply zero. Display rate desiertas/(desiertas+designadas), not hiring probability. Aggregates are nonpersonal and shipped as static public JS; Insigne UI gating is presentation only. No periodic refresh, new database tables, or external calls. Reproducible SQL (read-only):
```sql
with latest as (
 select distinct on (source_offer_key) source_offer_key, upper(trim(estado)) estado,upper(trim(distrito)) distrito,upper(trim(cargo)) cargo,captured_at
 from public.apd_ofertas_historial where source_offer_key is not null and source_offer_key<>'' and captured_at < '2026-11-03 00:00:00+00'
 order by source_offer_key,captured_at desc nulls last,id desc
), groups as (
 select 'district' kind,distrito district,'' cargo,count(*) total,count(*) filter(where estado='DESIERTA') desiertas,count(*) filter(where estado='DESIGNADA') designadas from latest where distrito<>'' group by distrito
 union all select 'cargo',distrito,cargo,count(*),count(*) filter(where estado='DESIERTA'),count(*) filter(where estado='DESIGNADA') from latest where distrito<>'' and cargo<>'' group by distrito,cargo
) select kind,district,cargo,total,desiertas,designadas from groups where desiertas+designadas>=30 order by kind,district,cargo
```
