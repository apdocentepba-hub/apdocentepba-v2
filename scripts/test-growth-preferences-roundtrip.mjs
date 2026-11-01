import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../app_v2.js', import.meta.url), 'utf8');
function exactSection(first, next) {
  const start=source.indexOf(first);
  assert.ok(start >= 0, 'Se encontró '+first);
  const stop=source.indexOf(next,start+first.length);
  assert.ok(stop>start, 'Se encontró el siguiente bloque '+next);
  return source.slice(start,stop);
}
const excerpts=[
  ['function adaptarPreferencias(', 'function setPanelLoading('],
  ['function getNivelArray(', 'async function guardarPreferencias('],
  ['function buildPreferenciasPayload(', 'function limpiarDistritos('],
  ['function turnoSelectValue(', 'function cargarPrefsEnFormulario('],
  ['function cargarPrefsEnFormulario(', 'const val ='],
  ['function turnoTexto(', 'function normalizarNivelKey('],
  ['function normalizarNivelKey(', 'function nivelLabelHumana('],
  ['function nivelLabelHumana(', 'function formatNivelesResumen('],
  ['function formatNivelesResumen(', 'function nivelCoincideConCheckbox('],
  ['function nivelCoincideConCheckbox(', 'function parseFechaFlexible(']
].map(([start,end])=>exactSection(start,end)).join('\n');

function fixture() {
  const districtIds = ['pref-distrito-principal','pref-segundo-distrito','pref-tercer-distrito','pref-cuarto-distrito','pref-quinto-distrito'];
  const cargoIds=Array.from({length:10},(_,i)=>'pref-cargo-'+(i+1));
  const fields = new Map([...districtIds,...cargoIds,'pref-turnos','pref-alertas-activas','pref-alertas-email','pref-alertas-whatsapp']
    .map(id=>[id,{value:'',checked:false}]));
  const levels=['INICIAL','PRIMARIO','SECUNDARIO','SUPERIOR','TECNICO PROFESIONAL'];
  const checks=levels.map(value=>({value,checked:false}));
  const context=vm.createContext({
    document:{
      getElementById(id){return fields.get(id)||null;},
      querySelectorAll(selector){
        if(selector==='input[name="pref-nivel-modalidad"]'||selector==='input[name="pref-nivel-modalidad"]:checked')
          return selector.endsWith(':checked')?checks.filter(x=>x.checked):checks;
        if(selector==='.ac-list')return [];
        throw new Error('Selector desconocido: '+selector);
      }
    },
    DISTRITO_INPUT_IDS:districtIds,
    CARGO_INPUT_IDS:cargoIds,
    planActual:{plan:{code:'PREMIUM'}},
    getPlanLimits(){return {maxDistritos:3,maxCargos:5};},
    setVal(id,v){if(fields.has(id))fields.get(id).value=v;},
    setCheck(id,v){if(fields.has(id))fields.get(id).checked=!!v;},
    val(id){return String(fields.get(id)?.value||'').trim();},
    checked(id){return !!fields.get(id)?.checked;},
    splitCSV(v){return String(v||'').split(',').map(x=>x.trim()).filter(Boolean);},
    applyPlanFieldVisibility(){}
  });
  vm.runInContext(excerpts,context);
  return {context,fields,checks};
}

