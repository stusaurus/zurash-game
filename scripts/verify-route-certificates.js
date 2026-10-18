import fs from 'node:fs';import assert from 'node:assert/strict';
import {initial,successors,actions,apply} from '../src/engine.js';
import {captureRoutes} from '../src/route-ai.js';import {seeded} from '../src/ai.js';
let positions=0,queries=0,certificates=0;
for(let l=0;l<3;l++)for(let seed=0;seed<30;seed++){
 let s=initial(l,seed%2),rng=seeded(700001+seed*37+l);
 for(let ply=0;ply<100&&s.winner===null;ply++){
  for(let p=0;p<2;p++){
   const routes=captureRoutes(s,p),expected=new Set(successors({...s,turn:p}).filter(c=>c.n.scores[p]>s.scores[p]).map(c=>c.n.players[p]));
   assert.deepEqual([...routes.keys()].sort((a,b)=>a-b),[...expected].sort((a,b)=>a-b));
   for(const [star,a] of routes){assert.equal(apply({...s,turn:p},a).players[p],star);certificates++;}
   queries++;
  }
  positions++;const aa=actions(s);s=apply(s,aa[Math.floor(rng()*aa.length)]);
 }
}
fs.writeFileSync('reports/route-certificates.json',JSON.stringify({positions,queries,certificates,exactlyMatchedExhaustiveSuccessors:true,seedBase:700001,notes:'Reachable random-play positions across three layouts, both player perspectives. Not a proof over the entire state space.'},null,2)+'\n');console.log({positions,queries,certificates});
