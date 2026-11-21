import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 publicUrl,validateSources,extractPublicNotices,diffConfirmedSnapshots,
 sharedThemes,topicsFor,discoverSourceCandidates
} from './apd-provincial-intelligence-core.mjs';

const catalog=JSON.parse(readFileSync(
 new URL('../data/apd-provincial-official-sources.json',import.meta.url),'utf8'));
const brown=catalog.sources.find(x=>x.id==='sad-almirante-brown');
const martin=catalog.sources.find(x=>x.id==='sad-general-san-martin');
const avellaneda=catalog.sources.find(x=>x.id==='sad-avellaneda');
const iso='2026-11-14T12:00:00.000Z';
const html=(rows)=>`<!doctype html><html><head><title>Portal ABC</title></head>
 <body><header><a href="/login">Mi cuenta</a></header><main>
 <h3>Novedades</h3>${rows.join('\n')}
 <footer>PLATAFORMA ABC<a href="/sad/">SAD</a>
 <h4><a href="/servicios">Servicios del portal</a></h4></footer></main></body></html>`;
const row=(day,month,year,title,url)=>`
 <div class="views-row"><time><span>${day}</span><span>${month}</span><span>${year}</span></time>
 <h5 class="field-content"><a href="${url}">${title}</a></h5></div>`;
const one=()=>extractPublicNotices({source:brown,fetchedAt:iso,html:html([
 row('03','11','2026','Com. 578/26 Calificación Anual Docente 2026: Período de Carga y Notificación',
 '/sad/almirante-brown/inicio/com-57826-calificacion'),
 row('13','10','2026','Com. 548/26 MAD 2026/2027 Notificación de Resultados Finales',
 '/sad/almirante-brown/inicio/com-54826-mad')
])});

