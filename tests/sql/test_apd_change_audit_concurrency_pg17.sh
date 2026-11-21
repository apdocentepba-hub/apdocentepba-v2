#!/usr/bin/env bash
# Race two independent PostgreSQL 17 clients on the SAME private audit batch.
# Requires both disposable compact and audit schema to have been initialized.
set -euo pipefail
payload="$(node --input-type=module <<'JS'
import {compactCaptureFromPages} from './scripts/apd-offer-compact-capture.mjs';
import {prepareOfferAuditBatch} from './scripts/apd-offer-audit-batch.mjs';
const base={source_offer_key:'D_RACE',estado:'Publicada',distrito:'MORENO',
 finoferta:'2026-11-12T07:30:00Z',turno:'Mañana'};
const shot=(row,time)=>compactCaptureFromPages({scope:'MORENO',capturedAt:time,
 pages:[{offset:0,sourceTotal:1,rows:[row]}]});
const previous=shot(base,'2026-11-09T08:00:00Z');
const current=shot({...base,turno:'Tarde'},'2026-11-09T09:00:00Z');
const batch=prepareOfferAuditBatch(previous,current,{
 nowMs:Date.parse('2026-11-09T09:05:00Z')});
if(batch.verified!==true||batch.events.length!==1)throw Error('Invalid race test');
console.log(JSON.stringify({previous,current,batch}));
JS
)"
psql -X -v ON_ERROR_STOP=1 -v payload="$payload" <<'SQL'
SELECT * FROM apd_change_lab.save_compact(:'payload'::jsonb->'previous');
SELECT * FROM apd_change_lab.save_compact(:'payload'::jsonb->'current');
SQL

# Both clients may race; exactly one should insert, the other must be idempotent.
(
 psql -X -q -t -A -v ON_ERROR_STOP=1 -v payload="$payload" <<'SQL'
SELECT added FROM apd_change_lab.record_audit_batch(:'payload'::jsonb->'batch');
SQL
) >/tmp/apd_audit_race_1.txt 2>/tmp/apd_audit_race_1.err &
p1=$!
(
 psql -X -q -t -A -v ON_ERROR_STOP=1 -v payload="$payload" <<'SQL'
SELECT added FROM apd_change_lab.record_audit_batch(:'payload'::jsonb->'batch');
SQL
) >/tmp/apd_audit_race_2.txt 2>/tmp/apd_audit_race_2.err &
p2=$!
wait "$p1"
wait "$p2"
a="$(tr -d '[:space:]' </tmp/apd_audit_race_1.txt)"
b="$(tr -d '[:space:]' </tmp/apd_audit_race_2.txt)"
if ! { [[ "$a" == 1 && "$b" == 0 ]] || [[ "$a" == 0 && "$b" == 1 ]]; }; then
 echo "Race results invalid; first=$a second=$b" >&2
 exit 1
fi
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $verify$
BEGIN
 IF (SELECT count(*) FROM apd_change_lab.audit_events WHERE scope='MORENO')<>1 OR
    (SELECT count(*) FROM apd_change_lab.audit_events
      WHERE scope='MORENO' AND status='audit_only')<>1 OR
    (SELECT count(*) FROM apd_change_lab.captures WHERE scope='MORENO')<>2 THEN
  RAISE EXCEPTION 'Concurrent writes produced duplicate or unsafe records';
 END IF;
END $verify$;
SQL
echo 'APD_AUDIT_CONCURRENT_PG17_PASSED'
