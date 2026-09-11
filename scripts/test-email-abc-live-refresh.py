from pathlib import Path
import sys

# Regression contract for the email sweep:
# - refresh live ABC before reading stored state;
# - include all currently active matches in every 14/18/22 slot;
# - keep per-slot dedupe and email history;
# - use canonical ABC idoferta as state identity;
# - compute PID with the same evaluation/build path used by the web alert view;
# - preserve the official ABC offer state (e.g. Publicada) in the mail payload;
# - expose canonical state id + PID evidence in dry-run debug so deploy smoke can
#   prove the rendered email is using the correct row, not stale D_<iddetalle>.
src = Path(sys.argv[1]).read_text()

refresh_start = src.find('async function refreshEmailUserOfferStateFromAbc')
refresh_end = src.find('async function markEmailAlertsAsEmailed', refresh_start)
refresh = src[refresh_start:refresh_end] if refresh_start >= 0 and refresh_end > refresh_start else ''

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
    'fresh_matches_use_canonical_abc_offer_id': (
        'item.offer_id = String(item.idoferta || item.offer_id || item.source_offer_key || "").trim();' in refresh
    ),
    'fresh_matches_do_not_promote_source_key_over_idoferta': (
        'item.offer_id = item.offer_id || item.source_offer_key || "";' not in refresh
    ),
    'source_offer_key_is_preserved_for_traceability': (
        'source_offer_key: buildSourceOfferKeyFromOferta2(oferta)' in src
    ),
    'email_refresh_loads_saved_pid': (
        'const pidData = await obtenerUltimaPidGuardada(userId).catch(() => null);' in refresh
        and 'const pidRows = normalizePidRows(pidData);' in refresh
    ),
    'email_refresh_uses_same_pid_district_index_as_web': (
        'const districtIndex = buildDistrictIndex(shared.catalogos);' in refresh
    ),
    'email_refresh_evaluates_pid_per_offer': (
        'evaluatePidCompatibility(' in refresh
        and 'pidData' in refresh
        and 'pidRows' in refresh
        and 'districtIndex' in refresh
    ),
    'email_refresh_builds_same_pid_rich_alert_as_web': (
        'buildAlertItem(oferta, evaluacion, pidInfo)' in refresh
        and 'const item = adaptOffer(oferta);' not in refresh
    ),
    'email_refresh_preserves_pid_list_and_year_meta': (
        'listado: pidData.result.listado || ""' in refresh
        and 'anio: pidData.result.anio || ""' in refresh
    ),
    'email_refresh_preserves_official_offer_state': (
        'item.estado = String(oferta.estado || item.estado || "").trim();' in refresh
    ),
    'dry_run_debug_exposes_state_offer_id': (
        'state_offer_id: String(item?.offer_id || p.offer_id || "").trim()' in src
    ),
    'dry_run_debug_exposes_pid_evidence': (
        'pid_compatible: !!p.pid_compatible' in src
        and 'pid_area: p.pid_area || ""' in src
        and 'pid_bloque: p.pid_bloque || ""' in src
        and 'pid_puntaje_total_base: p.pid_puntaje_total_base' in src
        and 'pid_listado: p.pid_listado || ""' in src
        and 'pid_anio: p.pid_anio || ""' in src
    ),
    'dry_run_debug_exposes_offer_state': (
        'estado: p.estado || ""' in src
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
print('ALL ACTIVE-PER-SLOT + CANONICAL-ID + PID-PARITY + STATE REGRESSION CHECKS PASS')
