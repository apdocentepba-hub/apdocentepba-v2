from pathlib import Path
import sys

src_path = Path(sys.argv[1])
out_path = Path(sys.argv[2])
s = src_path.read_text()

# Email-sweep follow-up:
# - active offers may repeat across 14/18/22 slots;
# - canonical state identity is ABC idoferta, not D_<iddetalle>;
# - email refresh computes PID through the same functions as the web view;
# - dry-run exposes actual state identity + PID evidence for deploy verification.
required = [
    'async function refreshEmailUserOfferStateFromAbc',
    'async function markEmailAlertsAsEmailed',
    'refreshEmailUserOfferStateFromAbc(env, userId, emailRefreshShared)',
    'await markEmailAlertsAsEmailed(env, visibleSource)',
    '`email:slot:${slotKey}:user:${userId}:sent`',
    'source_offer_key: buildSourceOfferKeyFromOferta2(oferta)',
    'async function obtenerUltimaPidGuardada',
    'function evaluatePidCompatibility',
    'function buildAlertItem',
]
missing = [marker for marker in required if marker not in s]
if missing:
    raise SystemExit('required live-refresh/PID markers missing: ' + ', '.join(missing))


def replace_once(text, old, new, label):
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'unexpected {label} count={count}')
    return text.replace(old, new, 1)


def replace_in_refresh(text, old, new, label):
    start = text.find('async function refreshEmailUserOfferStateFromAbc')
    end = text.find('async function markEmailAlertsAsEmailed', start)
    if start < 0 or end <= start:
        raise SystemExit('email refresh function bounds not found')
    block = text[start:end]
    if new in block:
        return text
    count = block.count(old)
    if count != 1:
        raise SystemExit(f'unexpected {label} count in email refresh={count}')
    block = block.replace(old, new, 1)
    return text[:start] + block + text[end:]


# Active offers may repeat in later digest slots.
old_query = (
    '&is_active=eq.true&first_emailed_at=is.null&select='
    'id,offer_id,offer_payload,last_seen_at,first_emailed_at,last_emailed_at'
)
new_query = (
    '&is_active=eq.true&select='
    'id,offer_id,offer_payload,last_seen_at,first_emailed_at,last_emailed_at'
)
if old_query in s:
    s = replace_once(s, old_query, new_query, 'old stored-state query')
elif new_query not in s:
    raise SystemExit('expected email stored-state query shape not found')

old_filter = '        if (item.first_emailed_at) return false;\n'
if old_filter in s:
    s = replace_once(s, old_filter, '', 'first_emailed postfilter')

# Canonical identity inside email refresh only.
old_identity = '    item.offer_id = item.offer_id || item.source_offer_key || "";'
new_identity = '    item.offer_id = String(item.idoferta || item.offer_id || item.source_offer_key || "").trim();'
refresh_probe = s[s.find('async function refreshEmailUserOfferStateFromAbc'):s.find('async function markEmailAlertsAsEmailed')]
if old_identity in refresh_probe:
    s = replace_in_refresh(s, old_identity, new_identity, 'email identity assignment')
elif new_identity not in refresh_probe:
    raise SystemExit('expected email refresh identity assignment not found')

# Load saved PID once for this user, exactly as the web alert builder does.
old_context = '''  const resultados = [];
  const seenAlerts = new Set();

  for (const oferta of allDocs) {'''
new_context = '''  const pidData = await obtenerUltimaPidGuardada(userId).catch(() => null);
  const pidRows = normalizePidRows(pidData);
  const districtIndex = buildDistrictIndex(shared.catalogos);
  const pidMeta = pidData?.result
    ? {
        listado: pidData.result.listado || "",
        anio: pidData.result.anio || ""
      }
    : null;

  const resultados = [];
  const seenAlerts = new Set();

  for (const oferta of allDocs) {'''
s = replace_in_refresh(s, old_context, new_context, 'PID context')

# Replace the PID-empty adaptOffer path with the web's PID-rich alert path.
old_item = '''    const item = adaptOffer(oferta);
    item.offer_id = String(item.idoferta || item.offer_id || item.source_offer_key || "").trim();
    item.detalle_match = evaluacion?.detalle || {};
    item.motivo_match = evaluacion?.motivo || "Coincide con preferencias";'''
new_item = '''    const pidEvalBase = evaluatePidCompatibility(
      oferta,
      pidData,
      pidRows,
      districtIndex
    );
    const pidInfo = {
      ...pidEvalBase,
      meta: pidMeta
    };
    const item = buildAlertItem(oferta, evaluacion, pidInfo);
    item.offer_id = String(item.idoferta || item.offer_id || item.source_offer_key || "").trim();
    item.detalle_match = evaluacion?.detalle || {};
    item.motivo_match = evaluacion?.motivo || "Coincide con preferencias";'''
s = replace_in_refresh(s, old_item, new_item, 'PID-rich item builder')

# Debug must identify the real user_offer_state row and PID payload. The D_ key
# remains useful traceability but is no longer treated as the state identity.
old_debug = '''      return {
        offer_id: String(
          p.source_offer_key ||
          p.iddetalle ||
          p.idoferta ||
          p.offer_id ||
          ""
        ).trim(),
        total_postulantes: p.total_postulantes,
        puntaje_primero: p.puntaje_primero,
        listado_origen_primero: p.listado_origen_primero || ""
      };'''
new_debug = '''      return {
        state_offer_id: String(item?.offer_id || p.offer_id || "").trim(),
        source_offer_key: String(p.source_offer_key || "").trim(),
        idoferta: String(p.idoferta || "").trim(),
        iddetalle: String(p.iddetalle || "").trim(),
        pid_compatible: !!p.pid_compatible,
        pid_reason: p.pid_reason || "",
        pid_area: p.pid_area || "",
        pid_bloque: p.pid_bloque || "",
        pid_puntaje_total_base: p.pid_puntaje_total_base,
        pid_puntaje_total_final: p.pid_puntaje_total_final,
        pid_listado: p.pid_listado || "",
        pid_anio: p.pid_anio || "",
        total_postulantes: p.total_postulantes,
        puntaje_primero: p.puntaje_primero,
        listado_origen_primero: p.listado_origen_primero || ""
      };'''
s = replace_once(s, old_debug, new_debug, 'enrichedSamples debug block')

# Final safety assertions.
if 'first_emailed_at=is.null' in s:
    raise SystemExit('never-emailed eligibility filter still present')
if 'if (item.first_emailed_at) return false;' in s:
    raise SystemExit('previously-emailed postfilter still present')
refresh = s[s.find('async function refreshEmailUserOfferStateFromAbc'):s.find('async function markEmailAlertsAsEmailed')]
if old_identity in refresh:
    raise SystemExit('email refresh still promotes source_offer_key over idoferta')
if 'const item = adaptOffer(oferta);' in refresh:
    raise SystemExit('email refresh still builds PID-empty adaptOffer payload')
if 'buildAlertItem(oferta, evaluacion, pidInfo)' not in refresh:
    raise SystemExit('email refresh missing web PID-rich alert builder')

out_path.write_text(s)
print(out_path)
