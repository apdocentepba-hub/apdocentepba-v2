#!/usr/bin/env python3
import argparse
from pathlib import Path


def once(s, old, new, label):
    n=s.count(old)
    if n!=1: raise SystemExit(f'{label}: expected 1 occurrence, found {n}')
    return s.replace(old,new,1)


def between(s,start,end,repl,label):
    a=s.find(start); b=s.find(end,a)
    if a<0 or b<0: raise SystemExit(f'{label}: marker not found')
    return s[:a]+repl.rstrip()+'\n\n'+s[b:]


def patch_main(s):
    s=between(s,'function buildTop5NuevasHtml(alerts, user) {','function mailInfoBox(label, value) {','''function buildTop5NuevasHtml(alerts, user) {
  return buildDigestHtml(alerts, user, {
    max_visible: 5,
    total_alerts: Array.isArray(alerts) ? alerts.length : 0,
    intro_text: `Hola ${escHtml(user?.nombre || "docente")}, estas son las ofertas más recientes detectadas para vos.`
  });
}''','top5')
    s=once(s,"""    revista:\n      offer.revista ||\n      offer.supl_revista ||\n      '',\n\n    curso_division:""","""    revista:\n      offer.revista ||\n      offer.supl_revista ||\n      '',\n\n    estado:\n      offer.estado ||\n      offer.estado_raw ||\n      '',\n\n    curso_division:""",'estado normalize')
    s=once(s,"""  const tipo = String(p.revista || \"\").trim() || (\n    (p.desde && String(p.desde).trim() && String(p.desde).trim().toLowerCase() !== \"sin fecha\" &&\n     p.hasta && String(p.hasta).trim() && String(p.hasta).trim().toLowerCase() !== \"sin fecha\")\n      ? \"Suplencia\"\n      : \"Provisional\"\n  );""","""  const revistaRaw = String(p.revista || \"\").trim().toUpperCase();
  const tipo = (revistaRaw === \"S\" || revistaRaw.includes(\"SUPL\")) ? \"SUPLENCIA\"
    : (revistaRaw === \"P\" || revistaRaw.includes(\"PROVIS\")) ? \"PROVISIONAL\"
    : ((p.desde && p.hasta) ? \"SUPLENCIA\" : \"PROVISIONAL\");
  const motivoPid = String(p.pid_reason || \"\").trim() ||
    (p.pid_compatible ? \"Compatible con tu PID\" : \"No compatible con tu PID\");""",'revista/pid')
    s=once(s,'>✨ ${escHtml(tipo)}</span','>📌 ${escHtml(tipo)}</span','revista chip')
    s=once(s,'<td style="padding:0 18px 18px 18px;">\n              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">','<td style="padding:0 18px 18px 18px;">\n              <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;color:#5d7290;letter-spacing:.08em;margin:0 0 10px 0;">DATOS DE LA OFERTA</div>\n              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">','section')
    s=once(s,'<td colspan="2" style="padding:0;">\n                    ${mailInfoBox("CIERRE", escHtml(p.fecha_cierre || p.finoferta || "—"))}\n                  </td>','<td width="50%" style="padding:0 6px 0 0;vertical-align:top;">${mailInfoBox("CIERRE", escHtml(p.fecha_cierre || p.finoferta || "—"))}</td>\n                  <td width="50%" style="padding:0 0 0 6px;vertical-align:top;">${mailInfoBox("ESTADO", escHtml(p.estado || "—"))}</td>','estado box')
    s=once(s,'${mailMiniBox("MOTIVO", escHtml(p.pid_reason || "Compatible con tu PID"))}','${mailMiniBox("MOTIVO", escHtml(motivoPid))}','motivo')
    s=once(s,'p.pid_residencia_bonus != null && p.pid_residencia_bonus !== ""\n                              ? escHtml(String(p.pid_residencia_bonus))\n                              : "No"','p.pid_residencia_bonus_aplicado\n                              ? `Sí (+${formatMailNumber(p.pid_residencia_bonus_puntos || 0)})`\n                              : "No"','bonus')
    s=once(s,'`${p.listado_origen_primero || p.pid_listado || "—"} · ${p.anio_listado || new Date().getFullYear()}`','`${p.pid_listado || "—"} · ${p.pid_anio || new Date().getFullYear()}`','pid list')
    return s


