(function(){
'use strict';
if(window.__apdSideBannersPatchLoaded) return;
window.__apdSideBannersPatchLoaded = true;

const MANUAL_URL='https://articulo.mercadolibre.com.ar/MLA-1841742999-manual-operativo-de-secretaria-escolar-_JM';
const GUIA_URL='https://articulo.mercadolibre.com.ar/MLA-1847963847-guia-pruebas-secretario-escolar-pba-practica-anexos-_JM';
const NEWS=[
  ['Políticas socioeducativas','Ferias de Ciencias movilizan a la Provincia','https://abc.gob.ar/noticias/ciencia-arte-y-tecnologia-en-las-aulas-las-ferias-de-ciencias-movilizan-la-provincia'],
  ['Servicios docentes','Nueva versión de Servado','https://abc.gob.ar/noticias/servado-nueva-version-de-plataforma-de-acceso-los-servicios-de-valoracion-docentes-del-abc'],
  ['Organización docente','Reordenamiento y unificación docente','https://abc.gob.ar/noticias/se-inicio-el-proceso-de-reordenamiento-y-unificacion-docente']
];

function addStyles(){
  if(document.getElementById('apd-side-banners-style')) return;
  var s=document.createElement('style');
  s.id='apd-side-banners-style';
  s.textContent=`
    .apd-side-banner{display:none;position:absolute;top:290px;z-index:5;width:220px;max-height:none;overflow:visible;border-radius:22px;padding:18px 16px;box-shadow:0 18px 44px rgba(16,36,61,.14)}
    .apd-side-banner *{box-sizing:border-box}
    .apd-side-banner-left{left:max(12px,calc((100vw - 1180px)/2 - 236px));background:linear-gradient(180deg,#ffffff 0%,#f7fbff 100%);border:1px solid #dbe7f5;color:#061a37}
    .apd-side-banner-right{right:max(12px,calc((100vw - 1180px)/2 - 236px));background:linear-gradient(135deg,#061a37,#0b2d5f 58%,#153d78 100%);border:1px solid rgba(255,255,255,.16);color:#fff}
    .apd-side-kicker{display:inline-flex;padding:6px 10px;border-radius:999px;font-size:11px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;margin-bottom:10px}
    .apd-side-banner-left .apd-side-kicker{background:#edf4ff;color:#0f4fb8;border:1px solid #cfe1fa}
    .apd-side-banner-right .apd-side-kicker{background:rgba(255,255,255,.12);color:#dbeafe;border:1px solid rgba(255,255,255,.16)}
    .apd-side-banner h4{margin:0 0 8px;font-size:21px;line-height:1.08;letter-spacing:-.03em}
    .apd-side-banner p{margin:0 0 12px;line-height:1.45;font-size:13px}
    .apd-side-product{border:1px solid #dbe7f5;border-radius:16px;padding:12px;background:#fff;box-shadow:0 8px 22px rgba(16,36,61,.05)}
    .apd-side-product+.apd-side-product{margin-top:10px}
    .apd-side-tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}.apd-side-tags span{padding:4px 7px;border-radius:999px;font-size:10px;font-weight:900;background:#0f3460;color:#fff}.apd-side-tags span+span{background:#f5b301;color:#08235a}
    .apd-side-product h5{margin:0 0 8px;color:#0f3460;font-size:14px;line-height:1.2}.apd-side-price{display:block;margin:0 0 10px;color:#0f3460;font-size:22px;font-weight:900}
    .apd-side-btn{display:flex;justify-content:center;width:100%;padding:10px 12px;border-radius:12px;background:#2454f5;color:#fff!important;text-decoration:none;font-weight:900;font-size:12px}
    .apd-side-note{margin-top:10px;padding-top:10px;border-top:1px solid #dbe7f5;color:#5f718b;font-size:11px;line-height:1.4}
    .apd-news-item{display:block;text-decoration:none;border-radius:16px;padding:12px;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.16);color:#fff!important}
    .apd-news-item+.apd-news-item{margin-top:9px}.apd-news-item small{display:block;margin-bottom:6px;color:#dbeafe;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}.apd-news-item b{display:block;font-size:13px;line-height:1.3}
    .apd-news-actions{display:flex;flex-direction:column;gap:8px;margin-top:12px}.apd-news-actions a{display:flex;justify-content:center;border-radius:12px;padding:10px 12px;background:#fff;color:#0f3460!important;text-decoration:none;font-weight:900;font-size:12px}
    .apd-news-note{margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.14);color:#b9d7ff;font-size:11px;line-height:1.4}
    @media (min-width:1510px){.apd-side-banner{display:block}.apd-official-dgcye-banner,.apd-secretaria-ad{display:none!important}}
    @media (max-width:1509px){.apd-side-banner{display:none!important}.apd-official-dgcye-banner,.apd-secretaria-ad{display:block!important}}
  `;
  document.head.appendChild(s);
}

function ensureLeft(){
  var left=document.getElementById('apd-side-banner-left');
  if(!left){
    left=document.createElement('aside');
    left.id='apd-side-banner-left';
    left.className='apd-side-banner apd-side-banner-left';
    left.innerHTML=''
      +'<div class="apd-side-kicker">📘 Recursos digitales</div>'
      +'<h4>Secretaría Escolar PBA</h4>'
      +'<p>Materiales PDF para organizar el trabajo administrativo escolar y preparar pruebas de selección.</p>'
      +'<div class="apd-side-product"><div class="apd-side-tags"><span>PDF DIGITAL</span><span>No es libro físico</span></div><h5>Manual Operativo de Secretaría Escolar PBA</h5><strong class="apd-side-price">$16.900</strong><a class="apd-side-btn" href="'+MANUAL_URL+'" target="_blank" rel="noopener sponsored">Ver manual</a></div>'
      +'<div class="apd-side-product"><div class="apd-side-tags"><span>PDF DIGITAL</span><span>No es libro físico</span></div><h5>Guía Pruebas Secretario Escolar PBA</h5><strong class="apd-side-price">$12.999</strong><a class="apd-side-btn" href="'+GUIA_URL+'" target="_blank" rel="noopener sponsored">Ver guía</a></div>'
      +'<div class="apd-side-note"><strong>Entrega 100% digital.</strong> No se envía libro físico.</div>';
    document.body.appendChild(left);
  }
}

function ensureRight(){
  var right=document.getElementById('apd-side-banner-right');
  if(!right){
    right=document.createElement('aside');
    right.id='apd-side-banner-right';
    right.className='apd-side-banner apd-side-banner-right';
    var news=NEWS.map(function(n){return '<a class="apd-news-item" href="'+n[2]+'" target="_blank" rel="noopener"><small>'+n[0]+'</small><b>'+n[1]+'</b></a>';}).join('');
    right.innerHTML=''
      +'<div class="apd-side-kicker">🏛️ DGCyE / ABC</div>'
      +'<h4>Novedades oficiales</h4>'
      +'<p>Comunicados y noticias destacadas para consultar directamente desde la fuente oficial.</p>'
      + news
      +'<div class="apd-news-actions"><a href="https://abc.gob.ar/mas-noticias" target="_blank" rel="noopener">Ver noticias ABC</a><a href="https://abc.gob.ar/calendario-docente" target="_blank" rel="noopener">Calendario docente</a><a href="https://misservicios.abc.gob.ar/actos.publicos.digitales/" target="_blank" rel="noopener">APD oficial</a></div>'
      +'<div class="apd-news-note">APDocentePBA no reemplaza comunicaciones oficiales. Verificá siempre en ABC/DGCyE.</div>';
    document.body.appendChild(right);
  }
}

function install(){
  addStyles();
  ensureLeft();
  ensureRight();
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
[600,1500,3500].forEach(function(ms){setTimeout(install,ms);});
})();
