// Online-only install enhancement. No caching, credentials, tracking or push.
(function () {
  "use strict";
  const button = document.getElementById("apd-pwa-install");
  const note = document.getElementById("apd-pwa-note");
  if (!button || !note) return;
  let pending = null;
  let busy = false;
  const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const say = (message) => { note.textContent = message; note.hidden = false; };
  const installed = () => { pending = null; button.hidden = true; note.hidden = true; };
  if (standalone()) { installed(); return; }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    pending = event;
  });
  window.addEventListener("appinstalled", installed);
  button.addEventListener("click", async () => {
    if (busy || standalone() || button.hidden) return;
    const prompt = pending;
    pending = null;
    if (!prompt) {
      say("En Android: menú de Chrome → Instalar aplicación o Agregar a pantalla principal. En iPhone: Safari → Compartir → Agregar a inicio. Necesitás conexión para consultar ofertas.");
      return;
    }
    busy = true;
    button.disabled = true;
    try {
      await prompt.prompt();
      const result = await prompt.userChoice;
      if (result?.outcome === "accepted") say("Solicitud de instalación aceptada. La confirmación depende de tu navegador.");
      else say("Podés instalarla cuando quieras desde el menú del navegador.");
    } catch {
      say("No se pudo abrir la instalación. Usá el menú del navegador.");
    } finally {
      if (button.hidden || standalone()) installed();
      button.disabled = false;
      busy = false;
    }
  });
})();
