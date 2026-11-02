// Static audit for APDocentePBA workflows: reads YAML as text, NEVER executes workflow steps.
// Deliberately conservative; output is an inventory for review, not a security proof.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = '.github/workflows';
const findings = [];
for (const file of readdirSync(root).filter((n) => /\.ya?ml$/.test(n)).sort()) {
  const content = readFileSync(join(root, file), 'utf8');
  const match = content.match(/^on:\s*\n([\s\S]*?)(?=^[A-Za-z_][^\n]*:|$(?![\s\S]))/m);
  if (!match) { findings.push({file, severity:'review', reason:'Unrecognized on: section'}); continue; }
  const block = match[1];
  const activeTriggers = [...block.matchAll(/^  (push|schedule|workflow_run|repository_dispatch|pull_request_target):/gm)].map((m) => m[1]);
  if (!activeTriggers.length) continue;
  const sideEffects = [
    ['cloudflare_token', /CLOUDFLARE_API_TOKEN/],
    ['database_credentials', /(?:SUPABASE_DB_URL|DATABASE_URL|APD_SUPABASE_DB_URL)/],
    ['database_mutation', /(?:supabase\s+db\s+(?:push|reset)|supabase\s+migration\s+up|psql\s+.*\b(?:DROP|ALTER)\b)/i],
    ['api_write', /(?:\/deployments\b|wrangler\s+deploy|git\s+push|curl[^\n]*-X\s+(?:POST|PATCH|PUT|DELETE))/i],
    ['repository_write', /^\s*contents:\s*write\s*$/m]
  ].filter(([, regex]) => regex.test(content)).map(([name]) => name);
  if (!sideEffects.length) continue;
  findings.push({file, triggers:activeTriggers, side_effect_signals:sideEffects});
}
console.log(JSON.stringify({workflow_count:readdirSync(root).filter((n)=>/\.ya?ml$/.test(n)).length, automatic_write_risk_candidates:findings},null,2));
console.log('APD_STATIC_TRIGGER_AUDIT_REPORT_ONLY: no secrets, network calls or deployments');
