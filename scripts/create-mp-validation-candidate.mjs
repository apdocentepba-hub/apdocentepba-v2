// Isolated validation candidate; never deploys, sends messages, or modifies live Worker.
import fs from "node:fs";
import path from "node:path";
const input = "worker-live/worker_hotfix.js";
const output = "tmp/mp-validation-candidate/worker_hotfix.js";
let source = fs.readFileSync(input,"utf8");
function replaceUnique(oldText,newText,label) {
  if (source.split(oldText).length !== 2) throw Error("Unknown canonical Worker source: " + label);
  source = source.replace(oldText,newText);
}
const verifier = [
'async function apdVerifyMercadoPagoWebhookV1(request,payload,env) {',
'  const secret=String(env.MERCADOPAGO_WEBHOOK_SECRET||"").trim();',
'  const header=String(request.headers.get("x-signature")||"");',
'  const requestId=String(request.headers.get("x-request-id")||"").trim();',
'  const params=new URL(request.url).searchParams;',
'  const dataId=String(params.get("data.id")||"").trim().toLowerCase();',
'  const bodyId=String(payload?.data?.id||"").trim().toLowerCase();',
'  if(!dataId||!bodyId||dataId!==bodyId)return false;',
'  const entries=header.split(",").map(part=>{const i=part.indexOf("=");return i<1?["",""]:[part.slice(0,i).trim(),part.slice(i+1).trim()];});',
'  const parts=Object.fromEntries(entries);',
'  const ts=String(parts.ts||"").trim();',
'  const expected=String(parts.v1||"").trim().toLowerCase();',
'  if(!secret||!requestId||!dataId||!/^[0-9]{10,13}$/.test(ts)||!/^[0-9a-f]{64}$/.test(expected))return false;',
'  const seconds=Number(ts)/((ts.length>=13)?1000:1);',
'  if(!Number.isFinite(seconds)||Math.abs(Date.now()/1000-seconds)>300)return false;',
'  const manifest="id:"+dataId+";request-id:"+requestId+";ts:"+ts+";";',
'  const encoder=new TextEncoder();',
'  const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);',
'  const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(manifest)));',
'  let diff=0;',
'  for(let i=0;i<bytes.length;i++)diff|=bytes[i]^Number.parseInt(expected.slice(i*2,i*2+2),16);',
'  return diff===0;',
'}'
].join("\n");
replaceUnique("async function handleMercadoPagoWebhook(request, env) {",verifier+"\nasync function handleMercadoPagoWebhook(request, env) {","webhook signature function");
const afterParse='  const topic = String(payload?.type || payload?.topic || payload?.action || "").trim() || null;';
replaceUnique(afterParse,
  '  if (!(await apdVerifyMercadoPagoWebhookV1(request, payload, env))) {\n' +
  '    return json({ok:false,message:"Notificación de pago no autenticada"},401);\n' +
  '  }\n' + afterParse,
  "verification before database insert");
replaceUnique(
  '  const userId = String(session?.user_id || parsedRef.user_id || "").trim();\n' +
  '  const planCode = String(session?.plan_code || parsedRef.plan_code || "").trim().toUpperCase();',
  '  if (!session?.id || !session?.user_id || !session?.plan_code) {\n' +
  '    return {processed:false,reason:"checkout_session_not_found"};\n' +
  '  }\n' +
  '  const userId = String(session.user_id).trim();\n' +
  '  const planCode = canonicalPlanCode(session.plan_code);\n' +
  '  if (userId !== String(parsedRef.user_id).trim() || planCode !== canonicalPlanCode(parsedRef.plan_code)) {\n' +
  '    return {processed:false,reason:"checkout_reference_mismatch"};\n' +
  '  }',
  "exact existing checkout before subscription writes");
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,source);
console.log("MP candidate generated without deploying or processing payments.");
