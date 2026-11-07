// Produces an isolated Telegram candidate from the unmodified, verified Worker snapshot.
// Do NOT deploy it directly. Production traffic changes require a separate authorization and gates.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const patches = [
  {
    "name": "secret",
    "before": "function requireTelegramWebhookSecret(request, env) {\n  const configured = String(env.TELEGRAM_WEBHOOK_SECRET || \"\").trim();\n  if (!configured) return;\n  const provided = String(request.headers.get(\"X-Telegram-Bot-Api-Secret-Token\") || \"\").trim();\n  if (!provided || provided !== configured) {\n    const err = new Error(\"Webhook Telegram no autorizado\");\n    err.status = 401;\n    throw err;\n  }\n}",
    "after": "function requireTelegramWebhookSecret(request, env) {\n  const configured = String(env.TELEGRAM_WEBHOOK_SECRET || \"\").trim();\n  if (!configured) {\n    const err = new Error(\"Webhook Telegram no configurado\");\n    err.status = 503;\n    throw err;\n  }\n  const provided = String(request.headers.get(\"X-Telegram-Bot-Api-Secret-Token\") || \"\").trim();\n  if (!provided || provided !== configured) {\n    const err = new Error(\"Webhook Telegram no autorizado\");\n    err.status = 401;\n    throw err;\n  }\n}"
  },
  {
    "name": "dedupe",
    "before": "  const updateId = update?.update_id != null ? String(update.update_id).trim() : \"\";\n  if (updateId) {\n    const dedupeKey = telegramUpdateDedupeKey(updateId);\n    if (await wasInboundEventProcessed(env, dedupeKey)) {\n      return json2({\n        ok: true,\n        duplicate: true,\n        update_id: updateId\n      });\n    }\n    await markInboundEventProcessed(\n      env,\n      dedupeKey,\n      TELEGRAM_UPDATE_DEDUPE_TTL_SECONDS\n    ).catch(() => null);\n  }\n",
    "after": "  const updateId = update?.update_id != null ? String(update.update_id).trim() : \"\";\n  if (updateId) {\n    const dedupeKey = telegramUpdateDedupeKey(updateId);\n    if (await wasInboundEventProcessed(env, dedupeKey)) {\n      return json2({\n        ok: true,\n        duplicate: true,\n        update_id: updateId\n      });\n    }\n  }\n"
  },
  {
    "name": "command",
    "before": "  const command = extractTelegramCommand(message?.text || \"\");\n  if (command.kind === \"start\") {\n",
    "after": "  const command = extractTelegramCommand(message?.text || \"\");\n  if (command.kind !== \"start\" && updateId) {\n    await markInboundEventProcessed(\n      env,\n      telegramUpdateDedupeKey(updateId),\n      TELEGRAM_UPDATE_DEDUPE_TTL_SECONDS\n    ).catch(() => null);\n  }\n  if (command.kind === \"start\") {\n"
  },
  {
    "name": "start_confirmation",
    "before": "    const prev = await getTelegramState(env, userId) || {};\n    const prefs2 = await obtenerPreferenciasUsuario(env, userId).catch(() => null);\n    const next = await saveTelegramState(env, userId, {\n      connected: true,\n      chat_id: chatId,\n      username: String(message?.from?.username || \"\").trim(),\n      first_name: String(message?.from?.first_name || \"\").trim(),\n      connected_at: prev.connected_at || (/* @__PURE__ */ new Date()).toISOString(),\n      alerts_requested: !!prefs2?.alertas_telegram,\n      alerts_enabled: !!entitlement2?.allowed,\n      last_inbound_at: (/* @__PURE__ */ new Date()).toISOString()\n    });\n    await sendTelegramText(\n      env,\n      chatId,\n      \"\\u2705 APDocentePBA conect\\xF3 este chat con tu cuenta.\\n\\nEscrib\\xED ALERTAS cuando quieras consultar tus ofertas compatibles.\"\n    ).catch(() => null);\n    return json2({\n      ok: true,\n      connected: true,\n      user_id: userId,\n      state: next\n    });\n  }\n",
    "after": "    const prev = await getTelegramState(env, userId) || {};\n    const prefs2 = await obtenerPreferenciasUsuario(env, userId).catch(() => null);\n    // Confirm bot delivery before persisting a linked state.\n    await sendTelegramText(\n      env,\n      chatId,\n      \"\\u2705 APDocentePBA conect\\xF3 este chat con tu cuenta.\\n\\nEscrib\\xED ALERTAS cuando quieras consultar tus ofertas compatibles.\"\n    );\n    const next = await saveTelegramState(env, userId, {\n      connected: true,\n      chat_id: chatId,\n      username: String(message?.from?.username || \"\").trim(),\n      first_name: String(message?.from?.first_name || \"\").trim(),\n      connected_at: prev.connected_at || (/* @__PURE__ */ new Date()).toISOString(),\n      alerts_requested: !!prefs2?.alertas_telegram,\n      alerts_enabled: !!entitlement2?.allowed,\n      last_inbound_at: (/* @__PURE__ */ new Date()).toISOString()\n    });\n    if (updateId) {\n      await markInboundEventProcessed(\n        env,\n        telegramUpdateDedupeKey(updateId),\n        TELEGRAM_UPDATE_DEDUPE_TTL_SECONDS\n      ).catch(() => null);\n    }\n    return json2({\n      ok: true,\n      connected: true,\n      user_id: userId,\n      state: next\n    });\n  }\n"
  },
  {
    "name": "detail_send",
    "before": "    const reply = buildTelegramQueryDigest(visibleAlertsForRender);\n    try {\n      await sendTelegramLongText(env, chatId, reply);\n    } catch (err) {\n",
    "after": "    const reply = buildTelegramQueryDigest(visibleAlertsForRender);\n    let telegramDetailDelivered = false;\n    try {\n      await sendTelegramLongText(env, chatId, reply);\n      telegramDetailDelivered = true;\n    } catch (err) {\n"
  },
  {
    "name": "detail_result",
    "before": "    return json2({\n      ok: true,\n      delivered: true,\n      total_alerts: alerts.length,\n      shown_alerts: visibleAlerts.length,\n      source,\n      plan_code: entitlement?.plan_code || null,\n",
    "after": "    return json2({\n      ok: true,\n      delivered: telegramDetailDelivered,\n      total_alerts: alerts.length,\n      shown_alerts: visibleAlerts.length,\n      source,\n      plan_code: entitlement?.plan_code || null,\n"
  },
  {
  "name": "secure_link_token_issuance",
  "before": "function buildTelegramBotLink(env, userId) {\n  const username = String(env.TELEGRAM_BOT_USERNAME || \"\").trim().replace(/^@+/, \"\");\n  const normalizedUserId = String(userId || \"\").trim();\n  if (!username || !normalizedUserId) return \"\";\n  return `https://t.me/${encodeURIComponent(username)}?start=${encodeURIComponent(normalizedUserId)}`;\n}",
  "after": "// Links are issued only by authenticated endpoints, never from public user IDs.\nfunction telegramLinkKey(code) {\n  return \"telegram:link:\" + String(code || \"\").trim().toLowerCase();\n}\nasync function issueTelegramLinkCode(env, userId) {\n  const kv = getChannelStateStore(env);\n  if (!kv || !userId || !env.TELEGRAM_BOT_USERNAME) return \"\";\n  const code = \"apd_\" + crypto.randomUUID().replace(/-/g, \"\");\n  await kv.put(telegramLinkKey(code), String(userId).trim().toUpperCase(), {\n    expirationTtl: 600\n  });\n  return code;\n}\nfunction buildTelegramBotLink(env, code) {\n  const username = String(env.TELEGRAM_BOT_USERNAME || \"\").trim().replace(/^@+/, \"\");\n  const safeCode = /^apd_[0-9a-f]{32}$/.test(String(code || \"\")) ? String(code) : \"\";\n  if (!username || !safeCode) return \"\";\n  return `https://t.me/${encodeURIComponent(username)}?start=${safeCode}`;\n}"
},
  {
  "name": "status_issue_authenticated_nonce",
  "before": "    bot_link: buildTelegramBotLink(env, user.id)",
  "after": "    bot_link: buildTelegramBotLink(env, await issueTelegramLinkCode(env, user.id))"
},
  {
  "name": "preferences_do_not_issue_anonymous_link",
  "before": "      bot_link: buildTelegramBotLink(env, userId)",
  "after": "      bot_link: buildTelegramBotLink(env, (await getSessionUserByBearer(env, request).catch(() => null))?.id === userId ? await issueTelegramLinkCode(env, userId) : \"\")"
},
  {
  "name": "start_payload_requires_nonce",
  "before": "    const userId = String(command.payload || \"\").trim();\n    const validStartPayload = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId);",
  "after": "    const linkCode = String(command.payload || \"\").trim();\n    const validStartPayload = /^apd_[0-9a-f]{32}$/.test(linkCode);"
},
  {
  "name": "start_resolve_token",
  "before": "    const entitlement2 = await resolveTelegramEntitlement(env, userId);\n    const prev = await getTelegramState(env, userId) || {};",
  "after": "    const kv = getChannelStateStore(env);\n    const userId = String(await kv?.get(telegramLinkKey(linkCode)) || \"\").trim().toUpperCase();\n    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {\n      await sendTelegramText(env, chatId, \"El enlace de Telegram expiró o ya fue utilizado. Volvé al panel de AlertasAPD para generar uno nuevo.\").catch(() => null);\n      return json2({ ok: true, connected: false, reason: \"telegram_link_expired_or_used\" });\n    }\n    const entitlement2 = await resolveTelegramEntitlement(env, userId);\n    const prev = await getTelegramState(env, userId) || {};"
},
  {
  "name": "start_consume_token_after_success",
  "before": "    if (updateId) {\n      await markInboundEventProcessed(\n        env,\n        telegramUpdateDedupeKey(updateId),\n        TELEGRAM_UPDATE_DEDUPE_TTL_SECONDS\n      ).catch(() => null);\n    }\n    return json2({\n      ok: true,\n      connected: true,\n      user_id: userId,\n      state: next\n    });",
  "after": "    await kv.delete(telegramLinkKey(linkCode));\n    if (updateId) {\n      await markInboundEventProcessed(\n        env,\n        telegramUpdateDedupeKey(updateId),\n        TELEGRAM_UPDATE_DEDUPE_TTL_SECONDS\n      ).catch(() => null);\n    }\n    return json2({\n      ok: true,\n      connected: true,\n      user_id: userId,\n      state: next\n    });"
}
];

export function buildTelegramCandidate(source) {
  if (typeof source !== 'string' || source.length < 100000) {
    throw new Error('Unverified Worker snapshot');
  }
  let candidate = source;
  for (const patch of patches) {
    if (candidate.split(patch.before).length !== 2) {
      throw new Error('Snapshot drift or duplicate anchor: ' + patch.name);
    }
    candidate = candidate.replace(patch.before, patch.after);
  }
  return candidate;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const baseline = fs.readFileSync('worker-live/worker_hotfix.js', 'utf8');
  const candidate = buildTelegramCandidate(baseline);
  const target = path.join('tmp','apd-telegram-webhook-candidate.js');
  fs.mkdirSync(path.dirname(target), {recursive:true});
  fs.writeFileSync(target,candidate,'utf8');
  console.log('APD_TELEGRAM_CANDIDATE_READY ' + JSON.stringify({
    location:target,
    sourceBytes:baseline.length,
    candidateBytes:candidate.length,
    changes:patches.map(p=>p.name),
    productionChanged:false
  }));
}
