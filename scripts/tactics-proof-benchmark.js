// Baseline source is pinned to the pre-audit commit; workers isolate time/heap.
import fs from 'node:fs';
import {spawnSync,execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {CANDIDATES,makeCandidate} from './tactics-candidates.js';
const baseline=execFileSync('git',['show','aff687dcd9328626e7768831afcf60c685ff1c3f:scripts/tactics-proof.js'],{encoding:'utf8'}).replace('../src/engine.js',pathToFileURL(process.cwd()+'/src/engine.js').href);
const baselineUrl='data:text/javascript;base64,'+Buffer.from(baseline).toString('base64');
const rows=[];
for(const c of CANDIDATES){
 const s=makeCandidate(c,20261020+c.size);
 for(const variant of ['baseline','alpha-beta-only','optimized']){
  const url=variant==='baseline'?baselineUrl:pathToFileURL(process.cwd()+'/scripts/tactics-proof.js').href;
  const code=`import {prove} from ${JSON.stringify(url)};const s=${JSON.stringify(s)};const start=performance.now();const r=prove(s,{horizon:4,nodeBudget:200000,timeBudgetMs:10000,horizonPruning:${variant==='optimized'},alphaBeta:true});console.log(JSON.stringify({...r,elapsedMs:performance.now()-start,heapBytes:process.memoryUsage().heapUsed}));`;
  const run=spawnSync(process.execPath,['--max-old-space-size=768','--input-type=module','-e',code],{encoding:'utf8',timeout:12000});
  rows.push({size:c.size,variant,horizon:4,...(run.status===0?JSON.parse(run.stdout):{result:null,proven:false,stopReason:run.error?.code??'worker-failure'})});
 }
}
fs.writeFileSync('reports/tactics-proof-benchmark.json',JSON.stringify({baselineCommit:'aff687dcd9328626e7768831afcf60c685ff1c3f',note:'Isolated single runs, not stable throughput estimates. Timeout is not a game outcome.',rows},null,2)+'\n');
console.log(JSON.stringify(rows,null,2));
