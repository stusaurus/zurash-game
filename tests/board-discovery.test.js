import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MASK_LIBRARY} from '../src/mask-library.js';
import {validateBoard,definitionKey} from '../src/board-lab.js';
import {basicFeatures,positionSearch,mutateDiscovery,MUTATIONS,factorialPlans,createExperiment,advanceExperiment,aggregate,compareMatched,paretoFront,uniqueGames,verifyExperiment,outcomes,topology,HOLDOUT_SEEDS,TRAIN_SEEDS} from '../scripts/board-discovery.js';
const record=MASK_LIBRARY[7];
test('factorial plans independently cross starting turn, physical slot and AI assignment',()=>{
 const ps=factorialPlans(record,{seeds:[11]});assert.equal(ps.length,8);assert.equal(new Set(ps.map(p=>p.id)).size,8);
 for(const p of ps){const g=createExperiment(p);assert.ok(verifyExperiment(g));assert.equal(g.initial.players[g.starter],record.board.players[p.positionSwap?1-p.starter:p.starter]);assert.deepEqual(g.policies,p.aiSwap?['positional','star']:['star','positional']);}
});
test('identities include geometry, rules, policies, swaps, seeds and research stage',()=>{
 const base=factorialPlans(record,{seeds:[11]})[0];
 const variants=[factorialPlans(record,{seeds:[12]})[0],factorialPlans(record,{seeds:[11],stage:'holdout'})[0],factorialPlans(record,{seeds:[11],regime:'control-no-wall'})[0],factorialPlans({...record,board:{...record.board,target:2}},{seeds:[11]})[0]];
 for(const p of variants)assert.notEqual(p.id,base.id);assert.ok(TRAIN_SEEDS.every(s=>!HOLDOUT_SEEDS.includes(s)));
});
function synthetic(winnerFn,seeds=[31,37,41,43]){return factorialPlans(record,{seeds}).map(p=>{const g=createExperiment(p);g.state.winner=winnerFn(p);return g;});}
test('50% first-turn result does not conceal a 100% physical-slot advantage',()=>{
 const gs=synthetic(p=>p.positionSwap?1:0),m=aggregate(gs);assert.equal(m.first,16);assert.equal(m.second,16);assert.deepEqual(m.positionWins,[32,0]);assert.equal(m.firstBias,0);assert.equal(m.positionBias,1);assert.equal(Object.keys(m.interaction).length,4);
});
test('AI wins and position/turn interaction use actual assignments',()=>{
 const gs=synthetic(p=>p.policies.indexOf('star')),m=aggregate(gs);assert.equal(m.byPolicy.star.wins,32);assert.equal(m.byPolicy.positional.losses,32);assert.deepEqual(m.positionWins,[16,16]);
 for(const g of gs){const o=outcomes(g);assert.equal(o.policyWinner,'star');assert.equal(o.physicalStarter,g.experiment.positionSwap?1-g.starter:g.starter);}
});
test('unresolved games remain in possible ranges and are never counted as draws',()=>{
 const gs=synthetic(p=>p.starter===0?null:0),m=aggregate(gs);assert.equal(m.unresolved,16);assert.deepEqual(m.firstFinalPossible,[0,.5]);assert.deepEqual(m.positionFinalPossible,[.25,.75]);assert.equal(m.bootstrapFirst95!==null,true);
 assert.equal(aggregate(gs.slice(0,8)).bootstrapFirst95,null);
});
test('matched comparisons detect position improvement without confusing turn advantage',()=>{
 const parent=synthetic(p=>p.positionSwap?1:0),child=synthetic(()=>0);const c=compareMatched(parent,child);assert.equal(c.matchedGames,32);assert.equal(c.improvementSupported,true);assert.deepEqual(c.bootstrapReduction95,[1,1]);
 const turnBiased=synthetic(p=>p.starter);assert.equal(compareMatched(parent,turnBiased).improvementSupported,false);
});
test('duplicate and continuation ledgers cannot inflate the number of games',()=>{
 const p=factorialPlans(record,{seeds:[12]})[0],g=createExperiment(p),part=advanceExperiment(g,{maxPlies:5,timeBudgetMs:10000}),long=advanceExperiment(part,{maxPlies:12,timeBudgetMs:10000});
 assert.equal(uniqueGames([long,part,long]).length,1);assert.equal(uniqueGames([long,part])[0].history.length,long.history.length);
 const bad=structuredClone(long);bad.policies.reverse();assert.throws(()=>uniqueGames([long,bad]),/collision/);
});
test('saved masked experiment resumes the exact RNG stream and legal history',()=>{
 const p=factorialPlans(record,{seeds:[511]})[2],g=createExperiment(p),direct=advanceExperiment(g,{maxPlies:30,timeBudgetMs:10000}),part=advanceExperiment(g,{maxPlies:9,timeBudgetMs:10000}),loaded=JSON.parse(JSON.stringify(part)),resumed=advanceExperiment(loaded,{maxPlies:30,timeBudgetMs:10000});
 assert.deepEqual(resumed.state,direct.state);assert.deepEqual(resumed.rngStates,direct.rngStates);assert.deepEqual(resumed.history,direct.history);assert.ok(verifyExperiment(resumed));
});
test('position search fixes stars, walls and terrain and retains parent provenance',()=>{
 const a=positionSearch(record,{seed:701,attempts:20}),b=positionSearch(record,{seed:701,attempts:20});assert.deepEqual(a,b);assert.ok(a.best);assert.notDeepEqual([...a.best.board.players].sort((a,b)=>a-b),[...record.board.players].sort((a,b)=>a-b));assert.equal(a.best.parent,record.id);assert.deepEqual(a.best.board.walls,record.board.walls);assert.deepEqual(a.best.board.stars,record.board.stars);assert.deepEqual(a.best.board.playableCells,record.board.playableCells);assert.ok(validateBoard(a.best.board).ok);
});
test('all eight mutation types retain legal children without overwriting parents',()=>{
 const original=definitionKey(record.board);
 for(const kind of MUTATIONS){let child;for(let seed=1;seed<=50&&!child;seed++)try{child=mutateDiscovery(record,{kind,seed});}catch{}assert.ok(child,kind);assert.ok(validateBoard(child.board).ok);assert.equal(child.parent,record.id);assert.notEqual(definitionKey(child.board),original);if(kind==='stars')assert.deepEqual(child.board.walls,record.board.walls);if(kind==='walls')assert.deepEqual(child.board.stars,record.board.stars);}
 assert.equal(definitionKey(record.board),original);
});
test('terrain bottlenecks are explicitly graph properties, not control claims',()=>{
 const t=topology({width:3,height:3,playableCells:[0,3,6,7,8],walls:[],stars:[]});assert.deepEqual(t.articulationCells,[3,6,7]);assert.equal(t.walkingGraphOnly,true);const b=basicFeatures(record);assert.equal(b.positions.unreachableReferenceOnly,true);assert.ok(b.openings.every(o=>o.actions>0));
});
test('Pareto selection preserves tradeoffs and removes only dominated rows',()=>{
 const row=(id,firstBias,positionBias,unresolvedRate,openingDiversity,nearVictoryReversals)=>({id,metrics:{firstBias,positionBias,unresolvedRate,openingDiversity,nearVictoryReversals}});
 assert.deepEqual(paretoFront([row('fair',0,0,.2,1,0),row('decisive',.3,.2,0,3,1),row('dominated',.5,.5,.5,0,0)]),['fair','decisive']);
});
test('wall intervention is separate and never permits a wall action',()=>{
 const p=factorialPlans(record,{seeds:[9],regime:'control-no-wall',pairs:[['positional','search']]})[0],g=advanceExperiment(createExperiment(p),{maxPlies:20,timeBudgetMs:10000});assert.ok(g.history.every(h=>h.a.wall===null));assert.ok(verifyExperiment(g));
 const bad=structuredClone(g);bad.experiment.positionSwap=!bad.experiment.positionSwap;assert.throws(()=>verifyExperiment(bad),/Position assignment/);
});

test('unknown parent outcomes cannot be turned into a positive improvement claim',()=>{
 const parent=synthetic(()=>null),child=synthetic(()=>0),c=compareMatched(parent,child);assert.equal(c.positionBiasReduction,null);assert.equal(c.improvementSupported,false);assert.equal(c.bootstrapReduction95,null);
});
