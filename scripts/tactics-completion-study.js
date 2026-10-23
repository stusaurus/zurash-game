// Paired, resumable finish-first study. Expensive study is opt-in, never normal PR CI.
import fs from 'node:fs';import zlib from 'node:zlib';import {fork} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {newGame,advanceGame,verifyGame,POLICY_SPEC} from './tactics-completion.js';
import {completionSummary} from './tactics-completion-statistics.js';
import {CANDIDATES,makeCandidate,geometryVariants} from './tactics-candidates.js';
if(process.argv.includes('--worker')){
 process.on('message',task=>{
  if(task==='stop')process.exit(0);
  const cp=task.game,checkpoint=g=>{fs.writeFileSync(task.checkpoint+'.tmp',JSON.stringify(g));fs.renameSync(task.checkpoint+'.tmp',task.checkpoint);};checkpoint(cp);
  let g=advanceGame(cp,task.resumeLimits?{...task.resumeLimits,memoryBudgetMb:320,onCheckpoint:checkpoint}:{maxPlies:512,timeBudgetMs:800,memoryBudgetMb:320,onCheckpoint:checkpoint});
  if(!task.resumeLimits&&g.reason.startsWith('budget-'))g=advanceGame(g,{maxPlies:4096,timeBudgetMs:1800,memoryBudgetMb:320,onCheckpoint:checkpoint});
  verifyGame(g);checkpoint(g);process.send({game:g,meta:task.meta});global.gc?.();
 });
}else{
 const seeds=Number(process.env.COMPLETION_SEEDS??6),fixedReplicas=Number(process.env.COMPLETION_FIXED??2),workers=Number(process.env.COMPLETION_WORKERS??4),totalMs=Number(process.env.COMPLETION_TOTAL_MS??720000);
 if(!Number.isInteger(seeds)||seeds<1||seeds>100||!Number.isInteger(fixedReplicas)||fixedReplicas<1||fixedReplicas>100||!Number.isInteger(workers)||workers<1||workers>4||!Number.isInteger(totalMs)||totalMs<1000||totalMs>1800000)throw Error('Invalid study limits');
 const output=process.env.COMPLETION_OUTPUT??'reports/tactics-completion',tasks=[],started=Date.now(),rows=[];
 const matchups=['star/star','positional/positional','defensive/defensive','search/search','mixed/mixed','search-progress/search-progress','star/search','positional/search','defensive/search','search/search-progress'];
 function base(c,seed){for(let retry=0;retry<100;retry++){try{return {state:makeCandidate(c,seed+retry),layoutSeed:seed+retry};}catch(e){if(e.message!=='No legal opening')throw e;}}throw Error('No opening');}
 function add(c,scenario,pair,seed,matchupsToRun=matchups){
  const b=base(c,scenario==='fixed'?20261020+c.size:700000+pair*101+c.size),cluster=`${scenario}:${pair}`;
  for(const [orientation,s] of geometryVariants(b.state).entries())for(const matchup of matchupsToRun){
   const ps=matchup.split('/'),assignments=ps[0]===ps[1]?[ps]:[ps,[...ps].reverse()];
   for(const policies of assignments)for(const starter of [0,1]){
    const id=`${c.size}:${cluster}:${orientation}:${policies.join('/')}:${starter}`;
    const meta={size:c.size,scenario,cluster,pair,orientation,matchup,layoutSeed:b.layoutSeed};
    tasks.push({meta,game:newGame(s,{id,starter,policies,seed})});
   }
  }
 }
 for(let pair=0;pair<Math.max(seeds,fixedReplicas);pair++)for(const c of CANDIDATES){
  if(pair<seeds)add(c,'varied',pair,900000+pair*31+c.size);
  if(pair<fixedReplicas)add(c,'fixed',pair,910000+pair*31+c.size);
 }
 // Additional RNG replications on the SAME fixed board for search self-play.
 for(let pair=fixedReplicas;pair<fixedReplicas+20;pair++)for(const c of CANDIDATES)add(c,'fixed',pair,910000+pair*31+c.size,['search/search']);
 if(tasks.length>20000)throw Error('Too many planned games');
 fs.mkdirSync('reports',{recursive:true});fs.mkdirSync('/tmp/zurash-completion-checkpoints',{recursive:true});
 fs.writeFileSync(output+'-games.jsonl.gz',Buffer.alloc(0));
 fs.writeFileSync(output+'-plan.json',JSON.stringify({version:1,baseCommit:'dbfc5c05e0456f6dd96fd0ec215bc8efc6ea9e95',seeds,fixedReplicas,workers,totalMs,plannedGames:tasks.length,policySpec:POLICY_SPEC,memoryLimits:{workerNodeHeapMb:384,workerSampledHeapMb:320,coordinatorNodeHeapMb:512},perTurnBudget:'depth <=2; beam 8 for search/mixed; game budgets checked between turns',initialLimits:{maxPlies:512,timeMs:800},continuationLimits:{maxPlies:4096,timeMs:1800},tasks:tasks.map(t=>({id:t.game.id,...t.meta,starter:t.game.starter,policies:t.game.policies,seed:t.game.seed}))},null,2)+'\n');
 function lean(g,m){return {...m,id:g.id,starter:g.starter,policies:g.policies,seed:g.seed,reason:g.reason,state:{size:g.state.size,target:g.state.target,scores:g.state.scores,winner:g.state.winner,ply:g.state.ply},elapsedMs:g.elapsedMs,stages:g.stages,repetitionCount:g.repetitionCount,metrics:g.metrics};}
 function record(g,m){const fd=fs.openSync(output+'-games.jsonl.gz','a');try{fs.writeFileSync(fd,zlib.gzipSync(JSON.stringify({...g,...m})+'\n'));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}rows.push(lean(g,m));}
 function summary(){
  const groups=[];
  for(const scenario of ['varied','fixed'])for(const size of [8,9,10])for(const matchup of matchups){const gs=rows.filter(g=>g.scenario===scenario&&g.size===size&&g.matchup===matchup);if(gs.length)groups.push({scenario,size,matchup,...completionSummary(gs)});}
  const candidates=CANDIDATES.map(c=>({size:c.size,...completionSummary(rows.filter(r=>r.size===c.size))}));
  fs.writeFileSync(output+'-rows.jsonl.gz',zlib.gzipSync(rows.map(r=>JSON.stringify(r)).join('\n')+'\n'));
  fs.writeFileSync(output+'-summary.json',JSON.stringify({version:1,plannedGames:tasks.length,recordedGames:rows.length,elapsedMs:Date.now()-started,completed:rows.length===tasks.length,candidates,groups,rowsArchive:path.basename(output)+'-rows.jsonl.gz'},null,2)+'\n');
 }
 let cursor=0,finished=0;const children=[];
 function next(child){
  if(Date.now()-started>=totalMs){
   while(cursor<tasks.length){const t=tasks[cursor++];t.game.reason='budget-study';record(t.game,t.meta);}
  }
  if(cursor>=tasks.length){child.send('stop');if(++finished===workers){summary();console.log(JSON.stringify({recorded:rows.length,planned:tasks.length,elapsedMs:Date.now()-started}));}return;}
  const task=tasks[cursor++];child.activeTask=task;child.send({...task,checkpoint:`/tmp/zurash-completion-checkpoints/worker-${child.pid}.json`});
 }
 for(let i=0;i<workers;i++){
  const child=fork(fileURLToPath(import.meta.url),['--worker'],{execArgv:['--expose-gc','--max-old-space-size=384'],stdio:['ignore','inherit','inherit','ipc']});children.push(child);
  child.on('message',({game,meta})=>{child.activeTask=null;record(game,meta);if(rows.length%50===0){summary();console.log(`checkpoint ${rows.length}/${tasks.length}`);}next(child);});
  child.on('error',e=>{console.error(e);for(const c of children)c.kill('SIGTERM');process.exitCode=1;});next(child);
 }
 // Graceful interruption: active games remain in per-worker checkpoint files.
 let stopping=false;
 function stopStudy(){
  if(stopping)return;stopping=true;
  for(const c of children){
   const t=c.activeTask;
   if(t){let g=t.game;try{const saved=JSON.parse(fs.readFileSync(`/tmp/zurash-completion-checkpoints/worker-${c.pid}.json`));if(saved.id===g.id)g=saved;}catch{}g.reason=g.state.winner===null?'budget-study':'win';record(g,t.meta);c.activeTask=null;}
   c.kill('SIGTERM');
  }
  while(cursor<tasks.length){const t=tasks[cursor++];t.game.reason='budget-study';record(t.game,t.meta);}
  summary();process.exit(143);
 }
 for(const c of children)c.on('exit',(code)=>{if(code&& !stopping)stopStudy();});
 process.on('SIGTERM',stopStudy);
}
