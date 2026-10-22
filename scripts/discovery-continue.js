// Continue selected unfinished official-rule experiments; do not create new IDs.
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {advanceExperiment,verifyExperiment} from './board-discovery.js';
const dir=process.env.DISCOVERY_REPORT??'reports/discovery-2026-10-22',budget=Number(process.env.CONTINUE_MS??90000),start=performance.now();
if(!Number.isInteger(budget)||budget<1000||budget>600000)throw Error('Invalid continuation budget');
const read=n=>JSON.parse(gunzipSync(readFileSync(`${dir}/${n}.json.gz`))),save=(n,x)=>{const p=`${dir}/${n}.json.gz`;writeFileSync(p+'.tmp',gzipSync(JSON.stringify(x)));renameSync(p+'.tmp',p);},digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const primary=read('games'),follow=read('position-games'),library=read('catalogue'),interesting=new Set(library.filter(r=>r.metrics.stages.holdout.unresolvedRate<.75).map(r=>r.id)),data=[{name:'games',rows:primary},{name:'position-games',rows:follow}],queue=[];
const focus=process.env.CONTINUE_FOCUS??'promising';
if(!['promising','stall','all'].includes(focus))throw Error('Invalid CONTINUE_FOCUS');
const repeated=g=>Number(g.repetitionCount??0)>0;
const stalled=g=>Array.isArray(g.history)&&g.history.length>=30&&g.history.slice(-30).every(h=>h.gain===false);
for(const source of data)for(let i=0;i<source.rows.length;i++){const g=source.rows[i];if(g.state.winner===null&&['holdout','position-holdout'].includes(g.experiment.stage))queue.push({source,i,g,priority:focus==='stall'?(repeated(g)&&stalled(g)?0:repeated(g)||stalled(g)?1:2):focus==='all'?0:interesting.has(g.experiment.boardId)?0:1});}
queue.sort((a,b)=>a.priority-b.priority||a.g.state.ply-b.g.state.ply||a.g.id.localeCompare(b.g.id));const audit=[];
const cohort=g=>repeated(g)?(stalled(g)?'repeatedAndStalled':'repeatedOnly'):(stalled(g)?'stalledOnly':'neither');
for(const {source,i,g} of queue){if(performance.now()-start>budget)break;const n=advanceExperiment(g,{maxPlies:Math.min(100000,g.state.ply+2048),timeBudgetMs:500,memoryBudgetMb:512});verifyExperiment(n);audit.push({id:g.id,source:source.name,boardId:g.experiment.boardId,beforePlies:g.history.length,afterPlies:n.history.length,beforePrefixSHA256:digest(g.history),beforeRNG:g.rngStates,afterRNG:n.rngStates,beforeReason:g.reason,afterReason:n.reason,beforeCohort:cohort(g),settled:n.state.winner!==null});source.rows[i]=n;if(audit.length%16===0){for(const s of data)save(s.name,s.rows);console.log('continued',audit.length,'settled',audit.filter(r=>r.settled).length);}}
for(const s of data)save(s.name,s.rows);save('continuation-audit',audit);
const cohortResults={},boardOutcomes={};for(const a of audit){const b=boardOutcomes[a.boardId]??={continued:0,settled:0,stillUnresolved:0};b.continued++;if(a.settled)b.settled++;else b.stillUnresolved++;}
const mostPersistentBoards=Object.entries(boardOutcomes).map(([boardId,values])=>({boardId,...values,unresolvedRate:values.stillUnresolved/values.continued})).sort((a,b)=>b.stillUnresolved-a.stillUnresolved||b.unresolvedRate-a.unresolvedRate||a.boardId.localeCompare(b.boardId)).slice(0,15);
for(const a of audit){const row=cohortResults[a.beforeCohort]??={continued:0,settled:0,stillUnresolved:0};row.continued++;if(a.settled)row.settled++;else row.stillUnresolved++;}
console.log({focus,continued:audit.length,newlySettled:audit.filter(r=>r.settled).length,newGames:0,cohortResults,mostPersistentBoards,elapsedMs:performance.now()-start});
