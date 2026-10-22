import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync('account_profile_patch.js','utf8');
const html=fs.readFileSync('index.html','utf8');

test('Marketing UI is accessible and separate from classroom offer alerts',()=>{
 assert.match(ui,/id="apd-marketing-settings"/);
 assert.match(ui,/No estás inscripto automáticamente para recibir publicidad/);
 assert.match(ui,/btn-apd-marketing-optout/);
 assert.match(ui,/action:'opt_out'/);
 assert.match(ui,/loadMarketingPreference/);
 assert.match(ui,/no recibís publicidad/);
 assert.doesNotMatch(ui,/id="apd-marketing-optin"/);
 assert.doesNotMatch(ui,/action:'subscribe'/);
 assert.doesNotMatch(ui,/action:'request_confirmation'/);
 assert.doesNotMatch(ui,/alertas_email\s*=/);
});

test('Frontend is not published before verified backend release',()=>{
 // The PR only prepares account_profile_patch.js. The production HTML script remains untouched.
 assert.match(html,/account_profile_patch\.js\?v=1/);
 assert.doesNotMatch(html,/account_profile_patch\.js\?v=2/);
});

test('Only authenticated account API can operate marketing preference',()=>{
 assert.match(ui,/accountApi\('\/api\/account\/marketing-preferences'/);
 assert.match(ui,/Authorization: \`Bearer \$\{token\}\`/);
});
