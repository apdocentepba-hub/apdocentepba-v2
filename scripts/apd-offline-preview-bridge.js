/* Offline-only APDocentePBA visual preview, zero backend connections. */
(()=>{"use strict";
 const sections=["inicio","login","registro","panel-docente"];
 const show=id=>{
  if(!sections.includes(id))return;
  for(const section of sections){
   const node=document.getElementById(section);
   if(node)node.classList.toggle("hidden",section!==id);
  }
  const name={inicio:"Portada",login:"Ingreso",registro:"Registro","panel-docente":"Panel ilustrativo"}[id];
  const status=document.getElementById("apd-preview-current");
  if(status)status.textContent="Vista: "+name+" · Datos ficticios · Sin conexión";
  window.scrollTo?.(0,0);
 };
 // Deliberately never provide real auth or Worker functionality.
 document.querySelectorAll("[data-apd-preview-section]").forEach(button=>{
  button.addEventListener("click",()=>show(button.dataset.apdPreviewSection));
 });
 const pairs=[
  ["btnLogin","login"],["btnRegistro","registro"],
  ["btnMiPanel","panel-docente"]
 ];
 for(const [id,target] of pairs){
  document.getElementById(id)?.addEventListener("click",()=>show(target));
 }
 document.querySelector("#inicio .apd-v3-cta")?.addEventListener("click",()=>show("login"));
 document.querySelector("#inicio .apd-v3-cta-secondary")?.addEventListener("click",()=>show("registro"));
 document.querySelector("#registro .link-btn")?.addEventListener("click",()=>show("login"));
 document.querySelector("#login .link-btn")?.addEventListener("click",()=>show("registro"));
 document.addEventListener("click",event=>{
  const anchor=event.target.closest?.("a");
  if(!anchor)return;
  event.preventDefault();
  const href=anchor.getAttribute("href");
  if(href==="#login")show("login");
  else if(href==="#registro")show("registro");
  else {
   const note=document.getElementById("apd-preview-current");
   if(note)note.textContent="Enlace deshabilitado: esta es una vista previa sin red";
  }
 },true);
 document.addEventListener("submit",event=>{
  event.preventDefault();
  event.stopImmediatePropagation();
  const id=event.target?.id;
  const target=id==="form-registro"?"registro-msg":
    id==="form-login"?"login-msg":null;
  const label=target?document.getElementById(target):null;
  if(label)label.textContent="Demostración visual: no se envió ningún dato.";
 },true);
 document.querySelectorAll(".pw-toggle").forEach(button=>{
  button.addEventListener("click",()=>{
   const field=document.getElementById(button.dataset.target);
   if(field)field.type=field.type==="password"?"text":"password";
  });
 });
 const demo={
  "panel-bienvenida":"Panel de ejemplo · sin datos reales",
  "panel-subtitulo":"Vista de diseño. Las ofertas auténticas solo se consultan con una sesión autorizada.",
  "panel-preferencias-resumen":"Distrito ficticio: DEMO · Cargo ficticio: DOCENTE DEMO",
  "panel-alertas":'<article style="padding:14px;border:1px dashed #4b8a9a;border-radius:14px"><strong>ALERTA FICTICIA</strong><p>Distrito: DEMO · Cargo: EJEMPLO</p><p>Esta pantalla no muestra ofertas de ABC.</p></article>',
  "panel-estadisticas":"Sin estadísticas: demostración visual offline",
  "panel-historial":"Sin historial en esta demostración"
 };
 for(const [id,value] of Object.entries(demo)){
  const node=document.getElementById(id);
  if(!node)continue;
  if(id==="panel-alertas")node.innerHTML=value;
  else node.textContent=value;
 }
 show("inicio");
})();