import assert from 'node:assert/strict';
import fs from 'node:fs';

const calc = fs.readFileSync(new URL('../assets/js/calculadora-haberes-pba.js', import.meta.url), 'utf8');
const landing = fs.readFileSync(new URL('../haberes-docentes.html', import.meta.url), 'utf8');

assert.match(
  calc,
  /AP_DOCENTE_HABERES_CARGOS_PBA_2026_04\s*\|\|\s*window\.AP_DOCENTE_HABERES_CARGOS_SUTEBA_2026_4/,
  'calculator must prefer the current PBA cargo dataset while preserving the legacy fallback'
);
assert.match(calc, /ALIAS_CARGO/, 'calculator must define real-world cargo search aliases');
assert.match(calc, /\bematp\b/i, 'calculator search must recognize EMATP');
assert.match(calc, /\bjmatp\b/i, 'calculator search must recognize JMATP');
assert.match(calc, /textoBusquedaCargo/, 'cargo filtering must include alias-expanded search text');

assert.doesNotMatch(
  landing,
  /Calculadora en planificación|calculadora futura|Ver plan/i,
  'haberes landing must not describe the working calculator as a future plan'
);
assert.match(
  landing,
  /Abrir calculadora/,
  'haberes landing must expose the active calculator with a direct action'
);
assert.match(
  landing,
  /calculadora-haberes-docentes\.html/,
  'haberes landing must link to the active calculator'
);

console.log('haberes calculator active contract: OK');
