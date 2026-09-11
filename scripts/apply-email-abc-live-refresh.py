from pathlib import Path
import sys

src_path = Path(sys.argv[1])
out_path = Path(sys.argv[2])
s = src_path.read_text()

# Narrow follow-up to the already-deployed live-ABC refresh.
# 1) first_emailed_at stays historical only; per-slot dedupe remains the guard.
# 2) email refresh must use the same canonical offer identity as the web sync:
#    idoferta first, while preserving source_offer_key (D_<iddetalle>) only as
#    source traceability. This prevents duplicate state rows with conflicting PID.
required = [
    'async function refreshEmailUserOfferStateFromAbc',
    'refreshEmailUserOfferStateFromAbc(env, userId, emailRefreshShared)',
    'await markEmailAlertsAsEmailed(env, visibleSource)',
    '`email:slot:${slotKey}:user:${userId}:sent`',
    'source_offer_key: buildSourceOfferKeyFromOferta2(oferta)',
]
missing = [marker for marker in required if marker not in s]
if missing:
    raise SystemExit('required live-refresh markers missing: ' + ', '.join(missing))

old_query = (
    '&is_active=eq.true&first_emailed_at=is.null&select='
    'id,offer_id,offer_payload,last_seen_at,first_emailed_at,last_emailed_at'
)
new_query = (
    '&is_active=eq.true&select='
    'id,offer_id,offer_payload,last_seen_at,first_emailed_at,last_emailed_at'
)

if old_query in s:
    if s.count(old_query) != 1:
        raise SystemExit(f'unexpected old query count={s.count(old_query)}')
    s = s.replace(old_query, new_query, 1)
elif new_query not in s:
    raise SystemExit('expected email stored-state query shape not found')

old_filter = '        if (item.first_emailed_at) return false;\n'
if old_filter in s:
    if s.count(old_filter) != 1:
        raise SystemExit(f'unexpected first_emailed filter count={s.count(old_filter)}')
    s = s.replace(old_filter, '', 1)

old_identity = '    item.offer_id = item.offer_id || item.source_offer_key || "";'
new_identity = '    item.offer_id = String(item.idoferta || item.offer_id || item.source_offer_key || "").trim();'
if old_identity in s:
    if s.count(old_identity) != 1:
        raise SystemExit(f'unexpected email identity line count={s.count(old_identity)}')
    s = s.replace(old_identity, new_identity, 1)
elif new_identity not in s:
    raise SystemExit('expected email refresh identity assignment not found')

if 'first_emailed_at=is.null' in s:
    raise SystemExit('never-emailed eligibility filter still present')
if 'if (item.first_emailed_at) return false;' in s:
    raise SystemExit('previously-emailed postfilter still present')
if old_identity in s:
    raise SystemExit('email refresh still promotes source_offer_key over idoferta')

out_path.write_text(s)
print(out_path)
