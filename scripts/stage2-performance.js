// Matched archived positions. Timings are descriptive, not new matches or human time.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import * as current from '../src/engine.js';import {choose,seeded} from '../src/ai.js';
import {stage2Source} from './stage2-source.js';import {referenceChildren,sha} from './stall-research.js';
const dir='reports/stage2-2026-10-25/',baseline=JSON.parse(readFileSync(dir+'baseline.json')),source=stage2Source();
assert.equal(source.length,976);
const states=[];for(const mode of ['A','B','C','D','E']){const gs=source.filter(g=>g.experiment.boardId===mode).sort((a,b)=>a.id.localeCompare(b.id));for(const g of gs.slice(0,4)){let s=g.initial;const at=Math.min(8,g.history.length-1);for(const h of g.history.slice(0,at))s=current.apply(s,h.a);states.push({mode,id:g.id,ply:s.ply,s});}}
const plan={states:states.map(({mode,id,ply,s})=>({mode,id,ply,sha:sha(s)})),batches:5,repeats:8,minimumLegalGain:.10,maximumModeRegression:.05,scope:'20 archived real normalized positions, all five modes; fixed search CPU RNG/beam; non-additive phase timings; no new games'};
const verify=process.argv.includes('--verify');if(verify)assert.deepEqual(JSON.parse(readFileSync(dir+'performance-plan.json')),plan);else writeFileSync(dir+'performance-plan.json',JSON.stringify(plan,null,2)+'\n');
const temp=mkdtempSync(join(tmpdir(),'zurash-stage2-'));
try{
 writeFileSync(join(temp,'package.json'),'{"type":"module"}');for(const f of ['geometry.js','research-layouts.js','route-ai.js'])writeFileSync(join(temp,f),readFileSync('src/'+f));for(const [f,s] of Object.entries(baseline))writeFileSync(join(temp,f),s);
 const old=await import(pathToFileURL(join(temp,'engine.js')).href),oldAI=await import(pathToFileURL(join(temp,'ai.js')).href);
 let transitions=0;const checks=[];for(const {mode,s,id,ply} of states){const cs=current.successors(s);assert.deepEqual(cs,old.successors(s));assert.deepEqual(cs,referenceChildren(s));assert.deepEqual(current.actions(s),old.actions(s));assert.deepEqual(current.movableWalls(s),old.movableWalls(s));assert.equal(current.key(s),old.key(s));for(const p of [0,1])assert.deepEqual(current.distances(s,p),old.distances(s,p));transitions+=cs.length;
 const decisions=[];for(const level of ['random','greedy','search','strong']){const a=seeded(92713),b=seeded(92713);const before=JSON.stringify(s);const pick=choose(s,{rng:a,level}),prior=oldAI.choose(s,{rng:b,level});assert.deepEqual(pick,prior);assert.equal(a(),b());assert.equal(JSON.stringify(s),before);decisions.push({level,action:pick});}checks.push({mode,id,ply,legal:cs.length,decisions});}
 if(verify){const r=JSON.parse(readFileSync(dir+'performance.json'));assert.equal(r.engineSHA256,sha(readFileSync('src/engine.js')));// New opt-in learning branch must leave the archived four levels byte-equivalent.
 const aiSource=readFileSync('src/ai.js','utf8').split('\n// Start exactly at normal')[0].replace(/^import \{learnWeight(?:,learningContext)?\} from '\.\/learning\.js';\n/,'').replace(', opponentModel = null','').replace(/  if \(level === "learning"\).*\n/,'');assert.equal(r.aiSHA256,sha(aiSource));assert.deepEqual(r.checks,checks);console.log('stage2 performance regression: 20 positions /',transitions,'successors / 80 CPU choices and RNG agree');process.exit(0);}
 const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)],rows=[];
 // Warm up both engines and fixed-budget CPUs before paired measurements.
 for(const {s} of states){old.successors(s);current.successors(s);oldAI.choose(s,{rng:seeded(92713)});choose(s,{rng:seeded(92713)});}
 for(const mode of ['A','B','C','D','E'])for(let batch=0;batch<plan.batches;batch++){
  const selected=states.filter(r=>r.mode===mode),times={};
  for(const name of batch%2?['current','old']:['old','current']){const e=name==='old'?old:current,ai=name==='old'?oldAI.choose:choose;
   for(const phase of ['legal','key','apply','cpu']){const start=performance.now();let sink=0;const repeats=phase==='key'?plan.repeats*100:phase==='cpu'?1:plan.repeats;
    for(let i=0;i<repeats;i++)for(const {s} of selected){if(phase==='legal')sink+=e.successors(s).length;else if(phase==='key')sink+=e.key(s).length;else if(phase==='apply'){const a=e.actions(s)[0];sink+=a?e.apply(s,a).ply:0;}else{sink+=ai(s,{rng:seeded(92713)})?.dir??0;}}
    times[name+'_'+phase]=(performance.now()-start)/(repeats*selected.length);assert.ok(sink>=0);
   }
  }rows.push({mode,batch,...times,heapUsed:process.memoryUsage().heapUsed,rss:process.memoryUsage().rss});
 }
 const byMode=Object.fromEntries(['A','B','C','D','E'].map(mode=>{const rs=rows.filter(r=>r.mode===mode);return [mode,Object.fromEntries(['legal','key','apply','cpu'].map(phase=>[phase,{oldMs:median(rs.map(r=>r['old_'+phase])),currentMs:median(rs.map(r=>r['current_'+phase])),gain:1-median(rs.map(r=>r['current_'+phase]/r['old_'+phase]))}]))];}));
 const adopt=Object.values(byMode).every(r=>r.legal.gain>=plan.minimumLegalGain&&r.cpu.gain>=-plan.maximumModeRegression);
 const result={engineSHA256:sha(readFileSync('src/engine.js')),aiSHA256:sha(readFileSync('src/ai.js')),baselineSHA256:sha(readFileSync(dir+'baseline.json')),newGames:0,states:states.length,transitions,checks,rows,byMode,adopt,memoryNote:'process RSS and used heap sampled after each pair; not retained-state or peak isolation; apply includes action selection; CPU fixed beam, timings not human time'};
 writeFileSync(dir+'performance.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({byMode,adopt}));assert.ok(adopt,'Do not adopt a performance regression');
}finally{rmSync(temp,{recursive:true,force:true});}
