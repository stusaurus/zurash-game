import fs from 'node:fs';
import {initial,apply,key} from '../src/engine.js';
import {choose,seeded} from '../src/ai.js';
import {choose as baseline} from './reference/ai-v1.js';
const corpus=[];
for(let l=0;l<3;l++){
 let s=initial(l),rng=seeded(73+l),seen=new Map();
 for(let ply=0;ply<20&&s.winner===null;ply++){
  seen.set(key(s),(seen.get(key(s))||0)+1);corpus.push({s,seen:new Map(seen)});
  s=apply(s,choose(s,{level:'greedy',rng,seen}));
 }
}
const results=[];
for(const level of ['search','strong']){
 const samples={baseline:[],optimized:[]};let identical=0;
 // Alternate order per position to reduce warmup/order bias.
 for(let i=0;i<corpus.length;i++)for(let rep=0;rep<3;rep++){
  const choices={};
  for(const name of ((i+rep)%2?['baseline','optimized']:['optimized','baseline'])){
   const t=performance.now(); choices[name]=(name==='baseline'?baseline:choose)(corpus[i].s,{level,rng:seeded(i+33),seen:corpus[i].seen});samples[name].push(performance.now()-t);
  }
  if(JSON.stringify(choices.baseline)===JSON.stringify(choices.optimized))identical++;
 }
 const stats=a=>{a.sort((a,b)=>a-b);return {n:a.length,medianMs:a[Math.floor(a.length*.5)],p90Ms:a[Math.floor(a.length*.9)],maxMs:Math.max(...a)}};
 results.push({level,identical,total:corpus.length*3,baseline:stats(samples.baseline),optimized:stats(samples.optimized)});
}
fs.writeFileSync('reports/search-benchmark.json',JSON.stringify({environment:process.version,corpus:corpus.length,results},null,2)+'\n');console.log(results);
