import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const code=readFileSync(new URL('../insigne_rules_lab.js', import.meta.url),'utf8');
const sandbox=vm.createContext({});
vm.runInContext(code,sandbox);
const engine=sandbox.APD_InsigneLab;
const rule=(district,cargo,mode='normal')=>({district,cargo,mode});
const offer=(district,cargo,classification)=>({district,cargo,classification});
const arr=v=>Array.from(v);

test('normalización de acentos y siglas conserva coincidencia exacta',()=>{
  assert.equal(engine.norm('lanús'),'LANUS');
  assert.equal(engine.cargoMatches('PRECEPTOR','(PR) PRECEPTOR'),true);
  assert.equal(engine.cargoMatches('(PR) PRECEPTOR','(PR) PRECEPTOR'),true);
  assert.equal(engine.cargoMatches('PRECEPTOR','MATEMATICA'),false);
  assert.equal(engine.cargoMatches('(PR) PRECEPTOR','(MTM) MATEMATICA'),false);
});
test('las combinaciones son específicas, no producto cartesiano',()=>{
  const rules=[rule('AVELLANEDA','PRECEPTOR'),rule('QUILMES','MATEMATICA')];
  assert.equal(engine.matches(offer('AVELLANEDA','PRECEPTOR','ORDINARIA'),rules).matches.length,1);
  assert.equal(engine.matches(offer('QUILMES','MATEMATICA','ORDINARIA'),rules).matches.length,1);
  assert.equal(engine.matches(offer('QUILMES','PRECEPTOR','ORDINARIA'),rules).matches.length,0);
  assert.equal(engine.matches(offer('AVELLANEDA','MATEMATICA','ORDINARIA'),rules).matches.length,0);
});
test('emergencia adicional solo coincide con metadatos explícitos',()=>{
  const rules=[rule('AVELLANEDA','PRECEPTOR'),rule('LANÚS','PRECEPTOR','emergency')];
  assert.equal(engine.matches(offer('LANÚS','PRECEPTOR','EMERGENCIA'),rules).matches.length,1);
  assert.equal(engine.matches(offer('LANÚS','PRECEPTOR','108B_EMERGENCIA'),rules).matches.length,1);
  assert.equal(engine.matches(offer('LANÚS','PRECEPTOR','ORDINARIA'),rules).matches.length,0);
  assert.equal(engine.matches(offer('LANÚS','PRECEPTOR'),rules).matches.length,0);
  assert.equal(engine.matches({...offer('LANÚS','PRECEPTOR'),descripcion:'URGENTE EMERGENCIA'},rules).matches.length,0);
  assert.equal(engine.matches({...offer('LANÚS','PRECEPTOR'),es_emergencia:true},rules).matches.length,1);
});
test('3 distritos normales y un distrito adicional para emergencias',()=>{
  let rules=[rule('AVELLANEDA','PRECEPTOR'),rule('QUILMES','MATEMATICA'),rule('LA MATANZA','INGLES')];
  assert.equal(engine.validate([...rules,rule('LANUS','PRECEPTOR','emergency')]).ok,true);
  assert.equal(engine.validate([...rules,rule('LANUS','PRECEPTOR')]).ok,false);
  assert.equal(engine.validate([...rules,rule('LANUS','PRECEPTOR','emergency'),rule('BERAZATEGUI','INGLES','emergency')]).ok,false);
});
test('duplicados, más de 20 reglas y entradas inválidas se rechazan',()=>{
  const rules=[rule('AVELLANEDA','PRECEPTOR')];
  assert.equal(engine.validate([...rules,rule('avellaneda','preceptor')]).ok,false);
  assert.equal(engine.validate([rule('','PRECEPTOR')]).ok,false);
  assert.equal(engine.validate([rule('AVELLANEDA','PRECEPTOR','other')]).ok,false);
  const oversized=Array.from({length:21},(_,i)=>rule('AVELLANEDA','CARGO '+i));
  assert.equal(engine.validate(oversized).ok,false);
  assert.equal(engine.matches(offer('AVELLANEDA','PRECEPTOR'),oversized).valid,false);
});
test('la librería no escribe redes, sesiones o datos del usuario',()=>{
  assert.doesNotMatch(code,/fetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie/);
  assert.equal(engine.LIMITS.rules,20);
});
