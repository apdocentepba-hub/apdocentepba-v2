/* Read-only inventory of blocking local script assets in the published HTML.
 * No network, no telemetry and no changes to the website.
 */
import {readFileSync,existsSync,statSync} from "node:fs";
import {basename} from "node:path";
const html=readFileSync("index.html","utf8");
const scriptTag=/<script\b([^>]*)\bsrc=(?:"([^"]+)"|'([^']+)')([^>]*)><\/script>/gi;
const assets=[];
for(const m of html.matchAll(scriptTag)){
 const attrs=m[1]+" "+m[4],raw=m[2]||m[3];
 const path=raw.split(/[?#]/)[0].replace(/^\.\//,"");
 const external=/^[a-z]+:\/\//i.test(raw)||raw.startsWith("//");
 const asyncFlag=/\basync(?:\s|=|$)/i.test(attrs);
 const deferFlag=/\bdefer(?:\s|=|$)/i.test(attrs);
 const moduleFlag=/\btype\s*=\s*["']module["']/i.test(attrs);
 const local=(!external&&!path.startsWith("/")&&!path.includes(".."));
 const bytes=local&&existsSync(path)?statSync(path).size:null;
 assets.push({name:basename(path),local,blocking:!asyncFlag&&!deferFlag&&!moduleFlag,bytes});
}
const localAssets=assets.filter(x=>x.local);
const totalBytes=localAssets.reduce((n,a)=>n+(a.bytes||0),0);
const missing=localAssets.filter(a=>a.bytes===null).map(x=>x.name);
const report={
 script_tag_count:assets.length,
 local_script_count:localAssets.length,
 blocking_local_script_count:localAssets.filter(x=>x.blocking).length,
 total_local_script_bytes_uncompressed:totalBytes,
 missing_local_scripts:missing,
 largest_local_scripts:localAssets.filter(x=>x.bytes!==null)
   .sort((a,b)=>b.bytes-a.bytes).slice(0,8).map(({name,bytes,blocking})=>({name,bytes,blocking})),
 caveat:"Static asset inventory, not a network waterfall, parse-time measurement, or authenticated panel load timing"
};
console.log(JSON.stringify(report,null,2));
