from pathlib import Path
import sys

# Regression contract: refresh ABC live, then include every currently active
# matching offer in each digest slot, even if it was emailed in an older slot.
src = Path(sys.argv[1]).read_text()
checks = {
    'cron_refreshes_abc_before_reading_state': (
        'refreshEmailUserOfferStateFromAbc' in src
        and src.find('refreshEmailUserOfferStateFromAbc(env, userId')
        < src.find('const storedAlerts = await loadStoredEmailAlerts(env, userId, 80);')
    ),
    'stored_state_reads_email_markers': (
        'select=id,offer_id,offer_payload,last_seen_at,first_emailed_at,last_emailed_at' in src
    ),
    'stored_state_reads_all_active_offers': (
        'is_active=eq.true&select=id,offer_id,offer_payload,last_seen_at,first_emailed_at,last_emailed_at' in src
    ),
    'stored_state_does_not_query_only_never_emailed': 'first_emailed_at=is.null' not in src,
    'stored_state_does_not_drop_previously_emailed': 'if (item.first_emailed_at) return false;' not in src,
    'successful_send_keeps_email_history': 'await markEmailAlertsAsEmailed(env, visibleSource)' in src,
    'slot_dedupe_still_present': (
        '`email:slot:${slotKey}:user:${userId}:sent`' in src
        and 'already_sent_for_user_in_slot' in src
    ),
    'fresh_fetch_restricts_to_published': (
        'estado:"Publicada"' in src and 'fetchPublishedOffersForEmailDistrict' in src
    ),
    'fresh_matches_have_syncable_offer_id': (
        'item.offer_id = item.offer_id || item.source_offer_key || "";' in src
    ),
    'abc_refresh_failure_skips_stale_send': (
        'reason: "abc_refresh_failed"' in src
        and 'continue;' in src[
            src.find('reason: "abc_refresh_failed"'):
            src.find('const storedAlerts = await loadStoredEmailAlerts(env, userId, 80);')
        ]
    ),
}
failed = [name for name, ok in checks.items() if not ok]
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL'), name)
if failed:
    print('FAILED:', ', '.join(failed))
    sys.exit(1)
print('ALL ACTIVE-PER-SLOT REGRESSION CHECKS PASS')
