import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Ejecuta exactamente el bundle versionado del Worker. Fetch interceptado:
// no se consulta Supabase ni Cloudflare y no se envían correos reales.
const bundle = readFileSync('worker-live/worker_hotfix.js', 'utf8');
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(bundle).toString('base64'));

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'growth-fake-session-20261101';
const BASE = 'https://unit-test.supabase.co';
const env = { SUPABASE_URL: BASE, SUPABASE_SERVICE_ROLE_KEY: 'synthetic-not-real' };
const oldFetch = globalThis.fetch;
after(() => { globalThis.fetch = oldFetch; });

function respond(value, status=200) {
  return new Response(JSON.stringify(value), { status, headers:{'Content-Type':'application/json'} });
}
const payload = {
  distrito_principal:'AVELLANEDA',
  otros_distritos:['LANUS'],
  cargos:['PRECEPTOR'],
  materias:[],
  niveles:['SECUNDARIO','TECNICO PROFESIONAL'],
  turnos:['T'],
  alertas_activas:true,
  alertas_email:false,
  alertas_telegram:false,
  alertas_whatsapp:false
};
function request(path, {token=TOKEN, method='GET', json=null}={}) {
  const headers = token ? { Authorization:'Bearer '+token } : {};
  if(json!==null)headers['Content-Type']='application/json';
  return new Request('https://worker.example.test'+path,{
    method,headers,body: json===null?undefined:JSON.stringify(json)
  });
}
function fakeBackend({expiredSession=false, inactive=false, expiredPlan=false}={}) {
  const calls=[];
  let prefs = {
    user_id:OWNER,
    distrito_principal:'AVELLANEDA',
    otros_distritos:[],
    cargos:['PRECEPTOR'],
    materias:[],
    niveles:['SECUNDARIO'],
    turnos:[],
    alertas_activas:true,
    alertas_email:false,
    alertas_telegram:false,
    alertas_whatsapp:false
  };
  globalThis.fetch=async (url,opts={}) => {
    const target=new URL(url);
    assert.equal(target.origin, BASE, 'El Worker no debe llamar a servicios externos en esta prueba');
    assert.equal(opts.headers?.apikey, env.SUPABASE_SERVICE_ROLE_KEY);
    const name=target.pathname.split('/').at(-1);
    const method=opts.method || 'GET';
    calls.push({name,method,query:target.searchParams.toString(),body:opts.body?JSON.parse(opts.body):null});
    if(name==='sessions')return respond([{
      user_id:OWNER,token:TOKEN,activo:true,
      expires_at:expiredSession?'2000-01-01T00:00:00Z':'2100-01-01T00:00:00Z'
    }]);
    if(name==='users')return respond([{
      id:OWNER,nombre:'Cuenta',apellido:'Prueba',email:'noreply@example.invalid',
      activo:!inactive,celular:'',es_admin:false
    }]);
    if(name==='subscription_plans')return respond([{
      code:'PLUS',nombre:'Plus',descripcion:'Simulado',price_ars:1000,trial_days:0,
      max_distritos:3,max_cargos:3,is_active:true,public_visible:true,sort_order:1,
      feature_flags:{email:true,telegram:false,whatsapp:false}
    }]);
    if(name==='user_subscriptions')return respond([{
      id:123,user_id:OWNER,plan_code:'PLUS',status:'ACTIVE',
      started_at:'2026-10-01T00:00:00Z',
      current_period_ends_at:expiredPlan?'2020-01-01T00:00:00Z':'2100-01-01T00:00:00Z'
    }]);
    if(name==='user_preferences'){
      assert.equal(target.searchParams.get('user_id'),method==='GET'?'eq.'+OWNER:null);
      if(method==='GET')return respond(prefs?[prefs]:[]);
      assert.equal(method,'POST');
      assert.equal(target.searchParams.get('on_conflict'),'user_id');
      assert.match(String(opts.headers?.Prefer||''),/merge-duplicates/);
      const rows=JSON.parse(opts.body);
      assert.equal(rows.length,1);
      assert.equal(rows[0].user_id,OWNER);
      prefs={...rows[0]};
      return respond([prefs]);
    }
    throw new Error('Tabla inesperada: '+name);
  };
  return { calls, read:()=>prefs };
}

test('sin Bearer: se rechaza guardar sin consultar Supabase',async()=>{
  const mock=fakeBackend();
  const response=await worker.fetch(request('/api/guardar-preferencias',{
    token:'',method:'POST',json:{user_id:OTHER,preferencias:payload}
  }),env,{});
  assert.equal(response.status,401);
  assert.equal(mock.calls.length,0);
});

