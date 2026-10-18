import test from 'node:test';import assert from 'node:assert/strict';
import {initial,successors,apply,actions} from '../src/engine.js';
import {captureRoutes,chooseRoute} from '../src/route-ai.js';import {seeded} from '../src/ai.js';
test('wall-aware capture certificates exactly match exhaustive legal successors',()=>{
 for(let layout=0;layout<3;layout++)for(let game=0;game<8;game++){
  let s=initial(layout,game%2),rng=seeded(971+game*73+layout);
  for(let ply=0;ply<50&&s.winner===null;ply++){
   for(let p=0;p<2;p++){
    const expected=successors({...s,turn:p}).filter(c=>c.n.scores[p]>s.scores[p]).map(c=>c.n.players[p]);
    const actual=captureRoutes(s,p);assert.deepEqual([...actual.keys()].sort((a,b)=>a-b),[...new Set(expected)].sort((a,b)=>a-b));
    for(const [star,a] of actual)assert.equal(apply({...s,turn:p},a).players[p],star);
   }
   const moves=actions(s);s=apply(s,moves[Math.floor(rng()*moves.length)]);
  }
 }
});
test('route candidates preserve immediate win and preventable-loss priorities',()=>{
 const win={walls:[],stars:[6],players:[0,48],scores:[2,2],turn:0,ply:0,winner:null};
 const defend={walls:[7,12,2,18,38,32,36,40],stars:[24],players:[45,31],scores:[2,2],turn:0,ply:7,winner:null};
 for(const progress of [false,true])for(const variety of [0,25])for(let seed=0;seed<8;seed++){
  assert.equal(apply(win,chooseRoute(win,{rng:seeded(seed),progress,variety})).winner,0);
  const next=apply(defend,chooseRoute(defend,{rng:seeded(seed),progress,variety}));
  assert.equal(successors(next).some(c=>c.n.winner===1),false);
 }
});
test('routes include preparing a stopping wall and moving a blocking wall away',()=>{
 const s={walls:[18],stars:[24],players:[21,6],scores:[0,0],turn:0,ply:0,winner:null};
 const a=captureRoutes(s,0).get(24);assert.deepEqual(a,{wall:{wall:0,to:25},dir:1});
 assert.equal(apply(s,a).scores[0],1);
 const blocked={...s,walls:[23],stars:[27]};
 const b=captureRoutes(blocked,0).get(27);assert.ok(b?.wall);assert.equal(apply(blocked,b).scores[0],1);
});
test('new challenge CPU finds a certified forced win that the old CPU misses',async()=>{
 const fs=await import('node:fs');const f=JSON.parse(fs.readFileSync(new URL('../reports/route-tactic.json',import.meta.url))).fixture;
 assert.ok(f);const forced=a=>{const n=apply(f.state,a);const replies=successors(n);return replies.length>0&&replies.every(r=>r.n.winner===null&&successors(r.n).some(t=>t.n.winner===f.state.turn));};
 for(const variety of [0,25])for(const seed of [f.rngSeed,f.state.ply+137,1,7,19])assert.ok(forced(chooseRoute(f.state,{rng:seeded(seed),seen:new Map(f.seen),variety})));
 assert.equal(forced(f.oldAction),false);
});
