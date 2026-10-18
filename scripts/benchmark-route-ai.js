import fs from 'node:fs';import {gunzipSync} from 'node:zlib';
import {initial,apply,key} from '../src/engine.js';import {choose,seeded} from '../src/ai.js';import {choose as oldChoose} from './reference/ai-pre-route.js';
const corpus=[];
for(let l=0;l<3;l++){
 const games=gunzipSync(fs.readFileSync(`reports/route-holdout-${l}.jsonl.gz`)).toString().trim().split('\n').map(JSON.parse).filter(g=>g.policies.join('/')==='route/route');
 for(const g of games.slice(0,4)){let s=initial(l,g.starter),seen=new Map();for(const a of g.actions){seen.set(key(s),(seen.get(key(s))||0)+1);if(s.ply%6===0)corpus.push({s,seen:new Map(seen)});s=apply(s,a);}}
}
const samples={baseline:[],route:[]};
for(let i=0;i<corpus.length;i++)for(let rep=0;rep<2;rep++)for(const name of ((i+rep)%2?['route','baseline']:['baseline','route'])){
 const t=performance.now();(name==='route'?choose:oldChoose)(corpus[i].s,{level:'strong',rng:seeded(i+33),seen:corpus[i].seen});samples[name].push(performance.now()-t);
}
const stats=a=>{a.sort((a,b)=>a-b);return {n:a.length,median:a[Math.floor(a.length*.5)],p90:a[Math.floor(a.length*.9)],max:Math.max(...a),over6000:a.filter(x=>x>=6000).length}};
const r={runtime:process.version,corpus:corpus.length,method:'First four route-selfplay games per layout, every sixth position, two repetitions, alternating algorithm order. Desktop Node timing, not real-iPhone measurements.',baselineMs:stats(samples.baseline),routeMs:stats(samples.route)};
fs.writeFileSync('reports/route-runtime.json',JSON.stringify(r,null,2)+'\n');console.log(r);
