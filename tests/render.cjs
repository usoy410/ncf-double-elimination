const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const elements=new Map(),stored=new Map();
function element(id){if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',style:{},setAttribute(){},querySelectorAll(){return []},showModal(){this.open=true},close(){this.open=false}});return elements.get(id);}
const ctx={Bracket:require('../dist/engine.js'),document:{querySelector:element,querySelectorAll:()=>[],title:''},localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},window:{print(){}},drawBracketConnectors(){},setTimeout(){},clearTimeout(){},confirm:()=>true};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8'),ctx);
assert.equal((element('#board').innerHTML.match(/data-match=/g)||[]).length,12);assert(element('#board').innerHTML.includes('5TH–8TH'));assert(!element('#board').innerHTML.includes('Reset final'));
vm.runInContext('showMatch(11)',ctx);assert.equal((element('#match-content').innerHTML.match(/class="round"/g)||[]).length,5);
vm.runInContext('showMatch(0)',ctx);assert.equal((element('#match-content').innerHTML.match(/class="round"/g)||[]).length,3);
vm.runInContext('for(let i=0;i<12;i++)for(let g=0;g<specs[i].winTarget;g++)record(data.MLBB,i,g,0);render();exportPDF()',ctx);
const pdf=element('#print-view').innerHTML;assert.equal((pdf.match(/data-match=/g)||[]).length,12);assert(pdf.includes('Game 5'));assert(pdf.includes('FINAL PLACEMENTS'));assert(pdf.includes('M12 · BO5'));assert(!pdf.includes('Reset'));
vm.runInContext("active='CODM';showMatch(11);exportPDF()",ctx);assert(element('#match-content').innerHTML.includes('MAP 05'));assert(element('#print-view').innerHTML.includes('Map 5'));
console.log('PASS: 12 match cards; BO3/BO5 expanded panels; PDF placements and fifth-game columns; CODM map labels. DOM rendering checked without a browser.');
