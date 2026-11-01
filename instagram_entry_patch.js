/* APDocente: acceso de un clic desde campañas, sin cookies ni analítica nueva. */
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var action = params.get('apd');
  if (action !== 'login' && action !== 'registro') return;

  function openAction() {
    try {
      var hasSession = typeof window.obtenerToken === 'function' && !!window.obtenerToken();

      // Un docente que ya inició sesión no debe quedar inmóvil en la portada
      // al seguir un enlace de registro o ingreso compartido en Instagram.
      if (hasSession) {
        if (typeof window.cargarDashboard === 'function') {
          Promise.resolve(window.cargarDashboard()).catch(function (error) {
            console.warn('No se pudo cargar el panel desde el enlace.', error);
          });
        } else if (typeof window.mostrarSeccion === 'function') {
          window.mostrarSeccion('panel-docente');
        }
        return;
      }

      if (typeof window.mostrarSeccion !== 'function') return;
      var target = document.getElementById(action);
      if (!target) return;
      window.mostrarSeccion(action);
    } catch (error) {
      console.warn('No se pudo abrir la sección solicitada.', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', openAction, { once: true });
  } else {
    openAction();
  }
})();
