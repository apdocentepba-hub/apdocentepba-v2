from pathlib import Path
import sys

src_path = Path(sys.argv[1])
out_path = Path(sys.argv[2])
s = src_path.read_text()

# This is a narrow follow-up to the already-deployed live-ABC refresh.
# Do not rebuild that feature here; only stop first_emailed_at from acting
# as a permanent eligibility gate. Historical first/last emailed timestamps
# remain intact, and the existing per-slot dedupe remains the send guard.
required = [
    'async function refreshEmailUserOfferStateFromAbc',
    'refreshEmailUserOfferStateFromAbc(env, userId, emailRefreshShared)',
    'await markEmailAlertsAsEmailed(env, visibleSource)',
    '`email:slot:${slotKey}:user:${userId}:sent`',
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

if 'first_emailed_at=is.null' in s:
    raise SystemExit('never-emailed eligibility filter still present')
if 'if (item.first_emailed_at) return false;' in s:
    raise SystemExit('previously-emailed postfilter still present')

out_path.write_text(s)
print(out_path)
