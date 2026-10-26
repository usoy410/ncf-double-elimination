const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const elements=new Map(),stored=new Map();
function element(id){if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',style:{},removeAttribute(){},setAttribute(){},querySelectorAll(){return []},showModal(){this.open=true},close(){this.open=false}});return elements.get(id);}
const ctx={URL,Bracket:require('../dist/engine.js'),document:{querySelector:element,querySelectorAll:()=>[],title:''},localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},window:{location:{pathname:"/"},print(){}},drawBracketConnectors(){},setTimeout(){},clearTimeout(){},confirm:()=>true};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8'),ctx);
assert.equal((element('#board').innerHTML.match(/data-match=/g)||[]).length,12);
assert(element('#board').innerHTML.includes('WHO WILL RISE?'));
const sections=element('#board').innerHTML.split('<section');
assert(sections.find(s=>s.includes('bracket-group championship')).includes('data-match="11"'));
assert(!sections.find(s=>s.includes('bracket-group championship')).includes('data-match="8"'));
assert(sections.find(s=>s.includes('bracket-group third-place')).includes('data-match="8"'));
assert(element('#board').innerHTML.includes('5TH–8TH'));assert(!element('#board').innerHTML.includes('Reset final'));
vm.runInContext('showMatch(11)',ctx);assert.equal((element('#match-content').innerHTML.match(/class="round"/g)||[]).length,5);
vm.runInContext('showMatch(0)',ctx);assert.equal((element('#match-content').innerHTML.match(/class="round"/g)||[]).length,3);
vm.runInContext('for(let i=0;i<12;i++)for(let g=0;g<specs[i].winTarget;g++)record(data.MLBB,i,g,0);render();exportPDF()',ctx);
assert(!element('#board').innerHTML.includes('WHO WILL RISE?'));
assert(element('#board').innerHTML.includes('NCF 2026 CHAMPION'));
const pdf=element('#print-view').innerHTML;assert.equal((pdf.match(/data-match=/g)||[]).length,12);assert(pdf.includes('Game 5'));assert(pdf.includes('FINAL PLACEMENTS'));assert(pdf.includes('M12 · BO5'));assert(!pdf.includes('Reset'));
vm.runInContext("active='CODM';showMatch(11);exportPDF()",ctx);assert(element('#match-content').innerHTML.includes('MAP 05'));assert(element('#print-view').innerHTML.includes('Map 5'));
console.log('PASS: 12 match cards; BO3/BO5 expanded panels; PDF placements and fifth-game columns; CODM map labels. DOM rendering checked without a browser.');

// Spectators cannot reveal or invoke organizer actions, even without fetch.
assert.equal(element('#edit').hidden,true);
assert.equal(element('#reset').hidden,true);
element('#team-dialog').open=false;
element('#edit').onclick();
assert.equal(element('#team-dialog').open,false);
const before=vm.runInContext('JSON.stringify(data)',ctx);
(async()=>{
  await element('#reset').onclick();
  await element('#team-form').onsubmit({preventDefault(){}});
  await vm.runInContext('chooseGame(0,0,0)',ctx);
  assert.equal(vm.runInContext('JSON.stringify(data)',ctx),before);
  vm.runInContext('API.isOrganizer = () => true; updateAuthUI()',ctx);
  assert.equal(element('#edit').hidden,false);
  assert.equal(element('#reset').hidden,false);
  element('#edit').onclick();
  assert.equal(element('#team-dialog').open,true);
  vm.runInContext('API.isOrganizer = () => false; updateAuthUI()',ctx);
  assert.equal(element('#edit').hidden,true);
  assert.equal(element('#reset').hidden,true);
  assert.equal(element('#team-dialog').open,false);
  assert(element('#auth-bar').innerHTML.includes('>Login</button>'));
  ctx.window.location.assign = path => { assert.equal(path, '/login'); };
  element('#auth-btn').onclick();
  let loginArgs;
  ctx.captureLogin=(...args)=>{loginArgs=args;return {success:false}};
  vm.runInContext('API.login = captureLogin',ctx);
  element('#organizer-passcode').value='test-passcode';
  await element('#auth-form').onsubmit({preventDefault(){}});
  assert.deepEqual(loginArgs,['test-passcode']);
  assert.equal(element('#auth-error').hidden,false);
  assert.equal(element('#auth-error').textContent,'Invalid tournament passcode.');
  element('#organizer-passcode').oninput();
  assert.equal(element('#auth-error').hidden,true);
  ctx.captureLogin=()=>({success:false,error:'Unable to connect. Please try again.'});
  vm.runInContext('API.login = captureLogin',ctx);
  await element('#auth-form').onsubmit({preventDefault(){}});
  assert.equal(element('#auth-error').textContent,'Unable to connect. Please try again.');
  assert(!fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8').includes('organizer-email'));
  ctx.window.location.pathname='/login';
  ctx.window.location.replace=path=>{assert.equal(path,'/');ctx.window.location.pathname=path};
  ctx.captureLogin=()=>({success:true});
  vm.runInContext('API.login = captureLogin',ctx);
  await element('#auth-form').onsubmit({preventDefault(){}});
  assert.equal(ctx.window.location.pathname,'/');
  assert.equal(element('#auth-error').hidden,true);
  console.log('PASS: login errors appear inside the modal and clear on input or retry.');
  console.log('PASS: Login navigates to /login; successful login returns to /.');
  console.log('PASS: spectator actions blocked; organizer controls shown; logout hides controls and closes editor; passcode-only login.');
})().catch(err=>{console.error(err);process.exitCode=1});

// Verify direct navigation and the former organizer URL on fresh page loads.
for (const [pathname,authenticated,destination,opensLogin] of [
  ['/login',false,null,true],
  ['/login/',false,null,true],
  ['/login',true,'/',false],
  ['/organizer',false,'/login',false],
]) {
  const nodes=new Map();
  const lookup=selector=>{
    if(!nodes.has(selector)) nodes.set(selector,{innerHTML:'',style:{},removeAttribute(){},setAttribute(){},querySelectorAll(){return []},showModal(){this.open=true},close(){this.open=false}});
    return nodes.get(selector);
  };
  let redirected=null;
  const page={...ctx,document:{querySelector:lookup,querySelectorAll:()=>[]},window:{location:{pathname,replace(path){redirected=path}}},TournamentAPI:{isOrganizer:()=>authenticated,getProfile:()=>null}};
  vm.createContext(page);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8'),page);
  assert.equal(redirected,destination);
  assert.equal(Boolean(lookup('#auth-dialog').open),opensLogin);
}
console.log('PASS: direct /login access, existing sessions, and legacy organizer redirect.');

vm.runInContext("streamLinks={MLBB:'https://example.com/watch?x=1&y=2',CODM:'javascript:alert(1)'};renderStreams()",ctx);
assert(element('#stream-links').innerHTML.includes('Watch MLBB'));
assert(element('#stream-links').innerHTML.includes('noopener noreferrer'));
assert(!element('#stream-links').innerHTML.includes('javascript:'));
assert(!element('#stream-links').innerHTML.includes('Watch CODM'));
assert(element('#placements').innerHTML.includes('final placements'));
assert(!element('#board').innerHTML.includes('class="standings"'));
console.log('PASS: safe watch links and placements outside bracket scrolling.');
