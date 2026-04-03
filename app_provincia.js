'use strict';
console.log('APP_PROVINCIA_MINIMO_CARGADO');

function removeProvinciaPanelCardByContentId(contentId) {
  const content = document.getElementById(contentId);
  const card = content?.closest('.panel-card');
  if (card) card.remove();
}

function removeUnusedProvinciaPanels() {
  removeProvinciaPanelCardByContentId('panel-canales');
  removeProvinciaPanelCardByContentId('panel-backfill-provincia');
  removeProvinciaPanelCardByContentId('panel-historial');
  removeProvinciaPanelCardByContentId('panel-historico-apd');
  removeProvinciaPanelCardByContentId('panel-radar-provincia');
}

async function cargarExtrasProvincia() {
  removeUnusedProvinciaPanels();
}

window.cargarExtrasProvincia = cargarExtrasProvincia;

document.addEventListener('DOMContentLoaded', () => {
  removeUnusedProvinciaPanels();
});
