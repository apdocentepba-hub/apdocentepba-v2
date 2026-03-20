document.addEventListener("DOMContentLoaded", () => {

  // Formularios
  document.getElementById("form-registro")?.addEventListener("submit", registrarDocente);
  document.getElementById("form-login")?.addEventListener("submit", loginPassword);
  document.getElementById("form-preferencias")?.addEventListener("submit", guardarPreferencias);

  // Logout
  document.getElementById("btn-logout")?.addEventListener("click", logout);

  // ... todo lo que ya tenías ...

  actualizarNav();

  if (obtenerToken()) {
    cargarDashboard();
  } else {
    mostrarSeccion("inicio");
  }

  // 👇 AGREGÁ ESTO
  cargarUsuarios();

});
