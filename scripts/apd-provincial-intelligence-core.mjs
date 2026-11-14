/**
 * APD Observatorio Provincial — deterministic public-source intelligence core.
 * No scraping, cron, logins, personal data, claims of legal authority or
 * automatic publishing from this module. HTML parsing is intentionally
 * conservative: unsupported markup is a visible error, never "no news".
 */
import {createHash} from 'node:crypto';

const HOSTS=new Set(['abc.gob.ar','www.abc.gob.ar','servado.abc.gob.ar']);
const BAD_PATH=/(?:^|\/)(?:login|signin|auth|mi-cuenta|mis-haberes|admin|user|perfil)(?:\/|$)/i;
const GENERIC=/^(?:inicio|ver m[aá]s|novedades|comunicados|circular(?:es)?|[0-9]+|siguiente|[uú]ltimo|noticias)$/i;
const TOPIC_RULES=Object.freeze([
 ['calificacion_anual',/calificaci[oó]n anual|set\s*4|evaluaci[oó]n anual/i,'Seguimiento del período de calificación'],
 ['pad',/puntaje anual docente|\bPAD\b/i,'Guía de verificación y reclamos PAD'],
 ['pid_listados',/\bPID\b|ingreso a la docencia|listado(?:s)?\s*108|\bin.?fine\b/i,'Calendario y verificación de listados docentes'],
 ['mad_acrecentamiento',/\bMAD\b|acrecentamiento|movimiento anual docente/i,'Cronograma MAD y acrecentamiento'],
 ['actos_publicos',/actos? p[uú]blicos?|designaci[oó]n|cobertura de (?:cargo|horas|m[oó]dulos)/i,'Seguimiento de actos públicos y coberturas'],
 ['jerarquicos',/jer[aá]rquic|pruebas? de selecci[oó]n|concurso|directiv[oa]s? transitorios/i,'Agenda de concursos y cargos jerárquicos'],
 ['decreto_900',/decreto\s*900|\bD900\b/i,'Asistente informativo sobre Decreto 900'],
 ['domicilio_electronico',/domicilio (?:digital|electr[oó]nico)/i,'Verificador informativo de domicilio electrónico'],
 ['licencias',/licencias?|salud laboral|psicof[ií]sico/i,'Guías de licencias y salud laboral']
]);
const hash=input=>createHash('sha256').update(String(input)).digest('hex');
const normalize=input=>String(input??'').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').toLowerCase()
 .replace(/&(?:nbsp|amp|quot|lt|gt);/g,' ')
 .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const entities=s=>String(s??'')
 .replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,v)=> {
  const n=/^x/i.test(v)?parseInt(v.slice(1),16):parseInt(v,10);
  return n>=32&&n<=0x10ffff?String.fromCodePoint(n):' ';
 })
 .replace(/&(?:nbsp|amp|quot|apos|lt|gt|aacute|eacute|iacute|oacute|uacute|ntilde);/gi,x=>({
  '&nbsp;':' ','&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>',
  '&aacute;':'á','&eacute;':'é','&iacute;':'í','&oacute;':'ó',
  '&uacute;':'ú','&ntilde;':'ñ'
 })[x.toLowerCase()]||x);