test('Registry contains verified unique public URLs, never guesses 135 SAD',()=>{
 const result=validateSources(catalog);
 assert.equal(result.count,6);
 assert.equal(catalog.sources.filter(x=>x.kind==='sad_novedades').length,4);
 assert.equal(catalog.unverified_channels.some(x=>x.status==='discovery_pending'),true);
 for(const s of catalog.sources)assert.ok(publicUrl(s.url));
});
test('Reject SSRF, private endpoints, arbitrary hosts and authentication data',()=>{
 for(const value of [
 'http://abc.gob.ar/sad/avellaneda/inicio',
 'https://abc.gob.ar.evil.org/',
 'https://127.0.0.1/',
 'https://abc.gob.ar:8443/sad/',
 'https://abc.gob.ar@evil.org/',
 'https://abc.gob.ar/login',
 'https://abc.gob.ar/sad/?dni=12345',
 'file:///etc/passwd','https://localhost/'
 ])assert.equal(publicUrl(value),null,value);
 assert.throws(()=>validateSources({...catalog,sources:[
  ...catalog.sources,{id:'malicious-portal',kind:'sad_novedades',
   district:'X',url:'https://evil.com/',status:'verified_page',
   public_data_only:true}
 ]}),/Nonpublic/);
});
test('Extract confirmed-looking district headlines but not private content or footer',()=>{
 const snapshot=one();
 assert.equal(snapshot.status,'ok');
 assert.equal(snapshot.notices.length,2);
 assert.equal(snapshot.notices[0].publication_date,'2026-11-03');
 assert.equal(snapshot.notices[1].publication_date,'2026-10-13');
 assert.equal(snapshot.notices[0].source_id,brown.id);
 assert.match(snapshot.notices[0].url,/abc\.gob\.ar\/sad\/almirante-brown/);
 assert.ok(snapshot.notices[0].topics.includes('calificacion_anual'));
 assert.ok(snapshot.notices[1].topics.includes('mad_acrecentamiento'));
 assert.equal(snapshot.notices[0].confidence,'public_link_only');
 assert.equal(snapshot.notices.some(n=>n.title==='Servicios del portal'),false);
});
test('URL fragments, duplicate public links and injected HTML cannot contaminate data',()=>{
 const report=extractPublicNotices({source:brown,fetchedAt:iso,html:html([
 row('01','11','2026','<img src=x onerror=alert(1)> Consulta de Puntaje Anual Docente',
  '/sad/almirante-brown/publicacion/pad#seccion'),
 row('01','11','2026','Consulta de Puntaje Anual Docente',
  '/sad/almirante-brown/publicacion/pad'),
 row('02','11','2026','Acto Público: Designación Docente',
  'https://evil.example.com/ssrf'),
 row('02','11','2026','CIRCULAR','/sad/almirante-brown/circular')
 ])});
 assert.equal(report.notices.length,1);
 assert.doesNotMatch(report.notices[0].title,/<img/);
 assert.equal(report.notices[0].url.includes('#'),false);
 assert.ok(report.notices[0].topics.includes('pad'));
});
test('Unsupported markup and calendar do not become false zero-notice states',()=>{
 const none=extractPublicNotices({html:'<html>Maintenance</html>',source:brown,fetchedAt:iso});
 assert.equal(none.status,'unsupported_layout');
 assert.deepEqual(none.notices,[]);
 const calendar=extractPublicNotices({html:'<h3>Calendario</h3>',
  source:catalog.sources.find(s=>s.kind==='calendar_index'),fetchedAt:iso});
 assert.equal(calendar.status,'unsupported_calendar_parser');
});
test('A broken fetch never causes inferred cancellation or annulment',()=>{
 const before=one(),after={status:'fetch_error',notices:[]};
 const diff=diffConfirmedSnapshots(before,after);
 assert.equal(diff.status,'incomparable');
 assert.equal(diff.not_seen.length,0);
 assert.match(diff.warning,/NOT a cancellation/);
});
test('Unavailable older entries mean not_visible, NOT automatically annulled',()=>{
 const before=one();
 const after=extractPublicNotices({source:brown,fetchedAt:iso,
  html:html([row('03','11','2026',
   'Com. 578/26 Calificación Anual Docente 2026: Período de Carga y Notificación',
   '/sad/almirante-brown/inicio/com-57826-calificacion')])});
 const diff=diffConfirmedSnapshots(before,after);
 assert.equal(diff.status,'compared');
 assert.equal(diff.not_seen.length,1);
 assert.match(diff.warning,/never treat as annulment/);
});
test('Notice updates on same official URL are changes, not new notices',()=>{
 const before=one();
 const updated=extractPublicNotices({source:brown,fetchedAt:'2026-11-15T00:00:00Z',
  html:html([row('04','11','2026',
   'Com. 578/26 Calificación Anual Docente 2026: Prórroga de notificación',
   '/sad/almirante-brown/inicio/com-57826-calificacion')])});
 const diff=diffConfirmedSnapshots(before,updated);
 assert.equal(diff.changed.length,1);
 assert.equal(diff.new.length,0);
});
test('Cluster topics across districts without claiming identical communiqués',()=>{
 const a=extractPublicNotices({source:martin,fetchedAt:iso,html:html([
  row('05','11','2026','Calificación Anual Docente: Carga SET 4',
  '/sad/general-san-martin/inicio/calificacion-anual')])});
 const b=extractPublicNotices({source:avellaneda,fetchedAt:iso,html:html([
  row('04','11','2026','Comunicación de la Calificación Anual Docente 2026',
  '/sad/avellaneda/inicio/notificacion-calificacion')])});
 const topics=sharedThemes([one(),a,b]);
 const common=topics.find(t=>t.topic==='calificacion_anual');
 assert.equal(common.district_count,3);
 assert.equal(common.examples.length,3);
 assert.equal(common.assessment,'tema_compartido_no_equivale_a_mismo_comunicado');
 assert.match(common.suggested_tool,/calificación/);
});
test('Topics only propose tools for human review, never generate documents',()=>{
 assert.ok(topicsFor('Decreto 900 - suplencias cortas')
  .some(t=>t.id==='decreto_900'));
 assert.equal(topicsFor('Normativa general').length,0);
 assert.ok(!topicsFor('PAD 2026')[0].tool.includes('reclamo enviado'));
});

test('Quilmes external SAD news link is discovered but NOT followed or trusted',()=>{
 const source=catalog.sources.find(x=>x.id==='sad-quilmes');
 const body=`<main>COMUNICADOS SAD:
 <a href="https://sites.google.com/view/comunicados-de-sad-quilmes/comunicados-abc">
 Comunicados oficiales SAD Quilmes</a><h3>Novedades</h3>
 <h5><a href="/sad/quilmes/circular">Circular</a></h5>
 <footer>PLATAFORMA ABC</footer></main>`;
 const links=discoverSourceCandidates(body,source);
 assert.equal(links.length,1);
 assert.match(links[0].candidate_url,/sites\.google\.com/);
 assert.equal(links[0].status,'external_channel_requires_verification');
 assert.match(links[0].note,/Not crawled/);
 assert.deepEqual(discoverSourceCandidates(body,catalog.sources.find(s=>s.kind==='abc_novedades')),[]);
});
test('External links are not blindly accepted or crawled',()=>{
 const source=catalog.sources.find(s=>s.id==='sad-quilmes');
 const body=`<a href="javascript:alert(1)">SAD Comunicados</a>
 <a href="http://insecure.example.com/comunicados">SAD Comunicados</a>
 <a href="https://evil.example.com@abc.gob.ar/login">SAD Comunicados</a>
 <a href="https://evil.example.com/comunicados">Comunicados SAD</a>`;
 const leads=discoverSourceCandidates(body,source);
 assert.equal(leads.length,1);
 assert.equal(leads[0].status,'external_channel_requires_verification');
 assert.equal(leads[0].candidate_url,'https://evil.example.com/comunicados');
});
