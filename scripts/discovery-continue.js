// Continue selected unfinished official-rule experiments; do not create new IDs.
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {advanceExperiment,verifyExperiment} from './board-discovery.js';
const dir=process.env.DISCOVERY_REPORT??'reports/discovery-2026-10-22',budget=Number(process.env.CONTINUE_MS??90000),start=performance.now();
if(!Number.isInteger(budget)||budget<1000||budget>600000)throw Error('Invalid continuation budget');
const read=n=>JSON.parse(gunzipSync(readFileSync(`${dir}/${n}.json.gz`))),save=(n,x)=>{const p=`${dir}/${n}.json.gz`;writeFileSync(p+'.tmp',gzipSync(JSON.stringify(x)));renameSync(p+'.tmp',p);},digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const primary=read('games'),follow=read('position-games'),library=read('catalogue'),interesting=new Set(library.filter(r=>r.metrics.stages.holdout.unresolvedRate<.75).map(r=>r.id)),data=[{name:'games',rows:primary},{name:'position-games',rows:follow}],queue=[];
for(const source of data)for(let i=0;i<source.rows.length;i++){const g=source.rows[i];if(g.state.winner===null&&['holdout','position-holdout'].includes(g.experiment.stage))queue.push({source,i,g,priority:interesting.has(g.experiment.boardId)?0:1});}
queue.sort((a,b)=>a.priority-b.priority||a.g.state.ply-b.g.state.ply||a.g.id.localeCompare(b.g.id));const audit=[];
for(const {source,i,g} of queue){if(performance.now()-start>budget)break;const n=advanceExperiment(g,{maxPlies:Math.min(100000,g.state.ply+2048),timeBudgetMs:500,memoryBudgetMb:512});verifyExperiment(n);audit.push({id:g.id,source:source.name,boardId:g.experiment.boardId,beforePlies:g.history.length,afterPlies:n.history.length,beforePrefixSHA256:digest(g.history),beforeRNG:g.rngStates,afterRNG:n.rngStates,beforeReason:g.reason,afterReason:n.reason,settled:n.state.winner!==null});source.rows[i]=n;if(audit.length%16===0){for(const s of data)save(s.name,s.rows);console.log('continued',audit.length,'settled',audit.filter(r=>r.settled).length);}}
for(const s of data)save(s.name,s.rows);save('continuation-audit',audit);console.log({continued:audit.length,newlySettled:audit.filter(r=>r.settled).length,newGames:0,elapsedMs:performance.now()-start});
