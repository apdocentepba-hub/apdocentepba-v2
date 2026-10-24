import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const sql=fs.readFileSync("docs/sql/APD_REACTIVACION_PREVIEW_SOLO_LECTURA.sql","utf8");
const copy=fs.readFileSync("docs/APD_REACTIVACION_EMAIL_BORRADOR_20261022.md","utf8");
const report=fs.readFileSync("docs/APD_REACTIVACION_SEGMENTOS_20261022.md","utf8");

test("cohort review is read-only and contains no recipient identities",()=>{
 const cleaned=sql.replace(/--[^\n]*/g,"");
 assert.doesNotMatch(cleaned,/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|COPY|CALL|EXECUTE)\b/i);
 assert.match(cleaned,/\bSELECT\b/i);
 assert.match(sql,/false AS envio_autorizado/);
 assert.match(sql,/0::integer AS envios_habilitados/);
 assert.doesNotMatch(cleaned,/\bSELECT\s+[^;]*\bemail\s+AS\s+recipient/si);
 assert.match(sql,/NOT x\.vigente/);
 assert.match(sql,/NOT x\.excepcion/);
 assert.match(sql,/s\.source='manual_admin_grant'/);
 assert.match(sql,/upper\(s\.plan_code\)='TRIAL_7D'/);
 assert.match(sql,/aviso_previo/);
});

test("copy is promotional and blocks sending until real unsubscribe exists",()=>{
 assert.match(copy,/BORRADORES, NO ENVIAR/);
 assert.match(copy,/DRAFT \/ SEND_BLOCKED/);
 assert.match(copy,/Publicidad \|/);
 assert.match(copy,/falta implementar/);
 assert.match(copy,/cancel|baja|dejar de recibir/i);
 assert.match(copy,/alertasapd\.com\.ar/);
 assert.match(copy,/consentimiento_datos/);
});

test("audience counts are explicit and do not authorize 43 sends",()=>{
 assert.match(report,/43/);
 assert.match(report,/39/);
 assert.match(report,/11/);
 assert.match(report,/29/);
 assert.match(report,/3/);
 assert.match(report,/0 envíos/);
 assert.match(report,/no se enviaron/i);
});