def patch_queue(s):
    s=once(s,'jornada: normalizeText(raw.jornada || ""),\n    modulos:', 'jornada: normalizeText(raw.jornada || ""),\n    revista: normalizeText(raw.revista || raw.supl_revista || raw.situacion_revista || ""),\n    curso_division: normalizeText(raw.curso_division || raw.cursodivision || ""),\n    dias_horarios: normalizeText(raw.dias_horarios || raw.diashora || raw.horario || ""),\n    estado: normalizeText(raw.estado || raw.estado_raw || ""),\n    modulos:', 'queue fields')
    s=once(s,'const cards = (Array.isArray(alerts) ? alerts : []).map((alert) => `','''const cards = (Array.isArray(alerts) ? alerts : []).map((alert) => {
    const revistaRaw = String(alert.revista || "").trim().toUpperCase();
    const tipo = (revistaRaw === "S" || revistaRaw.includes("SUPL")) ? "SUPLENCIA"
      : (revistaRaw === "P" || revistaRaw.includes("PROVIS")) ? "PROVISIONAL"
      : ((alert.desde && alert.hasta) ? "SUPLENCIA" : "PROVISIONAL");
    const vigencia = (alert.desde || alert.hasta) ? `${alert.desde || "—"} — ${alert.hasta || "—"}` : "—";
    return `''','queue map start')
    s=once(s,'<div style="font-size:16px;font-weight:700;margin-bottom:8px;color:#0f3460;">${escapeHtml(alert.cargo || "Oferta APD")}</div>','<div style="font-size:16px;font-weight:700;margin-bottom:8px;color:#0f3460;">${escapeHtml(alert.cargo || "Oferta APD")}</div>\n      <div style="margin:0 0 10px 0;"><span style="display:inline-block;background:#f3e8ff;color:#7c3aed;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:700;">📌 ${escapeHtml(tipo)}</span></div>\n      <div style="font-size:11px;font-weight:800;color:#5d7290;letter-spacing:.08em;margin:10px 0 7px 0;">DATOS DE LA OFERTA</div>','queue identity')
    s=once(s,'${alert.modulos ? `<div><b>Módulos:</b> ${escapeHtml(alert.modulos)}</div>` : ""}','${alert.curso_division ? `<div><b>CURSO / DIVISIÓN:</b> ${escapeHtml(alert.curso_division)}</div>` : ""}\n      ${alert.modulos ? `<div><b>MÓDULOS:</b> ${escapeHtml(alert.modulos)}</div>` : ""}\n      <div><b>DÍAS / HORA.PROB:</b> ${escapeHtml(alert.dias_horarios || "—")}</div>\n      <div><b>VIGENCIA:</b> ${escapeHtml(vigencia)}</div>','queue offer rows')
    s=once(s,'${alert.fecha_cierre ? `<div><b>Cierre:</b> ${escapeHtml(alert.fecha_cierre)}</div>` : ""}','${alert.fecha_cierre ? `<div><b>CIERRE:</b> ${escapeHtml(alert.fecha_cierre)}</div>` : ""}\n      ${alert.estado ? `<div><b>ESTADO:</b> ${escapeHtml(alert.estado)}</div>` : ""}','queue state')
    s=once(s,'  `).join("");','  `;\n  }).join("");','queue map end')
    s=once(s,'Hotfix de alertas por mail','Resumen personalizado','queue header')
    s=once(s,'Tenés ${alerts.length} alerta${alerts.length === 1 ? "" : "s"} nueva${alerts.length === 1 ? "" : "s"}','Resumen APD compatible con tus preferencias','queue title')
    s=once(s,'Hola ${escapeHtml(user?.nombre || "")}, este envío salió desde la cola pendiente para no perder avisos.','Hola ${escapeHtml(user?.nombre || "docente")}, encontramos coincidencias con las preferencias que cargaste en APDocentePBA. Te mostramos las más recientes para que puedas revisarlas.','queue intro')
    return s


def main():
    p=argparse.ArgumentParser()
    for x in ('main-in','main-out','queue-in','queue-out'): p.add_argument('--'+x,required=True)
    a=p.parse_args()
    Path(a.main_out).write_text(patch_main(Path(a.main_in).read_text()),encoding='utf-8')
    Path(a.queue_out).write_text(patch_queue(Path(a.queue_in).read_text()),encoding='utf-8')
    print('email-format patch applied')

if __name__=='__main__': main()