const strip=s=>entities(String(s??'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
 .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
 .replace(/<[^>]*>/g,' ').replace(/\s+/g,' ')).trim();

export function publicUrl(value,{allowCalendar=true}={}){
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port||
     !HOSTS.has(url.hostname)||BAD_PATH.test(url.pathname))return null;
  if(!allowCalendar&&url.hostname==='servado.abc.gob.ar')return null;
  if(url.searchParams.has('token')||url.searchParams.has('dni')||
     url.searchParams.has('user')||url.searchParams.has('auth'))return null;
  url.hash='';
  return url.href;
 }catch{return null;}
}
export function validateSources(catalog){
 if(!catalog||!Array.isArray(catalog.sources))throw Error('Missing source registry');
 const ids=new Set(),urls=new Set();
 for(const s of catalog.sources){
  if(!/^[a-z0-9-]{5,80}$/.test(s.id||''))throw Error('Invalid source id');
  if(ids.has(s.id))throw Error('Duplicate source id: '+s.id);
  ids.add(s.id);
  const url=publicUrl(s.url);
  if(!url)throw Error('Nonpublic or unverified source URL: '+s.id);
  if(urls.has(url))throw Error('Duplicate source URL');
  urls.add(url);
  if(!['sad_novedades','abc_novedades','calendar_index'].includes(s.kind))
   throw Error('Unsupported source connector '+s.kind);
  if(s.kind==='sad_novedades'&&(!s.district||!url.includes('/sad/')))
   throw Error('SAD district and path required');
  if(s.status!=='verified_page'||s.public_data_only!==true)
   throw Error('Source not vetted for public-only pilot');
 }
 return Object.freeze({count:ids.size,ids:Object.freeze([...ids])});
}
function sourceSection(html,kind){
 // ABC Drupal public district and home pages have visible Novedades headings.
 // Reject unsupported layouts rather than silently returning zero records.
 if(kind==='calendar_index')return {html:'',status:'unsupported_calendar_parser'};
 const start=html.search(/(?:<[^>]+>\s*)?Novedades\s*(?:<\/[^>]+>)?/i);
 if(start<0)return {html:'',status:'unsupported_layout'};
 const rest=html.slice(start);
 const cut=rest.search(/(?:PLATAFORMA\s*ABC|<footer\b)/i);
 return {html:(cut>=0?rest.slice(0,cut):rest).slice(0,300_000),status:'ok'};
}
function articleUrl(href,base){
 try{
  const url=new URL(entities(href),base);
  const canonical=publicUrl(url.href,{allowCalendar:false});
  if(!canonical||url.hostname!==new URL(base).hostname)return null;
  if(/\/(?:inicio|page)(?:\/|$)/i.test(url.pathname))return null;
  return canonical;
 }catch{return null;}
}
function dateNear(prefix){
 const clean=strip(prefix.slice(-550));
 // ABC displays separate day/month/year tokens; do not attach a stale date
 // to a later title if no recent date is identifiable.
 const matches=[...clean.matchAll(/(?:^|\D)([0-3]?\d)[\s\/\-.]+([01]?\d)[\s\/\-.]+(20\d{2})(?!\d)/g)];
 const m=matches.at(-1);
 if(!m)return null;
 const day=Number(m[1]),month=Number(m[2]),year=Number(m[3]);
 const iso=[year,String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
 const d=new Date(iso+'T00:00:00Z');
 return d.getUTCDate()===day&&d.getUTCMonth()===month-1&&
  d.getUTCFullYear()===year?iso:null;
}
/**
 * Links to alternative public SAD channels are evidence for discovery,
 * NOT permission to crawl them. An official landing page may point to a
 * current Google Sites site even when its own ABC news list is outdated.
 */
export function discoverSourceCandidates(html,source){
 if(source?.kind!=='sad_novedades'||typeof html!=='string')return [];
 const results=[],seen=new Set();
 const head=html.split(/<footer\b|PLATAFORMA\s*ABC/i)[0].slice(0,300_000);
 const anchors=/<a\b([^>]*?)>([\s\S]{1,450}?)<\/a>/gi;
 let m;
 while((m=anchors.exec(head))!==null&&results.length<15){
  const href=m[1].match(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
  if(!href)continue;
  try{
   const u=new URL(entities(href[1]||href[2]),source.url);
   if(u.protocol!=='https:'||u.username||u.password||u.port||
      HOSTS.has(u.hostname)||seen.has(u.href))continue;
   const anchorText=strip(m[2]).slice(0,130);
   const context=(u.pathname+' '+anchorText).toLowerCase();
   if(!/(?:comunicad|novedad|\bsad\b|actos?.?p[uú]blicos?)/i.test(context))continue;
   u.hash='';
   if(u.searchParams.has('token')||u.searchParams.has('auth'))continue;
   seen.add(u.href);
   results.push(Object.freeze({
    source_id:source.id,district:source.district,
    candidate_url:u.href,link_label:anchorText,
    status:'external_channel_requires_verification',
    note:'Discovery only. Not crawled, verified, or approved as official content'
   }));
  }catch{/* ignore invalid external link */}
 }
 return Object.freeze(results);
}

export function topicsFor(title){
 return TOPIC_RULES.filter(([,regex])=>regex.test(title))
  .map(([id,,tool])=>Object.freeze({id,tool}));
}
export function extractPublicNotices({html,source,fetchedAt}){
 if(typeof html!=='string'||Buffer.byteLength(html,'utf8')>650_000)
  throw Error('Invalid or oversized HTML');
 const {html:section,status}=sourceSection(html,source.kind);
 if(status!=='ok')return Object.freeze({
  status,notices:[],note:'Connector does not support this page structure yet'
 });
 const cards=[],seen=new Set();
 // Finds link-wrapped public notice headings in Drupal SAD and ABC news.
 // No attempt to parse private pages, pagination, browser state or JS.
 const link=/<h[2-6]\b[^>]*>[\s\S]{0,600}?<a\b([^>]*?)>([\s\S]{1,900}?)<\/a>[\s\S]{0,250}?<\/h[2-6]>/gi;
 let match;
 while((match=link.exec(section))!==null&&cards.length<60){
  const href=match[1].match(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
  if(!href)continue;
  const url=articleUrl(href[1]||href[2],source.url);
  if(!url||seen.has(url))continue;
  const title=strip(match[2]).slice(0,260);
  if(title.length<12||GENERIC.test(title))continue;
  const date=dateNear(section.slice(Math.max(0,match.index-560),match.index));
  // Missing dates are carried as null, not fabricated or copied from scrape time.
  seen.add(url);
  const numbered=title.match(/\b(?:PV|IF|RESOC|DISPC)[-\s]*(20\d{2})[-\s]*(\d{4,10})(?:-GDEBA)?\b/i);
  cards.push(Object.freeze({
   id:hash(source.id+'|'+url).slice(0,20),
   source_id:source.id,
   district:source.district??null,
   title,url,publication_date:date,
   observed_at:fetchedAt,
   document_ref:numbered?normalize(numbered[0]).replace(/ /g,'-'):null,
   topics:topicsFor(title).map(t=>t.id),
   semantic_key:normalize(title),
   content_signature:hash(normalize(title)+'|'+(date||'')),
   confidence:'public_link_only'
  }));
 }
 return Object.freeze({
  status:cards.length?'ok':'no_supported_links',
  notices:Object.freeze(cards),
  note:cards.length?'Headlines only: attachments and legal effects unverified':
   'No supported notice links found; do NOT interpret as zero announcements'
 });
}
export function diffConfirmedSnapshots(before,after){
 if(before?.status!=='ok'||after?.status!=='ok')
  return Object.freeze({status:'incomparable',new:[],changed:[],not_seen:[],
   warning:'Source unavailable or parser unsupported; absence is NOT a cancellation'});
 const prev=new Map(before.notices.map(x=>[x.id,x]));
 const next=new Map(after.notices.map(x=>[x.id,x]));
 return Object.freeze({
  status:'compared',
  new:after.notices.filter(x=>!prev.has(x.id)),
  changed:after.notices.filter(x=>prev.has(x.id)&&
    x.content_signature!==prev.get(x.id).content_signature),
  not_seen:before.notices.filter(x=>!next.has(x.id)),
  warning:'not_seen means not visible in the latest page; never treat as annulment'
 });
}
export function sharedThemes(snapshots){
 const grouped=new Map();
 for(const snapshot of snapshots){
  if(snapshot?.status!=='ok')continue;
  for(const n of snapshot.notices){
   if(!n.district)continue;
   for(const topic of n.topics){
    if(!grouped.has(topic))grouped.set(topic,new Map());
    const districtGroup=grouped.get(topic);
    if(!districtGroup.has(n.district))districtGroup.set(n.district,[]);
    districtGroup.get(n.district).push(n);
   }
  }
 }
 return [...grouped].filter(([,districts])=>districts.size>=2)
  .map(([topic,districts])=>Object.freeze({
   topic,district_count:districts.size,
   districts:[...districts.keys()].sort(),
   examples:[...districts].map(([district,notices])=>({
    district,title:notices[0].title,url:notices[0].url
   })),
   assessment:'tema_compartido_no_equivale_a_mismo_comunicado',
   suggested_tool:TOPIC_RULES.find(x=>x[0]===topic)?.[2]||null
  })).sort((a,b)=>b.district_count-a.district_count||
   a.topic.localeCompare(b.topic));
}
