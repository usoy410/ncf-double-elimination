const assert=require('node:assert/strict');const E=require('../dist/engine.js');
const win=(t,i,s)=>{for(let g=0;g<E.specs[i].winTarget;g++)assert(E.record(t,i,g,s));};
for(const title of ['MLBB','CODM'])for(let pattern=0;pattern<4096;pattern++){
 const t=E.fresh()[title];assert.equal(t.games.length,12);
 for(let i=0;i<12;i++)win(t,i,(pattern>>i)&1);
 const ms=E.derive(t),ranks=E.placements(ms),appearances=Array(8).fill(0);
 assert.equal(new Set(ranks).size,8);assert(ranks.every(x=>x!==null));assert.equal(E.champion(ms),ranks[0]);
 ms.forEach(m=>{assert.notEqual(m.seeds[0],m.seeds[1]);m.seeds.forEach(s=>appearances[s]++);});assert.deepEqual(appearances,Array(8).fill(3));
 const qWinners=ms.slice(0,4).map(m=>m.winner),qLosers=ms.slice(0,4).map(m=>m.loser);
 assert(ranks.slice(0,4).every(s=>qWinners.includes(s)));assert(ranks.slice(4).every(s=>qLosers.includes(s)));
}
for(const result of [[0,0,0],[1,1,1],[0,1,0,0],[1,0,1,1],[0,1,0,1,0],[1,0,1,0,1]]){
 const t=E.fresh().MLBB;for(let i=0;i<6;i++)win(t,i,0);
 result.forEach((side,g)=>{if(g<2)assert.equal(E.champion(E.derive(t)),null);assert(E.record(t,11,g,side));});
 assert.notEqual(E.champion(E.derive(t)),null);assert.equal(E.record(t,11,result.length,0),false);
 if(result.length>3){E.record(t,11,0,1-result[0]);assert(t.games[11].slice(1).every(x=>x===null));assert.equal(E.champion(E.derive(t)),null);}
}
let t=E.fresh().MLBB;assert.equal(E.record(t,4,0,0),false);assert.equal(E.record(t,0,1,0),false);
for(let i=0;i<12;i++)win(t,i,0);E.record(t,0,0,1);
for(const i of [4,6,8,9,10,11])assert(t.games[i].every(x=>x===null));for(const i of [1,2,3,5,7])assert.equal(E.derive(t)[i].score[0],2);
t=E.fresh().MLBB;E.record(t,0,0,0);E.record(t,0,1,1);assert.equal(E.derive(t)[0].winner,null);E.record(t,0,2,1);assert.equal(E.derive(t)[0].winner,1);assert.equal(E.derive(t)[6].seeds[0],0);
const old=Object.fromEntries(Object.keys(E.defaults).map(k=>[k,{names:[...E.defaults[k]],games:Array.from({length:15},()=>[0,0,null])}]));old.MLBB.names[0]='Custom team';const migrated=E.migrate(old);assert(E.valid(migrated,E.specs.map(s=>s.bestOf)));assert.equal(migrated.MLBB.names[0],'Custom team');assert.deepEqual(migrated.MLBB.games.slice(0,6),old.MLBB.games.slice(0,6));assert(migrated.MLBB.games.slice(6).flat().every(x=>x===null));assert.equal(migrated.MLBB.games[11].length,5);assert.equal(old.MLBB.games.length,15);
assert.equal(E.specs.filter(s=>s.bestOf===3).length,11);assert.equal(E.specs.filter(s=>s.bestOf===5).length,1);
console.log('PASS: 4,096 outcome paths per title; unique 1st–8th placements; exactly three series per team; no lower-to-championship route; BO5 3–0/3–1/3–2; BO3; corrections; migration.');
