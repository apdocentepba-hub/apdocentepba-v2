/* En radar_provincia_patch_semaforo.js */

async function obtenerHistoricoRadarPersonal(userId, days = 30) {
  return workerFetchJson(`/api/historico-radar-personal?user_id=${encodeURIComponent(userId)}&days=${encodeURIComponent(days)}`);
}

/* Reemplazar dentro de loadPersonalRadar() */
const data = await obtenerHistoricoRadarPersonal(token, 30);

/* Agregar dentro del render del radar personal */
function renderComparativaPersonal(data) {
  const share = data?.comparativa?.share_vs_provincia_pct;
  const activasProvincia = data?.comparativa?.activas_provincia;
  return `
    <div class="radar-box" style="margin-bottom:12px;">
      <h5 class="radar-section-title" style="font-size:14px;margin-bottom:8px;">Tu radar vs provincia</h5>
      <ul class="radar-list">
        <li class="radar-item"><span>Activas en tu radar</span><strong>${fmtNum(data?.activas_estimadas || 0)}</strong></li>
        <li class="radar-item"><span>Activas en provincia</span><strong>${fmtNum(activasProvincia || 0)}</strong></li>
        <li class="radar-item"><span>Peso de tus filtros</span><strong>${share != null ? `${fmtNum(share, 1)}%` : '-'}</strong></li>
      </ul>
    </div>
  `;
}

/* Insertar arriba de 'Tu radar según preferencias' */
${renderComparativaPersonal(data)}
