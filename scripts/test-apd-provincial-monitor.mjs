import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scanPublicSources,robotsPolicy} from './apd-provincial-monitor.mjs';
const catalog=JSON.parse(readFileSync(new URL('../data/apd-provincial-official-sources.json',import.meta.url),'utf8'));
const page=`<html><body><h3>Novedades</h3>
 <div class="views-row"><time><span>03</span><span>11</span><span>2026</span></time>
 <h5><a href="/sad/almirante-brown/inicio/com-57826-calificacion">Com. 578/26 Calificación Anual Docente 2026: Período de Carga</a></h5></div>
 PLATAFORMA ABC</body></html>`;
const clock='2026-11-14T14:00:00Z';

test('robots policy rejects blocked paths and unfamiliar rule syntax',()=>{
 assert.deepEqual(robotsPolicy('User-agent: *\nDisallow: /sad/private','/sad/private'),
  {allowed:false,reason:'robots_disallowed'});
 assert.deepEqual(robotsPolicy('User-agent: *\nDisallow: /','/sad/'),
  {allowed:false,reason:'robots_disallowed'});
 assert.equal(robotsPolicy('User-agent: *\nDisallow: /login','/sad/').allowed,true);
 assert.equal(robotsPolicy('User-agent: *\nDisallow: /*','/sad/').allowed,false);
 assert.equal(robotsPolicy('User-agent: abc\nDisallow: /','/sad/').allowed,false);
 assert.equal(robotsPolicy('', '/sad/').allowed,false);
});

test('Default offline scan never calls network and never claims zero announcements',async()=>{
 let calls=0;
 const result=await scanPublicSources({catalog,clock,network:false,fetchFn:async()=>{
  calls++;throw Error('unexpected');
 }});
 assert.equal(calls,0);
 assert.equal(result.sources.filter(x=>x.kind==='sad_novedades').length,4);
 assert.ok(result.sources.every(x=>['network_disabled','unsupported_calendar_parser'].includes(x.status)));
 assert.deepEqual(result.district_coverage,[]);
 assert.deepEqual(result.shared_themes,[]);
 assert.equal(result.network_mode,'offline');
});

test('Online pilot uses host robots, public GET only, no cookies, fails closed on content errors',async()=>{
 const calls=[];
 const fake=async(url,opts)=>{
  calls.push({url,opts});
  if(url.endsWith('/robots.txt'))return new Response('User-agent: *\nDisallow: /private',{
   status:200,headers:{'content-type':'text/plain'}
  });
  if(url.includes('/sad/almirante-brown/inicio'))
   return new Response(page,{status:200,headers:{'content-type':'text/html'}});
  return new Response('Maintenance',{status:503,headers:{'content-type':'text/html'}});
 };
 const report=await scanPublicSources({catalog,network:true,fetchFn:fake,
  clock,delayFn:async()=>{}});
 assert.equal(report.network_mode,'public_readonly');
 assert.equal(report.sources.find(x=>x.id==='sad-almirante-brown').status,'ok');
 assert.equal(report.sources.find(x=>x.id==='sad-almirante-brown').notices.length,1);
 assert.ok(report.sources.filter(x=>x.status==='http_error').length>=3);
 assert.equal(report.sources.find(x=>x.id==='servado-calendario').status,'unsupported_calendar_parser');
 assert.equal(calls.filter(x=>x.url.endsWith('/robots.txt')).length,1);
 assert.equal(calls.length,6);
 assert.ok(calls.every(x=>x.opts.credentials==='omit'));
 assert.ok(calls.every(x=>x.opts.method==='GET'));
 assert.ok(calls.every(x=>x.opts.redirect==='manual'));
 assert.ok(calls.every(x=>!JSON.stringify(x.opts).includes('Authorization')));
});
test('Robots denied means no content requests at all',async()=>{
 const calls=[];
 const fake=async(url,opts)=>{
  calls.push(url);
  return new Response('User-agent: *\nDisallow: /',{status:200,
   headers:{'content-type':'text/plain'}});
 };
 const report=await scanPublicSources({catalog,network:true,fetchFn:fake,
  clock,delayFn:async()=>{}});
 assert.equal(calls.length,1);
 assert.ok(report.sources.filter(x=>x.kind==='sad_novedades')
  .every(s=>s.status==='robots_denied'));
});
test('Fail-closed when robots unavailable, never force-fetch ABC',async()=>{
 const calls=[];
 const fake=async(url)=>{
  calls.push(url);
  return new Response('Unavailable',{status:404,
   headers:{'content-type':'text/plain'}});
 };
 const report=await scanPublicSources({catalog,network:true,fetchFn:fake,
  clock,delayFn:async()=>{}});
 assert.equal(calls.length,1);
 assert.ok(report.sources.filter(x=>x.kind==='sad_novedades')
  .every(s=>s.status==='robots_unavailable'));
});
test('Snapshot fetch failure is incomparable, not an annulment',async()=>{
 const prev={schema_version:'0.1.0',sources:[{
  id:'sad-avellaneda',status:'ok',notices:[{
   id:'old',title:'Calificación Anual Docente',url:'https://abc.gob.ar/sad/avellaneda/old'
  }]
 }]};
 const report=await scanPublicSources({catalog,previous:prev,network:false,clock});
 const change=report.changes.find(x=>x.source_id==='sad-avellaneda');
 assert.equal(change.status,'incomparable');
 assert.equal(change.not_visible.length,0);
});
test('Pilot cap prevents a runaway provincial crawl',async()=>{
 const more={...catalog,sources:[...catalog.sources,{
  ...catalog.sources[0],id:'sad-otro',
  district:'Otro',url:'https://abc.gob.ar/sad/otro/inicio'
 }]};
 await assert.rejects(scanPublicSources({catalog:more,clock}),/Pilot source cap exceeded/);
});
test('No credentials, personal data, OCR, posting or notifications in crawler',()=>{
 const source=readFileSync('scripts/apd-provincial-monitor.mjs','utf8');
 assert.match(source,/--allow-network/);
 assert.match(source,/APD_ENABLE_PUBLIC_MONITOR/);
 assert.match(source,/credentials:'omit'/);
 assert.match(source,/redirect:'manual'/);
 assert.match(source,/AbortSignal\.timeout\(12000\)/);
 assert.doesNotMatch(source,/localStorage|sessionStorage|cookies\s*:/i);
 assert.doesNotMatch(source,/sendWhatsApp|sendMail|sendTelegram|postToInstagram/);
});
