import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const LIVE_DIR = path.join(ROOT, 'tmp', 'live-modules');
const OUT = path.join(ROOT, 'audit-out');
fs.mkdirSync(OUT, { recursive: true });

const skipDirs = new Set(['.git','node_modules','audit-out','tmp']);
function walk(dir) {
  const out=[];
  for (const ent of fs.readdirSync(dir,{withFileTypes:true})) {
    if (ent.isDirectory() && skipDirs.has(ent.name)) continue;
    const p=path.join(dir,ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function rel(p){return path.relative(ROOT,p).replaceAll('\\','/');}
function text(p){try{return fs.readFileSync(p,'utf8')}catch{return ''}}
function sha256(s){return crypto.createHash('sha256').update(s).digest('hex')}
function lineOf(src,index){return src.slice(0,index).split('\n').length}

const files=walk(ROOT);
const findings=[];
function add(severity, code, file, line, message, evidence='') {
  findings.push({severity,code,file,line,message,evidence:String(evidence).slice(0,260)});
}

const patterns=[
  ['CRITICAL','AUTH_PLAINTEXT_PASSWORD',/password_hash\s*:\s*password\b/g,'Registration appears to store the submitted password directly in password_hash.'],
  ['CRITICAL','AUTH_BEARER_USERID_FALLBACK',/userId\s*=\s*token\s*;/g,'Unknown bearer token falls back to being treated as a user_id, enabling ID-as-token authentication if the ID is known.'],
  ['HIGH','PUBLIC_TEST_EMAIL_ROUTE',/\/test-email-sweep/g,'Email sweep test route exists; verify it is authenticated and dry-run by default.'],
  ['HIGH','PUBLIC_TEST_MAIL_ROUTE',/\/test-(?:mail|digest)/g,'Email test/digest route exists; verify it cannot send mail anonymously.'],
  ['MEDIUM','PUBLIC_TEST_DB_ROUTE',/\/api\/test-db/g,'Database test endpoint exists; verify it reveals no sensitive production information.'],
  ['MEDIUM','CORS_WILDCARD',/Access-Control-Allow-Origin['"`]?:?\s*['"`]\*['"`]/g,'Wildcard CORS is used in API responses; review authenticated endpoints.'],
  ['HIGH','RAW_PASSWORD_COMPARE',/(?:password_hash\s*===\s*password|password\s*===\s*[^\n]*password_hash|password_hash\s*!==\s*password)/g,'Password appears to be compared directly rather than verified with a password KDF.'],
  ['MEDIUM','TOKEN_USERID_FALLBACK_COMMENT',/userId\s*=\s*token/g,'Bearer token to user-id fallback pattern detected.'],
];

for (const p of files) {
  if (!/\.(?:js|mjs|html|yml|yaml|md|json|toml|sql|py)$/i.test(p)) continue;
  const src=text(p);
  for (const [severity,code,re,msg] of patterns) {
    re.lastIndex=0;
    let m; while((m=re.exec(src))) add(severity,code,rel(p),lineOf(src,m.index),msg,m[0]);
  }

  if (/\.github\/workflows\/.+\.ya?ml$/.test(rel(p))) {
    const deploysCloudflare=/workers\/scripts\/\$\{?[^\n]*\/deployments|wrangler\s+deploy|deploy:worker/.test(src);
    const pushMain=/push:[\s\S]{0,240}branches:[\s\S]{0,120}-\s*main\b/.test(src);
    const hardVersion=/(?:EXPECTED_(?:ACTIVE|OLD)_VERSION(?:_ID)?|CANDIDATE_VERSION_ID):\s*[a-f0-9-]{20,}/i.test(src);
    const dispatch=/workflow_dispatch\s*:/.test(src);
    if (deploysCloudflare && pushMain) add('HIGH','CI_AUTO_PROD_DEPLOY_MAIN',rel(p),1,'Workflow can deploy Cloudflare from a push to main; review accidental-production-change risk.');
    if (deploysCloudflare && hardVersion) add('MEDIUM','CI_HARDCODED_WORKER_VERSION',rel(p),1,'Production-capable workflow contains hard-coded Worker version IDs and may become dangerously stale.');
    if (deploysCloudflare && dispatch && !/rollback/i.test(src)) add('HIGH','CI_DEPLOY_NO_ROLLBACK_MARKER',rel(p),1,'Manual production-capable workflow has no obvious rollback handling.');
  }
}

function inspectSource(label, src, fileLabel) {
  const sourceFindings=[];
  function liveAdd(severity,code,index,message,evidence=''){
    const f={severity,code,file:fileLabel,line:lineOf(src,index),message,evidence:String(evidence).slice(0,260)};
    findings.push(f); sourceFindings.push(f);
  }
  for (const [severity,code,re,msg] of patterns) {
    re.lastIndex=0; let m; while((m=re.exec(src))) liveAdd(severity,`LIVE_${code}`,m.index,msg,m[0]);
  }
  const routes=[...src.matchAll(/path\s*===\s*["'`]([^"'`]+)["'`]/g)].map(m=>m[1]);
  const duplicateRoutes=[...new Set(routes.filter((r,i)=>routes.indexOf(r)!==i))];
  for (const route of duplicateRoutes) liveAdd('MEDIUM','LIVE_DUPLICATE_ROUTE',src.indexOf(route),`Route ${route} appears more than once in the active Worker router.`,route);

  for (const route of ['/test-email-sweep','/test-mail','/test-digest']) {
    const i=src.indexOf(`path === "${route}"`);
    if(i>=0){
      const block=src.slice(Math.max(0,i-500),Math.min(src.length,i+1800));
      const auth=/requireAdmin|requireAuth|getSessionUserByBearer|Authorization/.test(block);
      if(!auth) liveAdd('CRITICAL','LIVE_UNAUTH_MUTATING_TEST_ROUTE',i,`${route} appears reachable without an authentication guard near the route handler.`,route);
    }
  }

  const registerIdx=src.indexOf('async function handleRegister');
  if(registerIdx>=0){
    const block=src.slice(registerIdx,registerIdx+5000);
    if(/return\s+jsonResponse\([\s\S]{0,1200}data:\s*nuevoUsuario/.test(block) && /password_hash\s*:\s*password/.test(block)) {
      liveAdd('CRITICAL','LIVE_PASSWORD_RETURN_RISK',registerIdx,'Registration stores raw password in password_hash and returns the inserted user representation; this may disclose the credential in the response.');
    }
  }
  return {label,sha256:sha256(src),bytes:Buffer.byteLength(src),routes:[...new Set(routes)].sort(),finding_count:sourceFindings.length};
}

const liveSummaries=[];
if(fs.existsSync(LIVE_DIR)) {
  for(const name of fs.readdirSync(LIVE_DIR)) {
    const p=path.join(LIVE_DIR,name); if(!fs.statSync(p).isFile()) continue;
    const src=text(p); liveSummaries.push(inspectSource(name,src,`LIVE:${name}`));
  }
}

// Repo/live drift for matching module names.
for(const live of liveSummaries){
  const repoPath=path.join(ROOT,live.label);
  if(fs.existsSync(repoPath)){
    const repoSrc=text(repoPath); const repoSha=sha256(repoSrc);
    if(repoSha!==live.sha256) add('MEDIUM','REPO_LIVE_DRIFT',live.label,1,'Repository module differs from currently deployed production module.',`repo=${repoSha.slice(0,12)} live=${live.sha256.slice(0,12)}`);
  } else add('MEDIUM','LIVE_MODULE_NOT_IN_REPO',live.label,1,'Active production module is not present at repository root.');
}

const severityRank={CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3};
findings.sort((a,b)=>(severityRank[a.severity]??9)-(severityRank[b.severity]??9)||a.file.localeCompare(b.file)||a.line-b.line);

const inventory={
  total_files: files.length,
  js_files: files.filter(p=>/\.(?:js|mjs)$/i.test(p)).length,
  workflow_files: files.filter(p=>/\.github\/workflows\/.+\.ya?ml$/.test(rel(p))).length,
  sql_files: files.filter(p=>/\.sql$/i.test(p)).length,
  html_files: files.filter(p=>/\.html$/i.test(p)).length,
  largest_files: files.map(p=>({file:rel(p),bytes:fs.statSync(p).size})).sort((a,b)=>b.bytes-a.bytes).slice(0,25)
};

const summary={generated_at:new Date().toISOString(),inventory,live:liveSummaries,counts:{
  critical:findings.filter(x=>x.severity==='CRITICAL').length,
  high:findings.filter(x=>x.severity==='HIGH').length,
  medium:findings.filter(x=>x.severity==='MEDIUM').length,
  low:findings.filter(x=>x.severity==='LOW').length,
},findings};
fs.writeFileSync(path.join(OUT,'static-audit.json'),JSON.stringify(summary,null,2));

const md=[];
md.push('# AlertasAPD Full Static + Live Worker Audit','',`Generated: ${summary.generated_at}`,'');
md.push(`Repository files scanned: **${inventory.total_files}**; workflows: **${inventory.workflow_files}**; JS/MJS: **${inventory.js_files}**.`,'');
md.push(`Findings: **${summary.counts.critical} Critical**, **${summary.counts.high} High**, **${summary.counts.medium} Medium**, **${summary.counts.low} Low**.`,'');
md.push('## Findings','');
for(const f of findings) md.push(`- **${f.severity} ${f.code}** — \`${f.file}:${f.line}\` — ${f.message}${f.evidence?` Evidence: \`${f.evidence.replaceAll('`','\\`')}\``:''}`);
md.push('','## Live modules','');
for(const x of liveSummaries) md.push(`- \`${x.label}\`: ${x.bytes} bytes, sha256 \`${x.sha256}\`, ${x.routes.length} routes, ${x.finding_count} pattern findings.`);
fs.writeFileSync(path.join(OUT,'report.md'),md.join('\n'));
console.log(JSON.stringify({counts:summary.counts,inventory:{total_files:inventory.total_files,workflow_files:inventory.workflow_files,js_files:inventory.js_files},live_modules:liveSummaries.map(x=>x.label)},null,2));
if(summary.counts.critical>0) process.exitCode=2;