test('sesión vencida: no permite escribir preferencias ajenas',async()=>{
  const mock=fakeBackend({expiredSession:true});
  const response=await worker.fetch(request('/api/guardar-preferencias',{
    method:'POST',json:{user_id:OTHER,preferencias:payload}
  }),env,{});
  assert.equal(response.status,401);
  assert.ok(!mock.calls.some(c=>c.method!=='GET'));
});

test('usuario inactivo: no se guarda aunque conozca un token',async()=>{
  const mock=fakeBackend({inactive:true});
  const response=await worker.fetch(request('/api/guardar-preferencias',{
    method:'POST',json:{user_id:OTHER,preferencias:payload}
  }),env,{});
  assert.equal(response.status,401);
  assert.ok(!mock.calls.some(c=>c.method!=='GET'));
});

test('guardar y recuperar con usuario suplantado conserva los filtros solo en su cuenta',async()=>{
  const mock=fakeBackend();
  const response=await worker.fetch(request('/api/guardar-preferencias',{
    method:'POST',json:{user_id:OTHER,preferencias:payload}
  }),env,{});
  const json=await response.json();
  assert.equal(response.status,200,JSON.stringify(json).slice(0,700));
  assert.equal(json.ok,true);
  const writes=mock.calls.filter(c=>c.name==='user_preferences'&&c.method==='POST');
  assert.equal(writes.length,1);
  const saved=writes[0].body[0];
  assert.equal(saved.user_id,OWNER);
  assert.deepEqual(saved.cargos,['PRECEPTOR']);
  assert.deepEqual(saved.niveles,['SECUNDARIO','TECNICO PROFESIONAL']);
  assert.deepEqual(saved.turnos,['T']);
  assert.equal(saved.alertas_email,false,'Nunca enviar digest inicial desde esta prueba');
  assert.ok(!mock.calls.some(c=>JSON.stringify(c).includes(OTHER)));
  const read=await worker.fetch(request('/api/account/preferences?user_id='+OTHER),env,{});
  const result=await read.json();
  assert.equal(read.status,200,JSON.stringify(result));
  assert.equal(result.preferences.user_id,OWNER);
  assert.deepEqual(result.preferences.niveles,['SECUNDARIO','TECNICO PROFESIONAL']);
  assert.deepEqual(result.preferences.turnos,['T']);
  assert.equal(result.preferences.alertas_email,false);
});

test('no aceptar Content-Type distinto de JSON antes de guardar',async()=>{
  const mock=fakeBackend();
  const res=await worker.fetch(new Request('https://worker.example.test/api/guardar-preferencias',{
    method:'POST',headers:{Authorization:'Bearer '+TOKEN,'Content-Type':'text/plain'},
    body:'user_id='+OTHER
  }),env,{});
  assert.equal(res.status,415);
  assert.ok(!mock.calls.some(c=>c.method!=='GET'));
});

test('guardar email activado en preferencias existentes no duplica alta ni envía emails',async()=>{
  const mock=fakeBackend();
  const response=await worker.fetch(request('/api/guardar-preferencias',{
    method:'POST',json:{user_id:OWNER,preferencias:{...payload,alertas_email:true}}
  }),env,{});
  const body=await response.json();
  assert.equal(response.status,200,JSON.stringify(body).slice(0,700));
  assert.equal(mock.read().alertas_email,true);
  assert.equal(mock.calls.filter(c=>c.name==='user_preferences'&&c.method==='POST').length,1);
  assert.equal(mock.calls.filter(c=>c.name==='user_subscriptions'&&c.method!=='GET').length,0);
  const recovered=await worker.fetch(request('/api/account/preferences'),env,{});
  assert.equal(recovered.status,200);
  const saved=(await recovered.json()).preferences;
  assert.equal(saved.alertas_email,true);
  assert.deepEqual(saved.niveles,['SECUNDARIO','TECNICO PROFESIONAL']);
});

test('no se permiten escrituras cuando el plan existente está vencido',async()=>{
  const mock=fakeBackend({expiredPlan:true});
  const response=await worker.fetch(request('/api/guardar-preferencias',{
    method:'POST',json:{user_id:OWNER,preferencias:payload}
  }),env,{});
  assert.equal(response.status,403);
  assert.equal(mock.calls.filter(c=>c.name==='user_preferences'&&c.method==='POST').length,0);
});
