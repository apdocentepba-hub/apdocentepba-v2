/* Pure guard for APDocente radar release. No I/O or network.
 * A normal index.html redesign must preserve the exact existing radar script.
 * An intentional radar version change must be one consecutive version bump
 * and the ONLY difference to the public HTML. Everything else fails closed.
 */
const TARGET = 'candidates/radar_provincia_live_20261102.js';
const scriptPattern = /<script\b[^>]*\bsrc\s*=\s*["'](candidates\/radar_provincia_live_20261102\.js\?v=(\d+))["'][^>]*><\/script>/gi;

function readScript(html,role){
  if(typeof html!=="string" || !html.includes("<html"))
    throw Error("Radar release guard: invalid "+role+" HTML");
  const tags=[...html.matchAll(scriptPattern)];
  const allMentions=html.match(/radar_provincia_live_20261102\.js/gi)||[];
  if(tags.length!==1||allMentions.length!==1)
    throw Error("Radar release guard: "+role+" must contain exactly one canonical radar script");
  const version=Number(tags[0][2]);
  if(!Number.isSafeInteger(version)||version<1||version>999999)
    throw Error("Radar release guard: invalid "+role+" script version");
  return {tag:tags[0][0],version,path:tags[0][1]};
}
export function auditRadarReleaseHtml(mainHtml,candidateHtml){
 const oldRef=readScript(mainHtml,"main");
 const newRef=readScript(candidateHtml,"candidate");
 // Include private panel and canonical JS prerequisites even on an ordinary PR.
 for(const [value,label] of [[candidateHtml,"candidate"],[mainHtml,"main"]]){
  if(value.split('id="panel-radar-provincia"').length-1!==1 ||
     value.split('id="btn-refresh-provincia"').length-1!==1)
   throw Error("Radar release guard: "+label+" missing native radar panel controls");
 }
 const appIndex=candidateHtml.indexOf('src="app_v2.js?v=20&rev=20261102-unverified-plan"');
 const radarIndex=candidateHtml.indexOf(newRef.tag);
 if(appIndex<0||radarIndex<appIndex)
  throw Error("Radar release guard: native alert/app script must load before radar");
 if(oldRef.tag===newRef.tag)
  return Object.freeze({mode:"existing-radar-preserved",version:newRef.version,needsLiveAssetProof:false});
 if(newRef.version!==oldRef.version+1)
  throw Error("Radar release guard: version must increase exactly once");
 if(candidateHtml!==mainHtml.replace(oldRef.tag,newRef.tag))
  throw Error("Radar release guard: radar release must change only one script tag");
 return Object.freeze({mode:"isolated-radar-release",fromVersion:oldRef.version,
  version:newRef.version,needsLiveAssetProof:true});
}
