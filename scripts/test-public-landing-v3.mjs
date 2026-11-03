import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync("index.html","utf8");
const css=readFileSync("public-landing-v3.css","utf8");
const extract=(id)=>{
 const start=html.indexOf('<section id="'+id+'"');
 const end=html.indexOf("</section>",start);
 assert.ok(start>=0&&end>start,"Missing section "+id);
 return html.slice(start,end+10);
};
const landing=extract("inicio"),login=extract("login"),registration=extract("registro");
test("public homepage has dashboard-matched structural preview, no fake offer or fake counts",()=>{
 assert.match(landing,/apd-v3-hero/);
 assert.match(landing,/VISTA DE EJEMPLO/);
 assert.match(landing,/No contiene ofertas reales|Sin ofertas ni datos reales/);
 assert.match(landing,/id="apd-public-title"/);
 assert.match(landing,/alertas que coincidan con tus preferencias/);
 assert.match(landing,/verificá siempre la vigencia y la postulación en ABC/);
 assert.doesNotMatch(landing,/\b(?:[1-9][0-9]{3,})\s*(?:docentes|alertas|ofertas|usuarios)\b/i);
});
test("auth forms and Google Sign-In mount targets exist exactly once",()=>{
 for(const id of ["form-login","form-registro","login-email","login-password",
  "reg-nombre","reg-apellido","reg-email","reg-celular","reg-password",
  "reg-acepta-legal","login-msg","registro-msg",
  "google-btn-login","google-btn-registro","btnLogin","btnRegistro",
  "navPublico","navPrivado","panel-docente"]){
  assert.equal(html.match(new RegExp('id="'+id+'"',"g"))?.length,1,"Missing/duplicate "+id);
 }
 assert.match(login,/<form id="form-login" novalidate>/);
 assert.match(registration,/<form id="form-registro" novalidate>/);
 assert.match(login,/autocomplete="current-password"/);
 assert.match(registration,/autocomplete="new-password"/);
 assert.match(registration,/id="reg-acepta-legal"/);
 assert.match(login,/id="google-btn-login"/);
 assert.match(registration,/id="google-btn-registro"/);
});
test("login and registration retain original JS navigation contracts",()=>{
 assert.match(landing,/mostrarSeccion\('login'\)/);
 assert.match(landing,/mostrarSeccion\('registro'\)/);
 assert.match(login,/mostrarSeccion\('registro'\)/);
 assert.match(registration,/mostrarSeccion\('login'\)/);
 assert.match(html,/auth_session_patch\.js\?v=3/);
 assert.match(html,/apd_ui_v21\.js\?v=20261102-clean/);
 assert.match(html,/id="panel-docente" class="section hidden"/);
});
test("new CSS is isolated and loaded after old CSS, before application JavaScript",()=>{
 const previous=html.indexOf('href="apd_ui_v21.css');
 const visual=html.indexOf('href="public-landing-v3.css?v=20261103"');
 const app=html.indexOf('src="app_v2.js');
 assert.ok(previous>=0&&visual>previous&&app>visual);
 assert.match(css,/#inicio\.apd-public-v3/);
 assert.match(css,/#login\.apd-auth-v3/);
 assert.match(css,/#registro\.apd-auth-v3/);
 assert.ok(!css.includes("#panel-docente{"),"Must not style private panel directly");
 assert.ok(css.includes("body:has(#panel-docente.hidden) .apd-v21-sidebar"),"Public-only private nav rule required");
});
test("buttons/links have semantic accessible controls and non-misleading wording",()=>{
 assert.match(landing,/type="button" class="btn btn-primary apd-v3-cta"/);
 assert.match(landing,/href="\.\/herramientas\.html"/);
 assert.match(login,/type="email" id="login-email"/);
 assert.match(login,/type="password" id="login-password"/);
 assert.match(registration,/type="email" id="reg-email"/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css, /prefers-reduced-motion:reduce/);
});
test("strict rollback requires only stylesheet and these three HTML sections",()=>{
 assert.ok(!html.includes('src="public-landing-v3.js"'));
 assert.ok(html.includes('class="section hidden apd-auth-v3"'));
 assert.equal((html.match(/class="section hidden apd-auth-v3"/g)||[]).length,2);
});