test('Mañana guardada con o sin tilde se selecciona correctamente',()=>{
  const {context}=fixture();
  for(const [raw,expected] of [['M','M'],['Mañana','M'],['MAÑANA','M'],['manana','M'],['Tarde','T'],['Vespertino','V'],['Noche','N'],['Alternado','ALTERNADO'],['A','ALTERNADO'],['','']]){
    assert.equal(context.turnoSelectValue(raw),expected,raw);
  }
});
test('el resumen de turnos heredados muestra etiquetas humanizadas',()=>{
  const {context}=fixture();
  assert.equal(context.turnoTexto('MAÑANA'), 'Mañana');
  assert.equal(context.turnoTexto('M, TARDE'), 'Mañana, Tarde');
  assert.equal(context.turnoTexto('A'), 'Alternado');
  assert.equal(context.turnoTexto(''), '');
});
test('guardar y recargar conserva distrito, cargo, dos niveles, turno y email',()=>{
  const {context,fields,checks}=fixture();
  fields.get('pref-distrito-principal').value='Avellaneda';
  fields.get('pref-cargo-1').value='Preceptor';
  fields.get('pref-turnos').value='T';
  fields.get('pref-alertas-activas').checked=true;
  fields.get('pref-alertas-email').checked=true;
  checks.find(x=>x.value==='SECUNDARIO').checked=true;
  checks.find(x=>x.value==='TECNICO PROFESIONAL').checked=true;
  const payload=context.buildPreferenciasPayload();
  assert.equal(payload.distrito_principal,'AVELLANEDA');
  assert.deepEqual(Array.from(payload.cargos),['PRECEPTOR']);
  assert.deepEqual(Array.from(payload.niveles),['SECUNDARIO','TECNICO PROFESIONAL']);
  assert.deepEqual(Array.from(payload.turnos),['T']);
  assert.equal(payload.alertas_activas,true);
  assert.equal(payload.alertas_email,true);
  const saved=context.adaptarPreferencias(payload);
  fields.get('pref-distrito-principal').value='';
  fields.get('pref-cargo-1').value='';
  fields.get('pref-turnos').value='';
  checks.forEach(x=>x.checked=false);
  context.cargarPrefsEnFormulario({preferencias:saved});
  assert.equal(fields.get('pref-distrito-principal').value,'AVELLANEDA');
  assert.equal(fields.get('pref-cargo-1').value,'PRECEPTOR');
  assert.equal(fields.get('pref-turnos').value,'T');
  assert.deepEqual(checks.filter(x=>x.checked).map(x=>x.value),['SECUNDARIO','TECNICO PROFESIONAL']);
  assert.equal(fields.get('pref-alertas-activas').checked,true);
  assert.equal(fields.get('pref-alertas-email').checked,true);
});
test('turno en texto heredado MAÑANA se recupera en el formulario',()=>{
  const {context,fields,checks}=fixture();
  const old=context.adaptarPreferencias({distrito_principal:'AVELLANEDA',cargos:['(PR) PRECEPTOR'],niveles:['Secundaria','Técnico Profesional'],turnos:['MAÑANA'],alertas_activas:true,alertas_email:true});
  context.cargarPrefsEnFormulario({preferencias:old});
  assert.equal(fields.get('pref-turnos').value,'M');
  assert.deepEqual(checks.filter(x=>x.checked).map(x=>x.value),['SECUNDARIO','TECNICO PROFESIONAL']);
});
test('un turno no seleccionado no crea filtros ficticios',()=>{
  const {context,fields}=fixture();
  fields.get('pref-distrito-principal').value='AVELLANEDA';
  assert.deepEqual(Array.from(context.buildPreferenciasPayload().turnos),[]);
  const saved=context.adaptarPreferencias(context.buildPreferenciasPayload());
  context.cargarPrefsEnFormulario({preferencias:saved});
  assert.equal(fields.get('pref-turnos').value,'');
});
test('los límites de plan se aplican antes de generar las preferencias',()=>{
  const {context,fields}=fixture();
  ['AVELLANEDA','LANUS','QUILMES','OTRO NO PERMITIDO'].forEach((v,i)=>{
    fields.get(context.DISTRITO_INPUT_IDS[i]).value=v;
  });
  Array.from({length:6},(_,i)=>i+1).forEach(i=>{fields.get('pref-cargo-'+i).value='CARGO '+i;});
  const p=context.buildPreferenciasPayload();
  assert.equal(p.otros_distritos.length,2);
  assert.equal(p.cargos.length,5);
  assert.ok(!p.otros_distritos.includes('OTRO NO PERMITIDO'));
});
