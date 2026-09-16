import fs from 'node:fs';

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw new Error('usage: node scripts/patch-live-email-cron-isolation.mjs <input> <output>');

let source = fs.readFileSync(input, 'utf8');

const scheduledHead = `async scheduled(event, env, ctx) {\n  ctx.waitUntil(runObservedProvinciaBackfill(env, event));\n  const emailCronStartedAt = new Date().toISOString();`;
const isolatedHead = `async scheduled(event, env, ctx) {\n  // EMAIL_CRON_ISOLATION_V1: provincial maintenance is intentionally not run in digest cron.\n  // The provincial backfill currently depends on a missing table and must be scheduled separately.\n  const emailCronStartedAt = new Date().toISOString();`;

if (!source.includes(scheduledHead)) throw new Error('scheduled head marker not found');
source = source.replace(scheduledHead, isolatedHead);

const oldSweep = `  const result = await runEmailAlertsSweep(env, {\n    source: "cron_slot",\n    slot_key: activeSlotKey,\n    max_users:\n      env.EMAIL_DIGEST_BATCH_USERS_PER_RUN ||\n      env.EMAIL_DIGEST_MAX_USERS_PER_RUN ||\n      80\n  });\n\n  console.log("CRON EMAIL SWEEP RESULT", JSON.stringify(result || {}));\n  ctx.waitUntil(recordObservedEmailCron(env, emailCronStartedAt, result, activeSlotKey));`;

const newSweep = `  let result = null;\n  try {\n    result = await runEmailAlertsSweep(env, {\n      source: "cron_slot",\n      slot_key: activeSlotKey,\n      max_users:\n        env.EMAIL_DIGEST_BATCH_USERS_PER_RUN ||\n        env.EMAIL_DIGEST_MAX_USERS_PER_RUN ||\n        80\n    });\n  } catch (err) {\n    const failureResult = {\n      ok: false,\n      finished: false,\n      processed_users: 0,\n      send_attempts: 0,\n      sent_count: 0,\n      skipped_count: 0,\n      failed_count: 1,\n      failed_samples: [{\n        user_id: null,\n        reason: "sweep_unhandled",\n        error: String(err?.message || err || "").slice(0, 500)\n      }]\n    };\n    console.error("CRON EMAIL SWEEP UNHANDLED", err);\n    ctx.waitUntil(recordObservedEmailCron(env, emailCronStartedAt, failureResult, activeSlotKey));\n    return;\n  }\n\n  console.log("CRON EMAIL SWEEP RESULT", JSON.stringify(result || {}));\n  ctx.waitUntil(recordObservedEmailCron(env, emailCronStartedAt, result, activeSlotKey));`;

if (!source.includes(oldSweep)) throw new Error('scheduled sweep marker not found');
source = source.replace(oldSweep, newSweep);

fs.writeFileSync(output, source);
console.log('live email cron isolation patch applied');
