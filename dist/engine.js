(function(root){
const defaults={MLBB:['CHS','CTED','CCS','CCJE','CAS','CAF','COE','CBM'],CODM:['CHS','CBM','CTED','COE','CCJE','CAS','CCA','CAF']};
const seed=i=>({seed:i}),w=i=>({match:i,result:'winner'}),l=i=>({match:i,result:'loser'});
const specs=[
 ['Quarterfinal 1',seed(0),seed(1)],['Quarterfinal 2',seed(2),seed(3)],['Quarterfinal 3',seed(4),seed(5)],['Quarterfinal 4',seed(6),seed(7)],
 ['Championship semifinal 1',w(0),w(1)],['Championship semifinal 2',w(2),w(3)],
 ['Placement semifinal 1',l(0),l(1)],['Placement semifinal 2',l(2),l(3)],
 ['Third-place match',l(4),l(5)],['Fifth-place match',w(6),w(7)],['Seventh-place match',l(6),l(7)],['Championship',w(4),w(5)]
].map(([title,...sources],i)=>({title,sources,bestOf:i===11?5:3,winTarget:i===11?3:2}));
const groups=[
 {title:'CHAMPIONSHIP BRACKET',note:'Quarterfinal winners compete for 1st–4th place',columns:[['QUARTERFINALS',[0,1,2,3]],['CHAMPIONSHIP SEMIFINALS',[4,5]],['1ST & 3RD PLACE',[11,8]]]},
 {title:'PLACEMENT BRACKET · 5TH–8TH',note:'Quarterfinal losers compete only for 5th–8th place',columns:[['PLACEMENT SEMIFINALS',[6,7]],['5TH & 7TH PLACE',[9,10]]]}
];
const blankGames=()=>specs.map(s=>Array(s.bestOf).fill(null));
const fresh=()=>Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,{names:[...v],games:blankGames()}]));
const scores=g=>[g.filter(v=>v===0).length,g.filter(v=>v===1).length];
function derive(t){const out=[];for(let i=0;i<specs.length;i++){const seeds=specs[i].sources.map(s=>s.seed??out[s.match][s.result]);const ready=seeds.every(s=>s!==null);const score=ready?scores(t.games[i]):[0,0];const side=score.findIndex(v=>v>=specs[i].winTarget);out.push({seeds,ready,score,winner:side<0?null:seeds[side],loser:side<0?null:seeds[1-side]});}return out;}
const champion=ms=>ms[11].winner;
function placements(ms){return [11,8,9,10].flatMap(i=>[ms[i].winner,ms[i].loser]);}
function gameSkipped(games,g,target){return scores(games.slice(0,g)).some(n=>n>=target);}
function record(t,i,g,side){if(!Number.isInteger(i)||!specs[i]||!Number.isInteger(g)||g<0||g>=specs[i].bestOf||![0,1].includes(side))return false;const before=derive(t),games=t.games[i];if(!before[i].ready||(g>0&&games[g-1]===null)||gameSkipped(games,g,specs[i].winTarget))return false;games[g]=games[g]===side?null:side;for(let j=g+1;j<games.length;j++)games[j]=null;for(let j=i+1;j<specs.length;j++){const now=derive(t);if(now[j].seeds.some((s,k)=>s!==before[j].seeds[k]))t.games[j]=Array(specs[j].bestOf).fill(null);}return true;}
const sourceLabel=s=>s.seed!==undefined?`Seed ${s.seed+1}`:`${s.result==='winner'?'Winner':'Loser'} of M${s.match+1}`;
function valid(v,lengths){return v&&Object.keys(defaults).every(k=>v[k]?.names?.length===8&&v[k].names.every(x=>typeof x==='string')&&v[k]?.games?.length===lengths.length&&v[k].games.every((g,i)=>Array.isArray(g)&&g.length===lengths[i]&&g.every(x=>x===null||x===0||x===1)));}
function migrate(old){const next=fresh();for(const k of Object.keys(defaults)){next[k].names=[...old[k].names];for(let i=0;i<6;i++)next[k].games[i]=[...old[k].games[i]];}return next;}
const api={defaults,specs,groups,blankGames,fresh,scores,derive,champion,placements,gameSkipped,record,sourceLabel,valid,migrate};if(typeof module!=='undefined')module.exports=api;else root.Bracket=api;
})(globalThis);
