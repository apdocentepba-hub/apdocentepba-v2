/**
 * APDocentePBA — geodistancias entre establecimientos (nunca GPS del docente).
 * Solo georreferenciación por clave provincial exacta vía WFS público ABC.
 * Lecturas GET anónimas, acotadas y ejecutadas únicamente a pedido del usuario.
 */
export const SCHOOL_WFS_LAYERS=Object.freeze({
 MS:'me:nivel_secundario_gestion_estatal',
 MT:'me:modalidad_tecnico_profesional_secundaria_gestion_estatal',
 MA:'me:modalidad_tecnico_profesional_secundaria_gestion_estatal',
 PP:'me:nivel_primario_gestion_estatal',
 JI:'me:nivel_inicial_gestion_estatal',
 IS:'me:nivel_superior_gestion_estatal',
 EE:'me:modalidad_especial_primaria_gestion_estatal'
});
const SCHOOL_RE=/^[0-9]{4}[A-Z]{2}[0-9]{4}$/;
const WFS_URL='https://mapaescolar.abc.gob.ar/me/wfs';
const MAX_BYTES=300_000;
export function verifiedSchoolKey(value){
 const key=String(value??'').trim().toUpperCase();
 return SCHOOL_RE.test(key)&&SCHOOL_WFS_LAYERS[key.slice(4,6)]?key:null;
}
function validPoint(p){
 return p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&
  p.lat>=-42&&p.lat<=-33&&p.lon>=-64&&p.lon<=-55;
}
function fromFeature(feature,key){
 const p=feature?.properties;
 if(!p||String(p.clave??'').trim().toUpperCase()!==key)return null;
 const lat=Number(p.latitud),lon=Number(p.longitud);
 if(!validPoint({lat,lon}))return null;
 return Object.freeze({
  source:'ABC_WFS',exact_key_match:true,clave:key,lat,lon,
  cue:String(p.cue||p.cueanexo||'').trim().slice(0,24),
  nombre:String(p.nombre||'').trim().slice(0,180),
  domicilio:[p.calle,p.nro].filter(Boolean).map(x=>String(x).trim()).join(' ').slice(0,180)
 });
}
export async function fetchVerifiedSchool(key,{fetchImpl=fetch,signal}={}){
 const code=verifiedSchoolKey(key);
 if(!code)return null;
 const query=new URL(WFS_URL);
 query.search=new URLSearchParams({
  service:'WFS',version:'2.0.0',request:'GetFeature',
  typeNames:SCHOOL_WFS_LAYERS[code.slice(4,6)],
  count:'5',outputFormat:'application/json',CQL_FILTER:"clave='"+code+"'"
 });
 try{
  const timeout=AbortSignal.timeout(9000);
  const combined=signal?AbortSignal.any([signal,timeout]):timeout;
  const response=await fetchImpl(query.toString(),{
   method:'GET',mode:'cors',credentials:'omit',redirect:'error',
   signal:combined,headers:{Accept:'application/json'}
  });
  if(!response?.ok)return null;
  const advertised=Number(response.headers?.get?.('content-length')||0);
  if(!Number.isFinite(advertised)||advertised>MAX_BYTES)return null;
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength>MAX_BYTES)return null;
  const data=JSON.parse(new TextDecoder().decode(bytes));
  // A single unambiguous establishment only; never merge several annexes.
  if(!Array.isArray(data?.features)||data.features.length!==1)return null;
  return fromFeature(data.features[0],code);
 }catch(_){return null;}
}
export async function fetchSelectedSchools(codes,{fetchImpl=fetch,signal}={}){
 if(!Array.isArray(codes)||codes.length>5)throw Error('max_five_selected_schools');
 const attempted=[...new Set(codes.map(verifiedSchoolKey).filter(Boolean))];
 const results=await Promise.all(attempted.map(key=>fetchVerifiedSchool(key,{fetchImpl,signal})));
 const verified=Object.create(null),unverified=[];
 results.forEach((item,index)=>{
  if(item)verified[attempted[index]]=item;else unverified.push(attempted[index]);
 });
 return {attempted,verified,unverified};
}
export function distanceBetweenSchools(a,b){
 if(a?.source!=='ABC_WFS'||a?.exact_key_match!==true||
    b?.source!=='ABC_WFS'||b?.exact_key_match!==true||
    !verifiedSchoolKey(a.clave)||!verifiedSchoolKey(b.clave)||
    !validPoint(a)||!validPoint(b))return null;
 const toRad=x=>x*Math.PI/180;
 const dlat=toRad(b.lat-a.lat),dlon=toRad(b.lon-a.lon);
 const hav=Math.sin(dlat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dlon/2)**2;
 const km=6371.0088*2*Math.asin(Math.min(1,Math.sqrt(hav)));
 return Math.round(km*10)/10;
}
export function pairSchoolDistances(verified,codes){
 if(!Array.isArray(codes)||codes.length>5)throw Error('max_five_selected_schools');
 const unique=[...new Set(codes.map(verifiedSchoolKey).filter(Boolean))];
 const pairs=[];
 for(let i=0;i<unique.length;i++)for(let j=i+1;j<unique.length;j++){
  const distance=distanceBetweenSchools(verified?.[unique[i]],verified?.[unique[j]]);
  if(distance===null)continue;
  pairs.push({escuela_a:unique[i],escuela_b:unique[j],km_linea_recta:distance});
 }
 return pairs;
}

/**
 * Official straight-line distances from each keyed current workplace to an
 * offered school. Both points need exact, independent ABC WFS verification.
 */
export function workToOfferSchoolDistances(jobs,offerSchoolKey,verified){
 if(!Array.isArray(jobs)||jobs.length>5)return [];
 const offerKey=verifiedSchoolKey(offerSchoolKey);
 if(!offerKey)return [];
 const out=[],seen=new Set();
 for(const job of jobs){
  const key=verifiedSchoolKey(job?.schoolKey);
  if(!key||seen.has(key))continue;
  seen.add(key);
  const work=verified?.[key],offer=verified?.[offerKey];
  // Validate the dictionary keys too: never compute with a different school's
  // marker accidentally stored under the requested provincial key.
  if(work?.clave!==key||offer?.clave!==offerKey)continue;
  const km=distanceBetweenSchools(work,offer);
  if(km===null)continue;
  // Prefer the official ABC establishment name over teacher-entered free text.
  out.push({school:String(work.nombre||key).trim().slice(0,120),
   schoolKey:key,km_linea_recta:km});
 }
 return out;
}
