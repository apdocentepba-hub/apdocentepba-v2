/**
 * APD provincial monitor pilot. Read-only, bounded, fail-closed.
 * Offline by default. Explicit --live --allow-network required to access
 * verified public ABC sources. No login, cookies, tracking or user data.
 *
 * Usage:
 *   node scripts/apd-provincial-monitor.mjs --offline
 *   APD_ENABLE_PUBLIC_MONITOR=1 node scripts/apd-provincial-monitor.mjs --live --allow-network
 *   ... --previous path/to/previous.json --out path/to/report.json
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 validateSources,publicUrl,extractPublicNotices,diffConfirmedSnapshots,sharedThemes
} from './apd-provincial-intelligence-core.mjs';

const catalogPath=fileURLToPath(new URL('../data/apd-provincial-official-sources.json',import.meta.url));
const MAX_SOURCES=6,MAX_HTML_BYTES=550_000,MAX_ROBOTS_BYTES=32_000;
const UA='APDocentePBA-public-source-pilot/0.1 (+https://alertasapd.com.ar/)';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const errorMessage=e=>String(e?.message||e).slice(0,150);

export function robotsPolicy(txt,pathname){
 // Conservative subset: generic wildcard group only. Reject explicit rules
 // and malformed robots rather than assuming permission.
 if(typeof txt!=='string'||txt.length>MAX_ROBOTS_BYTES)
  return {allowed:false,reason:'robots_invalid'};
 let applies=false,hasGroup=false;
 let specificity=0,reason='robots_allowed';
 for(const raw of txt.split(/\r?\n/)){
  const line=raw.split('#')[0].trim();
  if(!line)continue;
  const m=line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
  if(!m)continue;
  const field=m[1].toLowerCase(),value=m[2].trim();
  if(field==='user-agent'){
   applies=value==='*';
   hasGroup=true;continue;
  }
  if(!applies)continue;
  if(field!=='allow'&&field!=='disallow')continue;
  if(!value||!value.startsWith('/'))continue;
  // No wildcard / $ parser in pilot. Fail-closed for these rule patterns.
  if(value.includes('*')||value.includes('$'))
   return {allowed:false,reason:'robots_pattern_unsupported'};
  if(pathname.startsWith(value)&&value.length>=specificity){
   specificity=value.length;
   reason=field==='allow'?'robots_allowed':'robots_disallowed';
  }
 }
 if(!hasGroup)return {allowed:false,reason:'robots_group_unknown'};
 return {allowed:reason==='robots_allowed',reason};
}
async function boundedResponse(response,maxBytes,expected){
 if(!response.ok||response.status!==200)return {
  status:'http_error',reason:'http_'+response.status
 };
 const type=response.headers.get('content-type')||'';
 if(!expected.test(type))return {status:'bad_content_type',reason:type.slice(0,80)};
 const length=Number(response.headers.get('content-length')||0);
 if(length>maxBytes)return {status:'body_too_large',reason:'content-length'};
 const reader=response.body?.getReader();
 if(!reader)return {status:'bad_response',reason:'no_stream'};
 const chunks=[];let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   size+=value.byteLength;
   if(size>maxBytes){
    await reader.cancel().catch(()=>{});
    return {status:'body_too_large',reason:'stream_limit'};
   }
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 return {status:'ok',body:Buffer.concat(chunks.map(c=>Buffer.from(c)),size).toString('utf8')};
}
function loadPrevious(value){
 if(!value)return null;
 const doc=JSON.parse(readFileSync(value,'utf8'));
 if(doc.schema_version!=='0.1.0'||!Array.isArray(doc.sources))
  throw Error('Previous report has unsupported schema');
 return doc;
}
export async function scanPublicSources({
 catalog,previous=null,clock=new Date(),network=false,
 fetchFn=globalThis.fetch,delayFn=sleep
}){
 validateSources(catalog);
 const stamp=new Date(clock).toISOString();
 if(catalog.sources.length>MAX_SOURCES)
  throw Error('Pilot source cap exceeded; approve capacity change first');
 const results=[],prior=new Map((previous?.sources||[]).map(s=>[s.id,s]));
 const robotsByHost=new Map();
 for(const source of catalog.sources){
  if(source.kind==='calendar_index'){
   results.push({
    id:source.id,district:source.district,url:source.url,kind:source.kind,
    status:'unsupported_calendar_parser',observed_at:stamp,
    notices:[],note:'Public calendar connector not implemented in pilot'
   });continue;
  }
  if(!network){
   results.push({
    id:source.id,district:source.district,url:source.url,kind:source.kind,
    status:'network_disabled',observed_at:stamp,
    notices:[],note:'Offline-only: did not access source'
   });continue;
  }
  let status='fetch_error',notices=[],note='',httpStatus=null;
  const url=new URL(source.url),origin=url.origin;
  try{
   if(!robotsByHost.has(origin)){
    const robotUrl=origin+'/robots.txt';
    if(!publicUrl(robotUrl))throw Error('Unsafe robots URL');
    const response=await fetchFn(robotUrl,{
     headers:{'User-Agent':UA,'Accept':'text/plain'},
     method:'GET',credentials:'omit',redirect:'manual',
     signal:AbortSignal.timeout(12000)
    });
    const body=await boundedResponse(response,MAX_ROBOTS_BYTES,/text\/plain/i);
    robotsByHost.set(origin,body.status==='ok'?body.body:null);
   }
   const robotTxt=robotsByHost.get(origin);
   if(robotTxt===null){
    status='robots_unavailable';note='Robots rules could not be verified; skipped';
   }else{
    const permission=robotsPolicy(robotTxt,url.pathname);
    if(!permission.allowed){
     status='robots_denied';note=permission.reason;
    }else{
     const response=await fetchFn(source.url,{
      headers:{'User-Agent':UA,'Accept':'text/html'},
      method:'GET',credentials:'omit',redirect:'manual',
      signal:AbortSignal.timeout(12000)
     });
     httpStatus=response.status;
     const page=await boundedResponse(response,MAX_HTML_BYTES,/text\/html/i);
     if(page.status==='ok'){
      const extracted=extractPublicNotices({
       source,html:page.body,fetchedAt:stamp
      });
      status=extracted.status;notices=extracted.notices;note=extracted.note;
     }else{
      status=page.status;note=page.reason;
     }
    }
   }
  }catch(error){status='fetch_error';note=errorMessage(error);}
  results.push({
   id:source.id,district:source.district,url:source.url,kind:source.kind,
   status,observed_at:stamp,http_status:httpStatus,notices,note
  });
  await delayFn(1300);
 }
 const changes=[];
 for(const current of results){
  const old=prior.get(current.id);
  if(!old)continue;
  const diff=diffConfirmedSnapshots(old,current);
  changes.push({
   source_id:current.id,status:diff.status,
   new:diff.new.map(x=>({id:x.id,title:x.title,url:x.url})),
   changed:diff.changed.map(x=>({id:x.id,title:x.title,url:x.url})),
   not_visible:diff.not_seen.map(x=>({id:x.id,title:x.title,url:x.url})),
   warning:diff.warning
  });
 }
 return {
  schema_version:'0.1.0',project:'APD Observatorio Provincial',
  generated_at:stamp,network_mode:network?'public_readonly':'offline',
  pilot_source_count:catalog.sources.length,
  district_coverage:results.filter(x=>x.kind==='sad_novedades'&&x.status==='ok')
   .map(x=>x.district),
  sources:results,
  changes,shared_themes:sharedThemes(results),
  caveats:[
   'Only the registered public pages were checked; no coverage claims for all SAD',
   'No private ABC/SerVaDo session, GPS, DNI, teacher or student data accessed',
   'A missing announcement is NOT a cancellation or confirmed invalidation',
   'Topic matches do not mean two districts issued the same formal communication',
   'News links are not legal interpretation or procedural advice'
  ]
 };
}
export async function main(args=process.argv.slice(2)){
 const live=args.includes('--live');
 const allowed=args.includes('--allow-network')&&
  process.env.APD_ENABLE_PUBLIC_MONITOR==='1';
 if(live&&!allowed)throw Error('Live scan requires --allow-network and APD_ENABLE_PUBLIC_MONITOR=1');
 if(!live&&!args.includes('--offline'))
  throw Error('Select --offline or explicitly authorize --live');
 const option=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
 const out=option('--out'),previous=option('--previous');
 const catalog=JSON.parse(readFileSync(catalogPath,'utf8'));
 const report=await scanPublicSources({
  catalog,previous:loadPrevious(previous),network:live
 });
 if(out){
  const file=resolve(out);
  mkdirSync(dirname(file),{recursive:true});
  writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'w'});
 }
 const view={at:report.generated_at,network_mode:report.network_mode,
  statuses:report.sources.map(s=>({id:s.id,status:s.status,count:s.notices.length})),
  themes:report.shared_themes.map(x=>({
   topic:x.topic,reported_districts:x.district_count
  })),output:out||null};
 process.stdout.write(JSON.stringify(view,null,2)+'\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(e=>{console.error('APD_SAD_MONITOR_ERROR '+errorMessage(e));process.exitCode=1;});
}
