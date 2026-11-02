// APDocentePBA: offline fail-closed audit of NEW/CHANGED GitHub Actions.
//
// Protects PR review against newly introduced automatic privileged workflows.
// This is a defense-in-depth check, not a substitute for branch protection.
// It only reads local git objects and workflow files. No network or credentials.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DIR='.github/workflows/';
const UNSUPERVISED=new Set([
  'push','schedule','workflow_run','repository_dispatch','pull_request_target',
  'release','create','delete','issues','issue_comment','discussion','deployment',
  'deployment_status','check_run','check_suite','status','page_build'
]);

export function events(source) {
  if(typeof source!=='string') throw Error('Missing workflow body');
  const match=source.match(/^on:[ \t]*([^\r\n]*)/m);
  if(!match) throw Error('Unrecognized GitHub event trigger: missing top-level on:');
  if(match[1].trim()) {
    const raw=match[1].split('#')[0].trim();
    if(!/^(?:[\w-]+|\[[\w\s,-]+\])$/.test(raw)) throw Error('Unrecognized inline trigger');
    return raw.replace(/[\[\]]/g,'').split(/[\s,]+/).filter(Boolean);
  }
  const start=source.slice(match.index+match[0].length);
  const end=start.search(/^[^\s#][\w-]*\s*:/m);
  const block=end<0?start:start.slice(0,end);
  const names=[...block.matchAll(/^  ([\w-]+):\s*(?:#.*)?$/gm)].map(m=>m[1]);
  if(!names.length) throw Error('Unknown nested workflow event syntax');
  return names;
}

export function signals(source) {
  const tokens=[...source.matchAll(/\bsecrets\.([A-Za-z_][A-Za-z0-9_]*)/g)].map(m=>m[1]);
  const mutations=[
    /\bwrangler\s+(?:deploy|versions\s+upload)\b/i,
    /\bgit\s+push\b/i,
    /\bsupabase\s+(?:db\s+(?:push|reset)|migration\s+up)\b/i,
    /\b(?:curl|wget)\b[^\n]*\s-X\s*(?:POST|PATCH|PUT|DELETE)\b/i,
    /\bmethod\s*:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/i,
    /\bactions\/deploy-pages\b/i,
    /\bpages\/deploy\b/i,
    /\bworkflow_dispatch\b[^\n]*\b(?:POST|PATCH)\b/i
  ].map((re,i)=>re.test(source)?i:-1).filter(i=>i>=0);
  const privileged=/(?:^|\n)\s*(?:contents|deployments|packages|actions|id-token|pages):\s*write\s*(?:#.*)?$/m.test(source)
    || /(?:^|\n)permissions:\s*(?:write-all|\{[^\n]*write[^\n]*\})/m.test(source);
  const readOnly=/(?:^|\n)permissions:\s*\n(?:  [\w-]+:\s*read\s*(?:#.*)?\n?)+/m.test(source)
    || /(?:^|\n)permissions:\s*\{\s*\}/m.test(source);
  return {tokens:[...new Set(tokens)].sort(),mutations,privileged,readOnly};
}

export function inspectChange(path,before,after) {
  const failures=[];
  if(!path.startsWith(DIR) || !/\.ya?ml$/.test(path) || after===null) return failures;
  let currentEvents;
  try { currentEvents=events(after); }
  catch(error) {return [path+': '+error.message];}
  const current=signals(after);
  const strongAuto=currentEvents.some(x=>UNSUPERVISED.has(x));
  const prAuto=currentEvents.includes('pull_request');
  if(strongAuto) {
    if(current.tokens.length||current.mutations.length||current.privileged) {
      failures.push(path+': automatic trigger + token/privileged write capability; require manual dispatch instead');
    }
    if(!current.readOnly) failures.push(path+': automatic trigger lacks explicit top-level read-only permissions');
  }
  if(prAuto && before===null && (current.tokens.length||current.mutations.length||current.privileged)) {
    failures.push(path+': new pull_request workflow exposes a credential or mutation capability');
  }
  // Automatic workflows with credentials on main are grandfathered ONLY if left untouched.
  // A change in a legacy workflow requires removing its automatic triggers.
  if(strongAuto && before!==null && before!==after && (signals(before).tokens.length||signals(before).mutations.length||signals(before).privileged)) {
    failures.push(path+': editing an existing privileged auto-trigger workflow requires removing automatic triggers');
  }
  return failures;
}

// Also block a changed script that an OLD privileged automatic workflow invokes.
// Changing only a script can otherwise bypass a workflow-file-only diff check.
export function executableScriptReferences(source) {
  const regex=/(?:^|[^\w-])(?:node|bash|python3?|pwsh|powershell)(?:\s+--?[A-Za-z0-9_-]+)*\s+["']?(scripts\/[A-Za-z0-9_./-]+\.(?:mjs|js|sh|py|ps1))/gm;
  return [...new Set([...source.matchAll(regex)].map(m=>m[1]))].sort();
}
export function linkedPrivilegedScriptRisks(changedScripts,workflowSources) {
  const changed=new Set(changedScripts);
  const failures=[];
  for(const [file,source] of workflowSources) {
    let active;
    try {active=events(source).some(x=>UNSUPERVISED.has(x));}
    catch {continue;}
    if(!active) continue;
    const features=signals(source);
    if(!(features.tokens.length||features.mutations.length||features.privileged)) continue;
    for(const script of executableScriptReferences(source)) {
      if(changed.has(script)) failures.push(script+': changed entrypoint invoked by privileged automatic workflow '+file+'; remove its automatic trigger first');
    }
  }
  return failures;
}

function git(args,allowMissing=false) {
  try {return execFileSync('git',args,{encoding:'utf8',maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']}).trimEnd();}
  catch(e) {if(allowMissing) return null;throw Error('Cannot read git history required for safe diff');}
}
export function audit(baseSha) {
  if(!/^[0-9a-f]{40}$/.test(baseSha||'')) throw Error('BASE_SHA must be exactly a 40-char commit SHA');
  git(['cat-file','-e',baseSha+'^{commit}']);
  const list=git(['diff','--name-only','--diff-filter=ACMRD',baseSha,'HEAD','--','.github/workflows/']).split('\n').filter(Boolean);
  const failures=[];
  for(const path of list) {
    if(!path.startsWith(DIR)||!/\.ya?ml$/.test(path)) continue;
    const oldText=git(['show',baseSha+':'+path],true);
    const newText=existsSync(path)?readFileSync(path,'utf8'):null;
    failures.push(...inspectChange(path,oldText,newText));
  }
  const changedScripts=git(['diff','--name-only','--diff-filter=ACMR',baseSha,'HEAD','--','scripts/']).split('\n').filter(Boolean);
  const activeSources=readdirSync(DIR).filter(name=>/\.ya?ml$/.test(name)).map(name=>{
    const path=DIR+name;
    return [path,readFileSync(path,'utf8')];
  });
  failures.push(...linkedPrivilegedScriptRisks(changedScripts,activeSources));
  return {changed_workflows:list.length,changed_scripts:changedScripts.length,failures};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const result=audit(process.env.APD_CI_BASE_SHA);
  console.log(JSON.stringify({changed_workflows:result.changed_workflows,rejected_changes:result.failures},null,2));
  if(result.failures.length) {
    console.error('APD_AUTO_WORKFLOW_RISK_GATE_FAILED');
    process.exitCode=1;
  } else console.log('APD_AUTO_WORKFLOW_RISK_GATE_PASSED: no new unsupervised write capabilities in workflow diff');
}
