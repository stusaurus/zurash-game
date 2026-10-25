// Exhaustive, bounded tactical contract audit. Never imported by the application.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {referenceChildren} from './stall-research.js';
import {forcedThreeAction} from './trajectory-followup.js';
import {inventory} from './guard-ai.js';
import {captureRoutes} from '../src/route-ai.js';
import {successors} from '../src/engine.js';

const actionKey=a=>JSON.stringify(a);
const physicalKey=s=>JSON.stringify([s.size,s.width,s.height,s.playableCells,s.players,s.walls,s.stars,s.scores,s.target,s.turn,s.winner]);
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const CONTRACT_SPEC={version:1,baseCommit:'02d33cf0e8161f90bc68cb7d998d1951451378be',seed:711,
 domains:[
  {name:'rectangle-six',width:3,height:2,cells:[0,1,2,3,4,5],wallCounts:[1,2],starCounts:[1,2],target:2,scorePairs:[[0,0],[1,0],[0,1],[1,1]]},
  {name:'square-nine',width:3,height:3,cells:[0,1,2,3,4,5,6,7,8],wallCounts:[1],starCounts:[1],target:1,scorePairs:[[0,0]]},
  {name:'masked-ring',width:3,height:3,cells:[0,1,2,3,5,6,7,8],wallCounts:[1],starCounts:[1],target:1,scorePairs:[[0,0]]}
 ],horizon:3,symmetryEvery:127,
 limits:['Exhaustive only within the listed static small-board domains, not all positions of A–E',
 'Static legal arrangements are not claimed reachable from any official opening',
 'No forced win within three plies is not proof of permanent safety, a draw, or fairness',
 'No games or continuations are generated; these are tactical state queries',
 'The independent oracle imports referenceChildren, never captureRoutes or the research selector']};

function* combinations(xs,n,from=0,prefix=[]){
 if(!n){yield prefix;return;}
 for(let i=from;i<=xs.length-n;i++)yield*combinations(xs,n-1,i+1,[...prefix,xs[i]]);
}
export function* domainStates(d){
 const mobile=(at,other,walls)=>[[0,-1],[1,0],[0,1],[-1,0]].some(([dx,dy])=>{
  const x=at%d.width+dx,y=Math.floor(at/d.width)+dy,n=y*d.width+x;
  return x>=0&&x<d.width&&y>=0&&y<d.height&&d.cells.includes(n)&&n!==other&&!walls.includes(n);
 });
 for(const p0 of d.cells)for(const p1 of d.cells){if(p0===p1)continue;
  const free=d.cells.filter(c=>c!==p0&&c!==p1);
  for(const wc of d.wallCounts)for(const walls of combinations(free,wc)){
   if(!mobile(p0,p1,walls)||!mobile(p1,p0,walls))continue;
   for(const sc of d.starCounts)for(const stars of combinations(free.filter(c=>!walls.includes(c)),sc))
    for(const scores of d.scorePairs)for(const turn of [0,1])yield {width:d.width,height:d.height,playableCells:d.cells,players:[p0,p1],walls,stars,scores,target:d.target,turn,ply:0,winner:null};
  }
 }
}
// Existential own turns; universal opponent turns. A dead end is not a win.
export function makeOracle(children=referenceChildren){
 const cache=new Map();let queries=0;
 const wins=(s,p,left)=>{
  queries++;
  if(s.winner!==null)return s.winner===p;
  if(!left)return false;
  const k=physicalKey(s)+':'+p+':'+left;if(cache.has(k))return cache.get(k);
  const cs=children(s),r=cs.length>0&&(s.turn===p?cs.some(c=>wins(c.n,p,left-1)):cs.every(c=>wins(c.n,p,left-1)));
  cache.set(k,r);return r;
 };
 return {wins,stats:()=>({recursiveQueries:queries,cachedPositions:cache.size})};
}

