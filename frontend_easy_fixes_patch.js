// PATCH EXTRA FINAL
(function(){
  // 🔹 FORZAR SELECT (SIN ESCRITURA)
  const IDS = [
    'pref-distrito-principal','pref-segundo-distrito','pref-tercer-distrito',
    'pref-cargo-1','pref-cargo-2','pref-cargo-3','pref-cargo-4','pref-cargo-5',
    'pref-cargo-6','pref-cargo-7','pref-cargo-8','pref-cargo-9','pref-cargo-10'
  ];

  IDS.forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;

    // bloquear escritura
    el.setAttribute('readonly', true);

    // abrir lista al click
    el.addEventListener('click', ()=>{
      el.dispatchEvent(new Event('focus'));
    });
  });

  // 🔹 PASSWORD: STACK VERTICAL (NO SE ROMPE MÁS)
  const style = document.createElement('style');
  style.innerHTML = `
    #form-mi-password .grid-2 {
      grid-template-columns: 1fr !important;
    }
  `;
  document.head.appendChild(style);
})();