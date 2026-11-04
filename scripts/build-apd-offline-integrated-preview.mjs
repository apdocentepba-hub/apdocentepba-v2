/* APDocentePBA offline-only visual integration.
 * Never generate a deployable build or bundle production JS/API clients.
 */
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from "node:fs";
import path from "node:path";
const source=readFileSync("index.html","utf8");
const bridge="scripts/apd-offline-preview-bridge.js";
const priority="scripts/apd-panel-first-alert-layout-lab.js";
const out="tmp/apd-integrated-offline-preview";
if(!existsSync(bridge))throw Error("Preview UI bridge missing");
if(!existsSync(priority))throw Error("Prioritized alerts script missing");
if(!source.includes('id="login"')||!source.includes('id="registro"')||
 !source.includes('id="panel-docente"')||
 !source.includes("public-landing-v3.css"))
 throw Error("Expected v3 login, registration, panel and CSS not found");
// Remove ALL production scripts, inline code, inline event handlers and
// external preconnections. Preserve the visual HTML and local CSS only.
let html=source
 .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,"")
 .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi,"")
 .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi,"")
 .replace(/<link\b[^>]*>/gi,tag=>{
  const href=tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
  return /\brel\s*=\s*["']stylesheet["']/i.test(tag) &&
   href && !/^https?:\/\//i.test(href) ?tag:"";
 });
const css=[];
for(const match of html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)){
 const href=match[0].match(/\bhref=["']([^"']+)["']/i)?.[1];
 if(!href)throw Error("Missing stylesheet URL");
 const local=href.split("?")[0].replace(/^\.\//,"");
 if(!/^[a-z0-9_-]+\.css$/i.test(local)||!existsSync(local))
  throw Error("Nonlocal or missing CSS in offline preview: "+local);
 css.push(local);
}
if(!css.includes("public-landing-v3.css"))throw Error("Missing v3 stylesheet");
const csp='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:; font-src \'self\' data:; connect-src \'none\'; form-action \'none\'; base-uri \'none\'; object-src \'none\';">';
html=html.replace("<head>","<head>\n"+csp+"\n<meta name=\"referrer\" content=\"no-referrer\">");
const banner=[
 '<div id="apd-preview-banner" role="status" style="position:relative;z-index:9999;padding:12px 18px;background:#092e43;color:#fff;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font:600 13px system-ui,sans-serif">',
 '<span id="apd-preview-current">Vista previa offline · Datos ficticios · Sin conexión</span>',
 '<nav aria-label="Pantallas de vista previa" style="display:flex;gap:8px;flex-wrap:wrap">',
 '<button type="button" data-apd-preview-section="inicio">Portada</button>',
 '<button type="button" data-apd-preview-section="login">Ingreso</button>',
 '<button type="button" data-apd-preview-section="registro">Registro</button>',
 '<button type="button" data-apd-preview-section="panel-docente">Panel ilustrativo</button>',
 '</nav><span style="font-weight:400">No ingreses credenciales reales. No funciona el login ni se envían formularios.</span></div>'
].join("");
html=html.replace("<body>","<body>\n"+banner);
html=html.replace("</body>",'<script src="apd-panel-first-alert-layout-lab.js"></script>\n<script src="apd-offline-preview-bridge.js"></script>\n</body>');
if(/<script\b[^>]*src=["'](?!(?:apd-offline-preview-bridge|apd-panel-first-alert-layout-lab)\.js)[^"']+["']/i.test(html))
 throw Error("Unexpected production JavaScript remains");
if(/\s+on(?:click|load|submit|error)\s*=/i.test(html))
 throw Error("Inline action handler remains");
if(/<link\b[^>]*href=["']https?:\/\//i.test(html))
 throw Error("Remote stylesheet remains");
if(!html.includes("connect-src 'none'")||!html.includes("form-action 'none'"))
 throw Error("Preview CSP protection missing");
mkdirSync(out,{recursive:true});
writeFileSync(path.join(out,"index.html"),html);
for(const file of [...new Set(css)])copyFileSync(file,path.join(out,file));
copyFileSync(bridge,path.join(out,"apd-offline-preview-bridge.js"));
copyFileSync(priority,path.join(out,"apd-panel-first-alert-layout-lab.js"));
writeFileSync(path.join(out,"LEEME.txt"),[
 "APDOCENTEPBA — Vista previa v3 + panel ilustrativo (SIN CONEXION)",
 "Abrí index.html con el navegador. Elegí Portada, Ingreso, Registro o Panel ilustrativo.",
 "Los datos del panel son completamente inventados.",
 "Las alertas se muestran antes que los bloques secundarios y las promociones.",
 "No ingreses correos, contraseñas ni datos personales reales.",
 "Los formularios y los enlaces externos están deshabilitados.",
 "No incluye el motor ABC, Worker, autenticación ni las mejoras de rendimiento ejecutables.",
 "El PR integra visualmente el diseño y ejecuta por separado las pruebas de rendimiento.",
 "Este ZIP NO es un paquete para instalar ni subir a producción."
].join("\n")+"\n");
console.log(JSON.stringify({proof:"apd_integrated_offline_visual_preview",
 directory:out,files:css.length+4,contains_production_runtime_js:false,
 csp_blocks_network:true,forms_disabled:true,
 integration_scope:"public redesign + visually navigable mock, no real auth",
 no_deployment:true}));
