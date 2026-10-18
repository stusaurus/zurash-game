import fs from 'node:fs';
import assert from 'node:assert/strict';
import {initial,apply,key} from '../src/engine.js';
import {choose,seeded} from '../src/ai.js';
import {choose as baseline} from './reference/ai-v1.js';
const games=[];let comparisons=0;
for(let layout=0;layout<3;layout++)for(let pair=0;pair<4;pair++)for(let starter=0;starter<2;starter++){
 const seed=173+pair*307+layout*791,rngA=seeded(seed),rngB=seeded(seed),seen=new Map();
 let s=initial(layout,starter);
 while(s.winner===null&&s.ply<120){
  seen.set(key(s),(seen.get(key(s))||0)+1);
  const a=baseline(s,{level:'strong',rng:rngA,seen}),b=choose(s,{level:'strong',rng:rngB,seen});
  assert.deepEqual(a,b,JSON.stringify({layout,pair,starter,ply:s.ply}));
  s=apply(s,a);comparisons++;
 }
 games.push({layout,pair,starter,winner:s.winner,plies:s.ply,scores:s.scores,capped:s.winner===null});
}
const result={baseline:'57f9272 strong CPU',candidate:'successors-based strong CPU',conditions:'3 layouts x 4 paired seeds x 2 starters; 120-ply measurement cap; complete action-by-action old/new comparison with independent identical RNG streams and identical history.',games:games.length,actionComparisons:comparisons,allIdentical:true,results:games};
fs.writeFileSync('reports/policy-equivalence.json',JSON.stringify(result,null,2)+'\n');console.log(result);
