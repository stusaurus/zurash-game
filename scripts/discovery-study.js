import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {basicFeatures,positionSearch,mutateDiscovery,MUTATIONS,factorialPlans,createExperiment,advanceExperiment,aggregate,compareMatched,paretoFront,classify,uniqueGames,verifyExperiment,HOLDOUT_SEEDS,VERSION} from './board-discovery.js';
import {definitionKey,validateBoard} from '../src/board-lab.js';
import {EVALUATED_MASK_LIBRARY} from '../src/evaluated-mask-library.js';
const dir=process.env.DISCOVERY_REPORT??'reports/discovery-2026-10-22',start=performance.now(),budget=Number(process.env.DISCOVERY_MS??480000),resume=process.env.DISCOVERY_RESUME!=='0';
if(!Number.isInteger(budget)||budget<1000||budget>1800000)throw Error('Invalid discovery budget');mkdirSync(dir,{recursive:true});
const path=name=>`${dir}/${name}.json.gz`,read=name=>JSON.parse(gunzipSync(readFileSync(path(name)))),save=(name,data)=>{writeFileSync(path(name)+'.tmp',gzipSync(JSON.stringify(data)));renameSync(path(name)+'.tmp',path(name));},hashFile=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
let basics,searches,records,mutationAudit;
if(existsSync(path('basics'))){basics=read('basics');searches=read('positions');records=read('records');mutationAudit=read('mutations');}
else{
 const corpus=JSON.parse(gunzipSync(readFileSync('reports/mask-lab-2026-10-22/corpus.json.gz'))).accepted;
 if(corpus.length!==1135)throw Error('Expected audited corpus of 1,135');
 basics=[];searches=[];mutationAudit=[];const byKey=new Map(corpus.map(r=>[definitionKey(r.board),r.id])),byId=new Map(corpus.map(r=>[r.id,r]));
 for(let i=0;i<corpus.length;i++){
  const r=corpus[i];basics.push(basicFeatures(r));const search=positionSearch(r,{seed:7100001+i,attempts:10,distinctPhysical:false});
  if(search.best){const k=definitionKey(search.best.board);if(byKey.has(k))search.duplicateOf=byKey.get(k);else{byKey.set(k,search.best.id);byId.set(search.best.id,search.best);}}
  searches.push(search);if((i+1)%200===0)console.log('basic+positions',i+1);
 }
 // Preserve every shape; add three underrepresented size/star/target combinations.
 const parentIds=new Set(EVALUATED_MASK_LIBRARY.map(r=>r.id));
 const diversity=new Set([...parentIds].map(id=>{const r=byId.get(id);return `${r.shape}/${r.board.stars.length}/${r.board.target}/${r.board.playableCells.length<35?'small':'large'}`;}));
 for(const f of [...basics].sort((a,b)=>a.positions.proxyBias-b.positions.proxyBias)){
  if(parentIds.size>=14)break;const signature=`${f.shape}/${f.stars}/${f.target}/${f.topology.cells<35?'small':'large'}`;
  if(!diversity.has(signature)){parentIds.add(f.id);diversity.add(signature);}
 }
 for(const id of parentIds){const parent=byId.get(id);parent.discoveryParent=true;
  const search=searches.find(r=>r.parent===id);if(search?.best){const childId=search.duplicateOf??search.best.id;if(byId.has(childId))byId.get(childId).trainCandidate=true;}
  for(const [index,kind] of MUTATIONS.entries()){
   let good=false;
   for(let trial=0;trial<6&&!good;trial++){
    const seed=8100001+[...parentIds].indexOf(id)*1000+index*10+trial;
    try{const child=mutateDiscovery(parent,{kind,seed,distinctPhysical:false}),k=definitionKey(child.board);if(byKey.has(k)){mutationAudit.push({parent:id,kind,seed,duplicateOf:byKey.get(k)});good=true;continue;}
     byKey.set(k,child.id);child.trainCandidate=true;byId.set(child.id,child);mutationAudit.push({parent:id,kind,seed,child:child.id,accepted:true});good=true;
    }catch(e){mutationAudit.push({parent:id,kind,seed,accepted:false,reason:e.message});}
   }
  }
 }
 records=[...byId.values()];save('basics',basics);save('positions',searches);save('records',records);save('mutations',mutationAudit);
}
const recordById=new Map(records.map(r=>[r.id,r])),parents=records.filter(r=>r.discoveryParent),training=records.filter(r=>r.discoveryParent||r.trainCandidate);
let games=existsSync(path('games'))?read('games'):[];const ledger=new Map(games.map(g=>[g.id,g]));let continuations=0;
function checkpoint(){save('games',[...ledger.values()]);}
function run(plans,{ms=150,plies=768}={}){
 // Round-robin actor/seat conditions, so an interrupted phase covers all shapes.
 plans.sort((a,b)=>a.starter-b.starter||Number(a.positionSwap)-Number(b.positionSwap)||Number(a.aiSwap)-Number(b.aiSwap));
 for(const plan of plans){
  if(!resume||performance.now()-start>=budget)break;
  let g=ledger.get(plan.id);if(g?.state.winner!==undefined&&g.state.winner!==null)continue;
  if(g)continuations++;else g=createExperiment(plan);
  const n=advanceExperiment(g,{maxPlies:Math.min(100000,g.state.ply+plies),timeBudgetMs:ms,memoryBudgetMb:512,onCheckpoint:part=>{ledger.set(part.id,structuredClone(part));checkpoint();}});
  verifyExperiment(n);ledger.set(n.id,n);
  if(ledger.size%64===0){checkpoint();console.log('games',ledger.size,'seconds',Math.round((performance.now()-start)/1000),'stage',plan.stage);}
 }
 checkpoint();
}
const rowsFor=(id,stage,regime='standard')=>[...ledger.values()].filter(g=>g.experiment.boardId===id&&g.experiment.stage===stage&&g.experiment.regime===regime);
run(training.flatMap(r=>factorialPlans(r,{stage:'screen',seeds:[610001],pairs:[['star','positional']]})),{ms:80,plies:512});
// Freeze child selection using training only; holdout results never change membership.
let frozen;
if(existsSync(path('frozen')))frozen=read('frozen');
else{
 frozen=[];
 for(const p of parents){
  const children=training.filter(r=>r.parent===p.id),scores=children.map(r=>({r,m:aggregate(rowsFor(r.id,'screen'))})).filter(x=>x.m.games===8);
  const position=children.find(r=>r.mutation==='positions'&&rowsFor(r.id,'screen').length===8);
  const front=paretoFront(scores.map(x=>({id:x.r.id,metrics:x.m}))),other=scores.filter(x=>front.includes(x.r.id)&&x.r.mutation!=='positions').sort((a,b)=>a.m.positionBias-b.m.positionBias||a.m.unresolvedRate-b.m.unresolvedRate||a.m.firstBias-b.m.firstBias)[0]?.r;
  frozen.push({parent:p.id,positionChild:position?.id??null,otherChild:other?.id??null,trainingPareto:front,reason:scores.length?'training-only stratified Pareto selection':'insufficient training budget'});
 }
 if(frozen.every(f=>f.positionChild||f.otherChild))save('frozen',frozen);
}
const finalists=[...new Set(frozen.flatMap(f=>[f.parent,f.positionChild,f.otherChild]).filter(Boolean))].map(id=>recordById.get(id));
run(finalists.flatMap(r=>factorialPlans(r,{stage:'deep-train',seeds:[610007],pairs:[['defensive','mixed'],['search','route']]})),{ms:180,plies:1024});
const holdoutPlans=finalists.flatMap(r=>HOLDOUT_SEEDS.flatMap((seed,i)=>factorialPlans(r,{stage:'holdout',seeds:[seed],pairs:[i%2?['defensive','search']:['mixed','route']]})));
run(holdoutPlans,{ms:250,plies:1536});
// Controls are separate experiments, never included in standard win rates.
const controls=finalists.filter(r=>r.parent).slice(0,6);
for(const regime of ['control-full','control-no-wall'])run(controls.flatMap(r=>factorialPlans(r,{stage:'wall-control',seeds:[9900011],pairs:[['positional','search']],regime})),{ms:180,plies:1024});
run(controls.flatMap(r=>factorialPlans(r,{stage:'depth-control',seeds:[9900023],pairs:[['positional','search']],regime:'control-full'})),{ms:180,plies:1024});
const comparisons=[];
for(const f of frozen)for(const child of [f.positionChild,f.otherChild].filter(Boolean))comparisons.push({parent:f.parent,child,kind:recordById.get(child).mutation,training:compareMatched(rowsFor(f.parent,'screen'),rowsFor(child,'screen')),holdout:compareMatched(rowsFor(f.parent,'holdout'),rowsFor(child,'holdout'))});
const library=finalists.map(r=>{
 const train=aggregate(rowsFor(r.id,'screen')),deep=aggregate(rowsFor(r.id,'deep-train')),held=aggregate(rowsFor(r.id,'holdout')),metrics=aggregate([...rowsFor(r.id,'screen'),...rowsFor(r.id,'deep-train'),...rowsFor(r.id,'holdout')]);
 const wallFull=aggregate(rowsFor(r.id,'wall-control','control-full')),wallNone=aggregate(rowsFor(r.id,'wall-control','control-no-wall')),depth=aggregate(rowsFor(r.id,'depth-control','control-full'));
 const completeHoldout=held.games===32&&held.clusterCount===4;
 const comparison=comparisons.find(c=>c.child===r.id);
 return {...r,name:'【名盤研究】'+r.name,status:'AI検証中',games:metrics.games,unresolvedRate:metrics.unresolvedRate,metrics:{...metrics,stages:{screen:train,deep,holdout:held},completeHoldout,comparison,controls:{wallFull,wallNone,depth}},traits:classify(r,held,{wallIntervention:{matchedGames:Math.min(wallFull.games,wallNone.games)},depth:{matchedGames:depth.games}}),warnings:['研究用・未認定','AI条件付き。人間の面白さと最善手の公平性は未証明',...(held.positionBias>.5?['初期位置の偏りを観測']:[]),...(!completeHoldout?['独立検証の計画未完了']:[])]};
});
const frontier=paretoFront(library.map(r=>({id:r.id,metrics:r.metrics.stages.holdout})));
for(const r of library){r.pareto=frontier.includes(r.id);if(r.pareto&&r.metrics.completeHoldout&&r.metrics.unresolvedRate<=.25&&r.metrics.positionBias<=.25&&r.metrics.firstBias<=.25)r.status='有望候補';}
save('library',library);save('comparisons',comparisons);
const all=uniqueGames([...ledger.values()]),standard=all.filter(g=>g.experiment.regime==='standard'),control=all.filter(g=>g.experiment.regime!=='standard');
all.forEach(verifyExperiment);
const summary={version:VERSION,basicEvaluated:basics.length,positionSearches:searches.length,positionProposals:searches.reduce((a,r)=>a+r.accepted.length+r.rejected.length,0),legalPositionProposals:searches.reduce((a,r)=>a+r.accepted.length,0),selectedParents:parents.length,trainingBoards:training.length,deepBoards:new Set(all.filter(g=>g.experiment.stage==='deep-train').map(g=>g.experiment.boardId)).size,holdoutBoards:new Set(all.filter(g=>g.experiment.stage==='holdout').map(g=>g.experiment.boardId)).size,finalists:finalists.length,uniqueGames:all.length,standard:aggregate(standard),controls:aggregate(control),continuationsThisInvocation:continuations,mutationAttempts:mutationAudit.length,mutationAccepted:mutationAudit.filter(r=>r.accepted).length,mutationRejected:mutationAudit.filter(r=>r.accepted===false).length,mutationDuplicates:mutationAudit.filter(r=>r.duplicateOf).length,pareto:frontier,positionImprovementsSupported:comparisons.filter(c=>c.kind==='positions'&&c.holdout.improvementSupported).map(c=>c.child),otherImprovementsSupported:comparisons.filter(c=>c.kind!=='positions'&&c.holdout.improvementSupported).map(c=>c.child),comparisons:comparisons.map(c=>({parent:c.parent,child:c.child,kind:c.kind,holdout:c.holdout})),elapsedThisInvocationMs:performance.now()-start,sourceCorpusSHA256:hashFile('reports/mask-lab-2026-10-22/corpus.json.gz'),plannedHoldoutGames:holdoutPlans.length,allReplayed:true,limitations:['Exploratory multi-candidate testing; improvement intervals are unadjusted for multiple comparisons','No board is officially certified','Static placement score does not prove fairness','No-wall controls change the action rules and are not official games','Few independent clusters; AI and seed dependence remain','A budget cap is unresolved, never a draw','All candidate membership was frozen before holdout']};
writeFileSync(`${dir}/summary.json`,JSON.stringify(summary,null,2)+'\n');
if(process.env.DISCOVERY_EXPORT==='1')writeFileSync(new URL('../src/discovered-library.js',import.meta.url),'// Exploratory policy-dependent research. Not official boards.\nexport const DISCOVERED_LIBRARY = '+JSON.stringify(library,null,2)+';\n');
console.log(JSON.stringify({...summary,comparisons:undefined,standard:{games:summary.standard.games,first:summary.standard.first,second:summary.standard.second,unresolved:summary.standard.unresolved},controls:{games:summary.controls.games}},null,2));