export function transformState(s,kind){
 const width=s.width,height=s.height;
 const point=i=>{const x=i%width,y=Math.floor(i/width);return kind==='reflect-x'?y*width+width-1-x:kind==='rotate-180'?(height-1-y)*width+width-1-x:i;};
 return {...s,playableCells:s.playableCells.map(point).sort((a,b)=>a-b),players:(kind==='swap-actors'?[...s.players].reverse():s.players).map(point),walls:s.walls.map(point),stars:s.stars.map(point).sort((a,b)=>a-b),scores:kind==='swap-actors'?[...s.scores].reverse():[...s.scores],turn:kind==='swap-actors'?1-s.turn:s.turn,winner:s.winner===null?null:kind==='swap-actors'?1-s.winner:s.winner};
}
export function auditPosition(s,oracle=makeOracle(),{routeFinder=captureRoutes,forceFinder=forcedThreeAction,keeper=inventory}={}){
 const before=JSON.stringify(s),cs=referenceChildren(s),p=s.turn;
 assert.deepEqual(successors(s),cs,'legal transition mismatch');
 let captures=0;
 for(const actor of [0,1]){
  const options=referenceChildren({...s,turn:actor}),expected=[...new Set(options.filter(c=>c.n.scores[actor]>s.scores[actor]).map(c=>c.n.players[actor]))].sort((a,b)=>a-b),actual=routeFinder(s,actor);
  assert.deepEqual([...actual.keys()].sort((a,b)=>a-b),expected,'capture-route set mismatch');
  for(const [star,a] of actual){const c=options.find(c=>actionKey(c.a)===actionKey(a));assert.ok(c&&c.n.players[actor]===star&&c.n.scores[actor]===s.scores[actor]+1,'invalid capture certificate');captures++;}
 }
 const wins=cs.filter(c=>oracle.wins(c.n,p,2)),force=forceFinder(s);
 assert.equal(Boolean(force),wins.length>0,'three-ply verdict mismatch');
 if(force)assert.ok(wins.some(c=>actionKey(c.a)===actionKey(force.action)),'invalid three-ply certificate');
 const safe=cs.filter(c=>c.n.winner===p||!referenceChildren(c.n).some(r=>r.n.winner===1-p)),safeKeys=new Set(safe.map(c=>actionKey(c.a)));
 const inv=keeper(s,'retain',CONTRACT_SPEC.seed);
 assert.equal(inv.rows.length,cs.length);
 assert.deepEqual(inv.rows.filter(c=>c.safe).map(c=>actionKey(c.a)).sort(),[...safeKeys].sort(),'safe-root classification mismatch');
 if(safe.length){assert.ok(inv.retained.length);assert.ok(inv.retained.every(c=>safeKeys.has(actionKey(c.a))),'unsafe root survived despite safe alternative');}
 if(force)assert.ok(inv.forced||inv.retained.some(c=>wins.some(w=>actionKey(w.a)===actionKey(c.a))),'all forced wins dropped');
 assert.equal(JSON.stringify(s),before,'audit mutated input');
 const shortestWin=cs.some(c=>c.n.winner===p)?1:wins.length?3:null;
 return {legal:cs.length,safe:safe.length,captures,forced:shortestWin,certificatePlies:force?.plies??null,canForce:wins.length>0,hasSafetyChoice:safe.length>0&&safe.length<cs.length,retained:inv.retained.length};
}
export function runAudit(spec=CONTRACT_SPEC){
 assert.deepEqual(spec,CONTRACT_SPEC,'frozen specification changed');
 const rows=[],start=performance.now();let total=0;
 for(const d of spec.domains){const oracle=makeOracle(),hash=createHash('sha256'),counts={name:d.name,positions:0,transitions:0,captureCertificates:0,immediateWins:0,threePlyWins:0,noForcedWinWithinThree:0,safetyChoices:0,noLegalActions:0,symmetryChecks:0};
  for(const s of domainStates(d)){
   const r=auditPosition(s,oracle);counts.positions++;total++;counts.transitions+=r.legal;counts.captureCertificates+=r.captures;counts.immediateWins+=Number(r.forced===1);counts.threePlyWins+=Number(r.forced===3);counts.noForcedWinWithinThree+=Number(!r.canForce);counts.safetyChoices+=Number(r.hasSafetyChoice);counts.noLegalActions+=Number(!r.legal);
   hash.update(JSON.stringify([s,r])+'\n');
   if(counts.positions%spec.symmetryEvery===0)for(const kind of ['reflect-x','rotate-180','swap-actors']){
    const n=auditPosition(transformState(s,kind),oracle);
    for(const k of ['legal','safe','captures','canForce','hasSafetyChoice'])assert.equal(n[k],r[k],`${kind}: ${k}`);
    counts.symmetryChecks++;
   }
  }
  rows.push({...counts,resultSHA256:hash.digest('hex'),oracle:oracle.stats()});console.log(JSON.stringify(counts));
 }
 return {version:1,specSHA256:digest(spec),domains:rows,positions:total,mismatches:0,newInitialGames:0,productionChanges:0,elapsedMs:performance.now()-start,environment:{node:process.version,platform:process.platform,arch:process.arch},limits:spec.limits};
}
export function auditArchived(){
 const plan=JSON.parse(readFileSync('reports/guard-contract-2026-10-24-archived-plan.json','utf8'));
 const raw=readFileSync(plan.source),hash=createHash('sha256').update(raw).digest('hex');assert.equal(hash,plan.sourceSHA256);
 const cases=JSON.parse(gunzipSync(raw));assert.equal(cases.length,plan.expectedCases);
 const rows=[];
 for(const c of cases){const oracle=makeOracle(),r=auditPosition(c.checkpoint.state,oracle);rows.push({caseID:c.caseID,sourceID:c.sourceID,stateSHA256:digest(c.checkpoint.state),...r,oracle:oracle.stats()});}
 return {planSHA256:digest(plan),sourceSHA256:hash,cases:rows,mismatches:0,newInitialGames:0,limits:plan.limits};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.includes('--archived')){
  const r=auditArchived(),p='reports/guard-contract-2026-10-24-archived.json';
  if(process.argv.includes('--verify'))assert.deepEqual(r,JSON.parse(readFileSync(p,'utf8')));else writeFileSync(p,JSON.stringify(r,null,2)+'\n');
  console.log('Archived B checkpoints verified: '+r.cases.length);
 }else{
 const specPath='reports/guard-contract-2026-10-24-plan.json',resultPath='reports/guard-contract-2026-10-24.json';
 assert.deepEqual(JSON.parse(readFileSync(specPath,'utf8')),CONTRACT_SPEC);
 const r=runAudit();
 if(process.argv.includes('--verify')){const old=JSON.parse(readFileSync(resultPath,'utf8'));for(const k of ['version','specSHA256','domains','positions','mismatches','newInitialGames','productionChanges','limits'])assert.deepEqual(r[k],old[k],`saved result mismatch: ${k}`);console.log('Saved exhaustive results reproduced');}
 else writeFileSync(resultPath,JSON.stringify(r,null,2)+'\n');
 }
}
