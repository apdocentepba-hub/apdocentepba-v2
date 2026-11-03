/* LAB-ONLY. Combine two complete, projected public source captures with the
 * PG17 source-ID/Worker-key staging gate. Never writes or calls ABC itself.
 * The hashes, source text and offer IDs remain in closures and are never
 * returned in JSON summaries or logged by this module.
 * No production permission, deploy or Supabase migration is implied.
 */
import {createHash} from 'node:crypto';
import {prepareGlobalSourcePairsForLab} from './apd-global-source-pair-stage-gate.mjs';

// Pin the 29 fields selected by PR #237's public read-only cursor. If that
// projection changes, this lab bridge must be consciously reconciled.
export const LAB_PROJECTED_FIELDS = Object.freeze([
 'id','iddetalle','idoferta','descdistrito','estado',
 'escuela','cargo','descripcioncargo','descripcionarea',
 'descnivelmodalidad','nivelmodalidad','turno','jornada',
 'hsmodulos','cursodivision','supl_desde','supl_hasta',
 'finoferta','ult_movimiento','supl_revista','lunes',
 'martes','miercoles','jueves','viernes','sabado',
 'observaciones','tipooferta','iniciooferta'
]);
const ALLOWED=new Set(LAB_PROJECTED_FIELDS);
const DISTRICT=/^[A-Z0-9 ÁÉÍÓÚÜÑ()\/.,'-]{2,100}$/u;
const KEY=/^D_[0-9]+$/;
function stable(value){
 if(Array.isArray(value))return value.map(stable);
 if(value && typeof value==='object'){
  if(Object.getPrototypeOf(value)!==Object.prototype &&
     Object.getPrototypeOf(value)!==null)
   throw Error('Unsupported projected value');
  return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
 }
 if(value===undefined)return null;
 if(value===null||typeof value==='string'||typeof value==='boolean'||
    (typeof value==='number'&&Number.isFinite(value)))return value;
 throw Error('Unsupported projected value');
}
function sourceSnapshot(district, result, keyFromOffer){
 if(!result||!Array.isArray(result.docs)||
    !Number.isSafeInteger(result.totalBruto)||
    result.totalBruto<0||result.totalBruto>10000||
    result.totalFiltrado!==result.totalBruto||
    result.docs.length!==result.totalBruto)
  throw Error('Projected preflight incomplete district capture');
 const pairs=[], hashes=new Map(),projectedByKey=new Map();
 for(const doc of result.docs){
  if(!doc||typeof doc!=='object'||Array.isArray(doc)||
     Object.keys(doc).some(field=>!ALLOWED.has(field)))
   throw Error('Projected preflight rejected unapproved source field');
  const id=doc.id;
  const detail=String(doc.iddetalle??'');
  if(typeof id!=='string'||!id||id.length>300||id!==id.trim()||
     !/^\d+$/.test(detail)||doc.estado!=='Publicada'||
     doc.descdistrito!==district)
   throw Error('Projected preflight rejected source identity or status');
  let key;
  try{key=keyFromOffer(doc)}catch{throw Error('Projected preflight Worker key derivation failed')}
  if(typeof key!=='string'||!KEY.test(key)||key!=='D_'+detail)
   throw Error('Projected preflight Worker key mismatches source detail');
  if(hashes.has(id))throw Error('Projected preflight duplicate source ID');
  // Canonicalized allowlisted content only. Hashes are private and never emitted.
  let digest,projected;
  try{
   projected=Object.fromEntries(LAB_PROJECTED_FIELDS.map(field=>
    [field,stable(doc[field])]));
   digest=createHash('sha256').update(JSON.stringify(projected)).digest('hex');
  }catch{throw Error('Projected preflight could not canonicalize source content')}
  hashes.set(id,digest);
  // Keep a detached, canonical snapshot. Mutating caller-owned ABC records
  // after verification must not change any staged payload.
  projectedByKey.set(key,Object.freeze(projected));
  pairs.push({id,source_offer_key:key});
 }
 return {entry:{district,sourceTotal:result.totalBruto,pairs},hashes,projectedByKey};
}

export async function prepareProjectedGlobalPairsForIsolatedPg17({
 districts,readDistrict,keyFromOffer
}={}){
 if(!Array.isArray(districts)||districts.length<2||districts.length>12||
    districts.some(d=>typeof d!=='string'||d!==d.trim()||!DISTRICT.test(d))||
    new Set(districts).size!==districts.length||
    typeof readDistrict!=='function'||typeof keyFromOffer!=='function')
  throw Error('Projected preflight invalid laboratory dependencies');
 const passes=[];
 for(let pass=0;pass<2;pass++){
  const entries=[],hashes=new Map(),projected=new Map();
  for(const district of districts){
   let capture;
   try{capture=await readDistrict(district)}
   catch{throw Error('Projected preflight source read failed')}
   const result=sourceSnapshot(district,capture,keyFromOffer);
   entries.push(result.entry);hashes.set(district,result.hashes);
   projected.set(district,result.projectedByKey);
  }
  passes.push({entries,hashes,projected});
 }
 // Validate the global ID/key namespace and snapshot identity first.
 const gate=prepareGlobalSourcePairsForLab({
  first:passes[0].entries,second:passes[1].entries
 });
 for(const district of districts){
  const before=passes[0].hashes.get(district),after=passes[1].hashes.get(district);
  if(before.size!==after.size)
   throw Error('Projected preflight source content cardinality changed');
  for(const [id,digest] of before){
   if(after.get(id)!==digest)
    throw Error('Projected preflight source content drifted between captures');
  }
 }
 const summary=Object.freeze({
  ...gate.summary,
  source_content_hashes_checked:true,
  projected_fields_checked:LAB_PROJECTED_FIELDS.length,
  no_source_content_or_hashes_in_summary:true,
  production_modified:false,
  deploy_authorized:false
 });
 // This is a deliberately narrow pilot mapping. Values are sourced ONLY from
 // the verified projection, not from caller-provided staging payloads.
 // Worker production additionally normalizes turno/curso; this lab bridge
 // requires these fields to be already normalized, until parity is proven.
 const textField=(doc,name)=>{
  const v=doc[name];
  if(v===null||v===undefined)return '';
  if(typeof v==='string')return v;
  if(typeof v==='number'&&Number.isFinite(v))return String(v);
  throw Error('Projected preflight rejected non-scalar staged field');
 };
 function stagedRowsForIsolatedPg17(district,stagedKeys){
  const pairs=gate.pairsForIsolatedStaging(district,stagedKeys);
  const source=passes[1].projected.get(district);
  const requested=new Set(stagedKeys);
  const result=[];
  for(const {source_offer_key:key} of pairs){
   if(!requested.has(key))continue;
   const doc=source?.get(key);
   if(!doc)throw Error('Projected preflight missing verified source document');
   const row={
    source_offer_key:key,
    idoferta:textField(doc,'idoferta'),
    iddetalle:textField(doc,'iddetalle'),
    estado:'Publicada',
    distrito:district,
    escuela:textField(doc,'escuela'),
    cargo:textField(doc,'descripcioncargo')||textField(doc,'cargo'),
    area:textField(doc,'descripcionarea'),
    nivel_modalidad:textField(doc,'descnivelmodalidad'),
    turno:textField(doc,'turno'),
    jornada:textField(doc,'jornada'),
    hsmodulos:textField(doc,'hsmodulos'),
    cursodivision:textField(doc,'cursodivision'),
    supl_desde:textField(doc,'supl_desde'),
    supl_hasta:textField(doc,'supl_hasta'),
    finoferta:textField(doc,'finoferta'),
    ult_movimiento:textField(doc,'ult_movimiento'),
    raw:null
   };
   // Never propagate free-text observations, source ID, contact details
   // or the full public source object into the pilot's raw JSON column.
   result.push(Object.freeze(row));
  }
  if(result.length!==requested.size)
   throw Error('Projected preflight selected staging payload incomplete');
  return Object.freeze(result);
 }
 return Object.freeze({summary,
  pairsForIsolatedStaging:gate.pairsForIsolatedStaging,
  stagedRowsForIsolatedPg17});
}
