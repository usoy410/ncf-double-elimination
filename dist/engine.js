(function(root){
const defaults={MLBB:['CHS','CTED','CCS','CCJE','CAS','CAF','COE','CBM'],CODM:['CHS','CBM','CTED','COE','CCJE','CAS','CCA','CAF']};
const seed=i=>({seed:i}),w=i=>({match:i,result:'winner'}),l=i=>({match:i,result:'loser'});
const specs=[
 ['Upper quarterfinal 1',seed(0),seed(1)],['Upper quarterfinal 2',seed(2),seed(3)],['Upper quarterfinal 3',seed(4),seed(5)],['Upper quarterfinal 4',seed(6),seed(7)],
 ['Upper semifinal 1',w(0),w(1)],['Upper semifinal 2',w(2),w(3)],['Upper final',w(4),w(5)],
 ['Lower round 1 · A',l(0),l(1)],['Lower round 1 · B',l(2),l(3)],
 ['Lower round 2 · A',w(7),l(5)],['Lower round 2 · B',w(8),l(4)],
 ['Lower semifinal',w(9),w(10)],['Lower final',w(11),l(6)],
 ['Grand final',w(6),w(12)],['Reset final',w(6),w(12)]
].map(([title,...sources])=>({title,sources}));
const groups=[{title:'UPPER BRACKET',columns:[['QUARTERFINALS',[0,1,2,3]],['SEMIFINALS',[4,5]],['UPPER FINAL',[6]]]},{title:'LOWER BRACKET',columns:[['ROUND 1',[7,8]],['ROUND 2',[9,10]],['SEMIFINAL',[11]],['LOWER FINAL',[12]]]},{title:'CHAMPIONSHIP',columns:[['GRAND FINAL',[13]],['RESET IF NEEDED',[14]]]}];
const fresh=()=>Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,{names:[...v],games:specs.map(()=>[null,null,null])}]));
const scores=g=>[g.filter(v=>v===0).length,g.filter(v=>v===1).length];
function derive(t){const out=[];for(let i=0;i<specs.length;i++){const seeds=specs[i].sources.map(s=>s.seed??out[s.match][s.result]);const enabled=i!==14||(out[13].winner!==null&&out[13].winner===out[12].winner);const ready=enabled&&seeds.every(s=>s!==null);const score=ready?scores(t.games[i]):[0,0];const side=score.findIndex(v=>v>=2);out.push({seeds,enabled,ready,score,winner:side<0?null:seeds[side],loser:side<0?null:seeds[1-side]});}return out;}
function champion(ms){if(ms[13].winner===null)return null;return ms[14].enabled?ms[14].winner:ms[13].winner;}
function record(t,i,g,side){const before=derive(t),games=t.games[i];if(!before[i]?.ready||![0,1,2].includes(g)||![0,1].includes(side)||(g>0&&games[g-1]===null)||(g===2&&games[0]===games[1]))return false;games[g]=games[g]===side?null:side;for(let j=g+1;j<3;j++)games[j]=null;for(let j=i+1;j<specs.length;j++){const now=derive(t);if(now[j].enabled!==before[j].enabled||now[j].seeds.some((s,k)=>s!==before[j].seeds[k]))t.games[j]=[null,null,null];}return true;}
const sourceLabel=s=>s.seed!==undefined?`Seed ${s.seed+1}`:`${s.result==='winner'?'Winner':'Loser'} of M${s.match+1}`;
const api={defaults,specs,groups,fresh,scores,derive,champion,record,sourceLabel};if(typeof module!=='undefined')module.exports=api;else root.Bracket=api;
})(globalThis);
