from pathlib import Path
import sys

src = Path(sys.argv[1]).read_text()
checks = {
    'cron_refreshes_abc_before_reading_state': 'refreshEmailUserOfferStateFromAbc' in src and src.find('refreshEmailUserOfferStateFromAbc(env, userId') < src.find('const storedAlerts = await loadStoredEmailAlerts(env, userId, 80);'),
    'stored_state_reads_email_markers': 'select=id,offer_id,offer_payload,last_seen_at,first_emailed_at,last_emailed_at' in src,
    'stored_state_filters_unemailed_before_limit': 'is_active=eq.true&first_emailed_at=is.null&select=id,offer_id' in src,
    'stored_state_excludes_already_emailed': 'if (item.first_emailed_at) return false;' in src,
    'successful_send_marks_offer_rows': 'await markEmailAlertsAsEmailed(env, visibleSource)' in src,
    'fresh_fetch_restricts_to_published': 'estado:"Publicada"' in src and 'fetchPublishedOffersForEmailDistrict' in src,
    'fresh_matches_have_syncable_offer_id': 'item.offer_id = item.offer_id || item.source_offer_key || "";' in src,
    'abc_refresh_failure_skips_stale_send': 'reason: "abc_refresh_failed"' in src and 'continue;' in src[src.find('reason: "abc_refresh_failed"'):src.find('const storedAlerts = await loadStoredEmailAlerts(env, userId, 80);')],
}
failed = [name for name, ok in checks.items() if not ok]
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL'), name)
if failed:
    print('FAILED:', ', '.join(failed))
    sys.exit(1)
print('ALL REGRESSION CHECKS PASS')
