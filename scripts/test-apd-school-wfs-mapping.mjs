import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../mapa-escuelas-pba.html',import.meta.url),'utf8');
const inline=html.match(/<script>([\s\S]*?)<\/script>/i)?.[1]||'';
const a=inline.indexOf('const WFS_LAYERS=');
const b=inline.indexOf('async function cargarOficial(){',a);
assert.ok(a>0&&b>a);
const fragment=inline.slice(a,b);
function createLab({clave='0005MS0004',reply,fail=false}={}){
 const calls=[],errors=[];
 const node={textContent:''};
 const document={
   stFuente:node,
 };
 const ctx={
  ofertaClave:clave,datos:[],fetch:async (u,opts)=>{
   calls.push({url:String(u),opts});
   if(fail)throw Error('simulated network failure');
   const body=JSON.stringify(reply||{features:[]});
   const bytes=new TextEncoder().encode(body);
   return {ok:true,status:200,headers:{get:()=>String(bytes.byteLength)},
    arrayBuffer:async()=>bytes.buffer};
  },
  URL,URLSearchParams,TextDecoder,TextEncoder,AbortSignal,
  $:id=>document[id]||node,setInfo:v=>errors.push(v),
  llenarFiltros:()=>{},filtrar:()=>{},console
 };
 vm.createContext(ctx);
 vm.runInContext(fragment,ctx);
 return Object.assign(ctx,{calls,errors});
}
const item=(code='0005MS0004',lat=-34.68,lon=-58.34)=>({
 properties:{clave:code,nombre:'Escuela Secundaria 4',cue:'061002000',calle:'Calle Prueba',nro:'100',
  distrito:'Avellaneda',localidad:'Wilde',latitud:lat,longitud:lon},
 geometry:{type:'Point',coordinates:[lon,lat]}
});
test('MS and MT choose known official layers; unknown prefixes have no guessed layer',()=>{
 const c=createLab();
 assert.equal(c.capaWfsParaClave('0005MS0004'),'me:nivel_secundario_gestion_estatal');
 assert.equal(c.capaWfsParaClave('0005MT0006'),'me:modalidad_tecnico_profesional_secundaria_gestion_estatal');
 assert.equal(c.capaWfsParaClave('0005PP0060'),null);
 assert.equal(c.capaWfsParaClave('x0005MS0004'),null);
});
test('strict key join keeps official school name CUE address and exact coordinates',()=>{
 const c=createLab();
 const x=c.normalizarRegistroWfs(item(),'0005MS0004');
 assert.equal(x.clave,'0005MS0004');
 assert.equal(x.cue,'061002000');
 assert.equal(x.dom,'Calle Prueba 100');
 assert.equal(x.lat,-34.68);
 assert.equal(x.lon,-58.34);
});
test('wrong key or non-PBA coordinates fail closed',()=>{
 const c=createLab();
 assert.equal(c.normalizarRegistroWfs(item('0005MS0005'),'0005MS0004'),null);
 assert.equal(c.normalizarRegistroWfs(item('0005MS0004',0,0),'0005MS0004'),null);
 assert.equal(c.normalizarRegistroWfs(item('0005MS0004',-34.68,-70),'0005MS0004'),null);
});
test('WFS lookup only hits official host with bounded exact key filter',async()=>{
 const c=createLab({reply:{features:[item()]}});
 assert.equal(await c.consultarClaveWfs(),true);
 assert.equal(c.datos.length,1);
 assert.equal(c.$('stFuente').textContent,'Mapa Escolar ABC · WFS oficial');
 assert.equal(c.calls.length,1);
 const req=new URL(c.calls[0].url);
 assert.equal(req.origin,'https://mapaescolar.abc.gob.ar');
 assert.equal(req.searchParams.get('CQL_FILTER'),"clave='0005MS0004'");
 assert.equal(req.searchParams.get('count'),'5');
 assert.equal(c.calls[0].opts.credentials,'omit');
 assert.equal(c.calls[0].opts.method,'GET');
});
test('duplicate or mismatched features do not create marker',async()=>{
 for(const features of [[item(),item()],[item('9999MS0004')],[]]){
  const c=createLab({reply:{features}});
  assert.equal(await c.consultarClaveWfs(),false);
  assert.equal(c.datos.length,0);
 }
});
test('network outage does not create markers or leak user data',async()=>{
 const c=createLab({fail:true});
 assert.equal(await c.consultarClaveWfs(),false);
 assert.equal(c.datos.length,0);
 assert.ok(c.errors.some(s=>/no pudo confirmarse/.test(s)));
});
