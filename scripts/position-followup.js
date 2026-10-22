// Second, explicitly adaptive research round. Fresh holdout seeds prevent reuse
// of the first round's inspected independent outcomes.
import {readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {discoveryID,positionSearch,factorialPlans,createExperiment,advanceExperiment,aggregate,compareMatched,uniqueGames,verifyExperiment} from './board-discovery.js';
const dir=process.env.DISCOVERY_REPORT??'reports/discovery-2026-10-22',start=performance.now(),budget=Number(process.env.POSITION_MS??360000),resume=process.env.DISCOVERY_RESUME!=='0';
if(!Number.isInteger(budget)||budget<1000||budget>1200000)throw Error('Invalid followup budget');
const p=n=>`${dir}/${n}.json.gz`,read=n=>JSON.parse(gunzipSync(readFileSync(p(n)))),save=(n,x)=>{writeFileSync(p(n)+'.tmp',gzipSync(JSON.stringify(x)));renameSync(p(n)+'.tmp',p(n));};
const parents=read('records').filter(r=>r.discoveryParent);let roster,audit;
if(existsSync(p('position-roster'))){roster=read('position-roster');audit=read('position-audit');}
else{
 roster=[...parents];audit=[];
 for(let i=0;i<parents.length;i++){
  const parent=parents[i],search=positionSearch(parent,{seed:8400001+i,attempts:20});
  const chosen=search.accepted.slice(0,8);for(const c of chosen){const board={...parent.board,players:c.players};const id=discoveryID(board);if(roster.some(r=>r.id===id))continue;roster.push({...search.best,id,parent:parent.id,name:'位置AI探索・'+parent.name,board,mutation:'positions',positionProxy:c.proxy});}
  audit.push({...search,best:undefined,screenedConfigurations:chosen.length,reason:chosen.length?'static shortlist followed by AI comparison':'no distinct legal physical placement'});
 }
 save('position-roster',roster);save('position-audit',audit);
}
const ledger=new Map((existsSync(p('position-games'))?read('position-games'):[]).map(g=>[g.id,g]));let continued=0;
function run(plans,ms){
 plans.sort((a,b)=>a.starter-b.starter||Number(a.positionSwap)-Number(b.positionSwap)||Number(a.aiSwap)-Number(b.aiSwap));
 for(const plan of plans){if(!resume||performance.now()-start>budget)break;let g=ledger.get(plan.id);if(g&&g.state.winner!==null)continue;if(g)continued++;else g=createExperiment(plan);const n=advanceExperiment(g,{maxPlies:Math.min(100000,g.state.ply+1536),timeBudgetMs:ms,memoryBudgetMb:512});verifyExperiment(n);ledger.set(n.id,n);if(ledger.size%64===0){save('position-games',[...ledger.values()]);console.log('position games',ledger.size,'seconds',Math.round((performance.now()-start)/1000));}}
 save('position-games',[...ledger.values()]);
}
const rows=(id,stage)=>[...ledger.values()].filter(g=>g.experiment.boardId===id&&g.experiment.stage===stage);
run(roster.flatMap(r=>factorialPlans(r,{stage:'position-train',seeds:[6300013],pairs:[['mixed','search']]})),100);
let frozen;
if(existsSync(p('position-frozen')))frozen=read('position-frozen');else{
 frozen=parents.map(parent=>{
  const children=roster.filter(r=>r.parent===parent.id).map(r=>({id:r.id,m:aggregate(rows(r.id,'position-train'))})).filter(x=>x.m.games===8);
  children.sort((a,b)=>Math.max(a.m.firstBias,a.m.positionBias)-Math.max(b.m.firstBias,b.m.positionBias)||a.m.unresolvedRate-b.m.unresolvedRate||b.m.openingDiversity-a.m.openingDiversity);
  return {parent:parent.id,child:children[0]?.id??null,trainingOnly:true,selection:'joint turn/position minimax, unresolved rate, opening diversity; exploratory training proxy'};
 });if(frozen.every(f=>f.child||!roster.some(r=>r.parent===f.parent)))save('position-frozen',frozen);
}
const ids=new Set(frozen.flatMap(f=>[f.parent,f.child].filter(Boolean))),selected=roster.filter(r=>ids.has(r.id)),seeds=[9800003,9800033,9800059,9800083];
const plans=selected.flatMap(r=>seeds.flatMap((seed,i)=>factorialPlans(r,{stage:'position-holdout',seeds:[seed],pairs:[i%2?['defensive','mixed']:['route','positional']]})));
run(plans,250);
const comparisons=frozen.map(f=>({parent:f.parent,child:f.child,holdout:f.child?compareMatched(rows(f.parent,'position-holdout'),rows(f.child,'position-holdout')):null,reason:f.child?'fresh seeds and changed AI matchups':'no legal distinct position candidate'}));
const games=uniqueGames([...ledger.values()]);games.forEach(verifyExperiment);save('position-comparisons',comparisons);
writeFileSync(`${dir}/position-summary.json`,JSON.stringify({uniqueGames:games.length,trainingBoards:roster.length,holdoutBoards:selected.length,plannedHoldoutGames:plans.length,holdoutSeeds:seeds,trainingSeed:6300013,continued,elapsedMs:performance.now()-start,summary:aggregate(games),supported:comparisons.filter(c=>c.holdout?.improvementSupported).map(c=>c.child),comparisons,limitations:['Second adaptive round, entirely new holdout seeds','All placements are distinct unordered physical cell pairs','Unadjusted exploratory confidence intervals; no official certification','No first-round holdout is used to select second-round children']},null,2)+'\n');
console.log({games:games.length,selected:selected.length,supported:comparisons.filter(c=>c.holdout?.improvementSupported).map(c=>c.child)});
