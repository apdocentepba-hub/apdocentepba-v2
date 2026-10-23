import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ui=fs.readFileSync('account_profile_patch.js','utf8');
const html=fs.readFileSync('index.html','utf8');

test('Marketing UI is accessible and separate from classroom offer alerts',()=>{
 assert.match(ui,/id="apd-marketing-settings"/);
 assert.match(ui,/No estás inscripto automáticamente para recibir publicidad/);
 assert.match(ui,/btn-apd-marketing-optout/);
 assert.match(ui,/action:'opt_out'/);
 assert.match(ui,/loadMarketingPreference/);
 assert.match(ui,/confirmación está pendiente/);
 assert.doesNotMatch(ui,/id="apd-marketing-optin"/);
 assert.doesNotMatch(ui,/action:'subscribe'/);
 assert.doesNotMatch(ui,/action:'request_confirmation'/);
 assert.doesNotMatch(ui,/alertas_email\s*=/);
});

test('Frontend cache is version-bumped only in gated PR',()=>{
 // The PR only prepares account_profile_patch.js. The production HTML script remains untouched.
 assert.match(html,/account_profile_patch\.js\?v=2/);
 assert.doesNotMatch(html,/account_profile_patch\.js\?v=1/);
});

test('Only authenticated account API can operate marketing preference',()=>{
 assert.match(ui,/accountApi\('\/api\/account\/marketing-preferences'/);
 assert.match(ui,/Authorization: \`Bearer \$\{token\}\`/);
});

test('marketing preference follows login and account switches without cross-user state leakage', async () => {
  let token = '';
  const requestLog = [];
  const pending = new Map();
  const node = () => ({ textContent:'', disabled:false, dataset:{},
    addEventListener:()=>{} });
  const box = {innerHTML:''};
  const statusNode = node(), messageNode = node(), buttonNode = node();
  let fullRenders = 0;
  let markup = '';
  Object.defineProperty(box,'innerHTML',{
    get:()=>markup,
    set:value=>{markup=value;fullRenders++;}
  });
  const document = {
    getElementById:id=>({
      'panel-datos-docente':box,
      'apd-marketing-status':statusNode,
      'apd-marketing-message':messageNode,
      'btn-apd-marketing-optout':buttonNode
    }[id] || null),
    querySelectorAll:()=>[]
  };
  const fakeWindow={
    API_URL:'https://example.invalid',
    obtenerAuthBearer:()=>token,
    renderDashboard:()=>{}
  };
  const respond=(payload,status=200)=>({
    status,ok:status>=200&&status<300,
    json:async()=>payload
  });
  const fetch=async(url,opts)=>{
    const bearer=opts.headers.Authorization;
    requestLog.push({url,bearer,method:opts.method});
    if(opts.method==='POST') return respond({ok:true,status:'unsubscribed'});
    return await new Promise(resolve=>pending.set(bearer,resolve));
  };
  vm.runInNewContext(ui,{
    window:fakeWindow,document,fetch,
    localStorage:{getItem:()=>token},
    console:{error:()=>{}},
    setTimeout:()=>{throw new Error('Unexpected boot retry')},
    URL,Promise,Set,JSON
  });
  assert.equal(requestLog.length,0,'Do not query the marketing API while logged out');

  token='session-A';
  fakeWindow.renderDashboard({docente:{nombre:'A'}});
  assert.equal(requestLog.length,1);
  assert.equal(requestLog[0].bearer,'Bearer session-A');

  token='session-B';
  fakeWindow.renderDashboard({docente:{nombre:'B'}});
  assert.equal(requestLog.length,2);
  assert.equal(requestLog[1].bearer,'Bearer session-B');

  const afterRender=fullRenders;
  pending.get('Bearer session-B')(respond({ok:true,marketing:{
    status:'not_requested', eligible_for_campaign:false
  }}));
  for(let i=0;i<5;i++)await Promise.resolve();
  assert.equal(fakeWindow.__apdAccountProfileState.marketing.status,'not_requested');
  assert.equal(fullRenders,afterRender,
    'Async preferences must not overwrite unsaved profile edits');

  pending.get('Bearer session-A')(respond({ok:true,marketing:{
    status:'subscribed',eligible_for_campaign:true
  }}));
  for(let i=0;i<5;i++)await Promise.resolve();
  assert.equal(fakeWindow.__apdAccountProfileState.marketing.status,'not_requested',
    'A stale request must never display an earlier account preference');

  await fakeWindow.apdAccountProfilePatch.optOutMarketing();
  assert.equal(fakeWindow.__apdAccountProfileState.marketing.status,'unsubscribed');
  assert.equal(buttonNode.disabled,true);
  assert.match(messageNode.textContent,/Brevo debe verificarse por separado/);
  assert.equal(requestLog.filter(x=>x.method==='POST').length,1);
  assert.equal(requestLog.at(-1).bearer,'Bearer session-B');
});
