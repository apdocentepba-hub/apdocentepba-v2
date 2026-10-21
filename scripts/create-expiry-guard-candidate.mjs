// Creates a tested candidate from the pristine production snapshot; never changes worker-live.
import fs from 'node:fs';
import path from 'node:path';
const originalPath = path.resolve('worker-live/worker_hotfix.js');
const outPath = path.resolve(process.argv[2] || 'tmp/expiry-candidate/worker_hotfix.js');
let source = fs.readFileSync(originalPath, 'utf8');
if (source.includes('APD_EXPIRY_NOTICE_V1: notification only')) {
  // The canonical snapshot has already been updated after a verified deployment.
  // Reuse its exact bytes, never apply the patch twice.
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, source);
  console.log('Expiry candidate already present in canonical live bundle.');
  process.exit(0);
}
function replaceExactlyOnce(before, after, label) {
  if (source.split(before).length !== 2) throw new Error('Cannot safely apply: ' + label);
  source = source.replace(before, after);
}
const patches = [
  [
    "async function handleMiPlan(url, env) {",
    "// APD_EXPIRY_NOTICE_V1: notification only; no subscriptions are changed here.\n// Enabled only after the verified production deployment and explicit env opt-in.\nasync function apdSendExpiryNoticeOnce(env, user, subscription, endsAtIso) {\n  const planCode = canonicalPlanCode(subscription.plan_code);\n  const expiryKey = `apd:expiry:v1:${user.id}:${planCode}:${endsAtIso}`;\n  let reserved;\n  try {\n    const result = await supabaseInsertReturning(env, \"notification_delivery_logs\", {\n      user_id: user.id,\n      channel: \"email\",\n      template_code: \"apd_subscription_expired_v1\",\n      destination: user.email,\n      status: \"sending_expiry_notice\",\n      dedupe_key: expiryKey,\n      payload: { plan_code: planCode, ended_at: endsAtIso, source: \"daily_cron\" }\n    });\n    reserved = Array.isArray(result) ? result[0] : result;\n  } catch (err) {\n    // Unique notification_delivery_logs_dedupe_key_uidx prevents duplicates.\n    if (/23505|duplicate key/i.test(String(err?.message || err))) return \"duplicate\";\n    throw err;\n  }\n  if (!reserved?.id) return \"reservation_missing\";\n  const firstName = String(user.nombre || \"\").trim().split(/\\s+/)[0] || \"Hola\";\n  const trial = planCode === \"TRIAL_7D\";\n  const subject = trial\n    ? \"Tu prueba gratuita de Alertas APD finalizó\"\n    : \"Tu plan de Alertas APD venció\";\n  const html = `<div style=\"font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#21314a;line-height:1.6\">\n    <h2>Hola, ${escHtml(firstName)}</h2>\n    <p>${trial ? \"Tu prueba gratuita de 7 días terminó.\" : \"Terminó el período de tu plan.\"} Para seguir recibiendo alertas personalizadas de Actos Públicos Digitales, necesitás elegir y activar un plan vigente.</p>\n    <p>Tus preferencias quedan guardadas para cuando vuelvas.</p>\n    <p><a href=\"https://alertasapd.com.ar/\" style=\"display:inline-block;padding:12px 18px;background:#123b72;color:white;text-decoration:none;border-radius:8px\">Ver planes y reactivar mis alertas</a></p>\n    <p style=\"font-size:12px;color:#65748a\">Este correo es un aviso de vencimiento de tu cuenta de APDocentePBA; no es una alerta de ofertas docentes.</p></div>`;\n  let response;\n  try {\n    response = await enviarMailBrevo(user.email, String(user.nombre || \"\"), subject, html, env);\n  } catch (err) {\n    response = { ok: false, status: 0, error: String(err?.message || err) };\n  }\n  await supabasePatch(env, \"notification_delivery_logs\", `id=eq.${reserved.id}`, {\n    status: response?.ok ? \"sent_expiry_notice\" : \"failed_expiry_notice\",\n    provider_response: { http_status: Number(response?.status || 0), ok: !!response?.ok }\n  }).catch((err) => console.error(\"APD expiry audit update failed\", String(err?.message || err)));\n  return response?.ok ? \"sent\" : \"failed\";\n}\nasync function apdProcessExpiryNotices(env) {\n  if (String(env.APD_EXPIRY_NOTICES_ENABLED || \"\").toLowerCase() !== \"true\") return;\n  // Check each real subscription before sending; never infer expiry from login sessions.\n  const [subscriptions, users] = await Promise.all([\n    supabaseSelect(env, \"user_subscriptions?select=id,user_id,plan_code,status,source,trial_ends_at,current_period_ends_at,created_at&order=created_at.desc&limit=1000\"),\n    supabaseSelect(env, \"users?select=id,nombre,email,activo,es_admin&limit=1000\")\n  ]);\n  if (!Array.isArray(subscriptions) || !Array.isArray(users)) return;\n  const grouped = new Map();\n  for (const s of subscriptions) {\n    if (!grouped.has(s.user_id)) grouped.set(s.user_id, []);\n    grouped.get(s.user_id).push(s);\n  }\n  const now = Date.now();\n  let handled = 0;\n  for (const user of users) {\n    if (handled >= 3) break;\n    if (!user?.id || !user?.activo || user?.es_admin || !String(user.email || \"\").includes(\"@\")) continue;\n    const rows = grouped.get(user.id) || [];\n    if (!rows.length) continue;\n    // Active subscriptions, beta grants and explicit administrator grants are exempt.\n    if (elegirSuscripcionVigente(rows)) continue;\n    if (rows.some(row =>\n      String(row.source || \"\").toLowerCase() === \"manual_admin_grant\" ||\n      (canonicalPlanCode(row.plan_code) !== \"TRIAL_7D\" && (\n        !row.current_period_ends_at ||\n        Date.parse(String(row.current_period_ends_at)) > Date.UTC(2099, 0, 1)\n      ) && String(row.status || \"\").toUpperCase() === \"ACTIVE\")\n    )) continue;\n    const latest = rows[0]; // sorted by created_at DESC\n    const planCode = canonicalPlanCode(latest.plan_code);\n    const endIso = planCode === \"TRIAL_7D\" ? latest.trial_ends_at : latest.current_period_ends_at;\n    const endTs = Date.parse(String(endIso || \"\"));\n    if (!Number.isFinite(endTs) || endTs >= now || now - endTs > 7 * 86400000) continue;\n    if (String(latest.status || \"\").toUpperCase() !== \"ACTIVE\") continue;\n    handled++;\n    await apdSendExpiryNoticeOnce(env, user, latest, endIso).catch(err =>\n      console.error(\"APD expiry notice failed\", String(err?.message || err))\n    );\n  }\n}\n\nasync function handleMiPlan(url, env) {"
  ],
  [
    "    subscription: resolved.subscription\n  });\n}\n__name(handleMiPlan, \"handleMiPlan\");",
    "    subscription: resolved.subscription,\n    access_active: isPlanActivo(resolved)\n  });\n}\n__name(handleMiPlan, \"handleMiPlan\");"
  ],
  [
    "if (!isRecognizedEmailCron) return;",
    "if (!isRecognizedEmailCron) return;\n    if (isPrimaryEmailCron) {\n      ctx.waitUntil(apdProcessExpiryNotices(env).catch(err =>\n        console.error(\"APD expiry notices cron failed\", String(err?.message || err))\n      ));\n    }"
  ],
  [
    "  if (status === \"BETA\") {\n    return true;\n  }\n  if ([\"ACTIVE\", \"AUTHORIZED\", \"PENDING\", \"PAUSED\"].includes(status)) {",
    "  if (status === \"BETA\") {\n    return true;\n  }\n  // Deliberate manual unlimited grant (source set only by an administrator).\n  if (status === \"ACTIVE\" && planCode === \"INSIGNE\" &&\n      String(sub.source || \"\") === \"manual_admin_grant\" && !sub.current_period_ends_at) {\n    return true;\n  }\n  if ([\"ACTIVE\", \"AUTHORIZED\", \"PENDING\", \"PAUSED\"].includes(status)) {"
  ],
  [
    "    if (status === \"BETA\") {\n      return row;\n    }\n    const trialEndsTs =",
    "    if (status === \"BETA\" || (status === \"ACTIVE\" && planCode === \"INSIGNE\" &&\n        String(row.source || \"\") === \"manual_admin_grant\" && !row.current_period_ends_at)) {\n      return row;\n    }\n    const trialEndsTs ="
  ]
];
patches.forEach(([before, after], index) => replaceExactlyOnce(before, after, String(index + 1)));
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, source);
console.log('Wrote guarded expiry candidate to ' + outPath);
