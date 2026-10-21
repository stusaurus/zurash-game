import test from 'node:test';import assert from 'node:assert/strict';
import {newGame,advanceGame,verifyGame,randomStream,policyMove,POLICY_SPEC} from '../scripts/tactics-completion.js';
import {completionSummary} from '../scripts/tactics-completion-statistics.js';
import {initial,key,successors} from '../src/engine.js';
const cycle={size:3,target:1,walls:[],stars:[4],players:[6,2],scores:[0,0],turn:0,ply:0,winner:null};
const cycling=s=>({wall:null,dir:[1,3,3,1][s.ply%4]});
test('120 plies and repeated states do not end the game or award a draw',()=>{
 const g=advanceGame(newGame(cycle),{maxPlies:132,timeBudgetMs:10000,select:cycling});
 assert.equal(g.reason,'budget-plies');assert.equal(g.state.ply,132);assert.equal(g.state.winner,null);assert.ok(g.repetitionCount>0);assert.equal(g.repetitionEvents[0].period,4);assert.equal(g.repetitionEvents[0].actions.length,4);verifyGame(g);
});
test('checkpoint continuation matches uninterrupted actions, RNG, states and metrics',()=>{
 const g=newGame(initial(),{policies:['star','positional'],seed:987});
 const a=advanceGame(g,{maxPlies:4,timeBudgetMs:10000});
 const b=advanceGame(JSON.parse(JSON.stringify(a)),{maxPlies:100,timeBudgetMs:10000});
 const c=advanceGame(g,{maxPlies:100,timeBudgetMs:10000});
 for(const field of ['history','rngStates','state','metrics','visits','repetitionCount'])assert.deepEqual(b[field],c[field],field);
 verifyGame(b);
});
test('normal terminal win is recognized at either starting seat; no extra turn',()=>{
 for(const starter of [0,1]){
  const s={size:3,target:1,walls:[3],stars:[2],players:starter?[8,0]:[0,8],scores:[0,0],turn:starter,ply:0,winner:null};
  const g=advanceGame(newGame(s,{starter}),{timeBudgetMs:10000});assert.equal(g.reason,'win');assert.equal(g.state.winner,starter);assert.equal(g.state.ply,1);verifyGame(g);
 }
});
test('time, memory and no-action stops are unresolved, not draws',()=>{
 let clock=0;const g=advanceGame(newGame(cycle),{now:()=>clock++,timeBudgetMs:1});assert.equal(g.reason,'budget-time');
 const stuck={...cycle,walls:[1,3,5,7],players:[0,8]};assert.equal(advanceGame(newGame(stuck)).reason,'no-legal-action');
 assert.throws(()=>advanceGame(newGame(cycle),{maxPlies:-1}));
});
test('all policies return legal moves and take an immediate victory',()=>{
 const s={size:3,target:1,walls:[3],stars:[2],players:[0,8],scores:[0,0],turn:0,ply:0,winner:null};
 for(const policy of Object.keys(POLICY_SPEC)){const a=policyMove(s,policy,randomStream(99));assert.equal(successors(s).find(c=>JSON.stringify(c.a)===JSON.stringify(a)).n.winner,0);}
});
test('state identity distinguishes turn, scores and geometry; interchangeable walls stay equal',()=>{
 const s=initial();assert.notEqual(key(s),key({...s,turn:1}));assert.notEqual(key(s),key({...s,scores:[1,0]}));assert.equal(key(s),key({...s,walls:[...s.walls].reverse()}));
});
test('statistics retain unresolved games and compute both extreme outcomes',()=>{
 const g=advanceGame(newGame(cycle),{maxPlies:4,timeBudgetMs:10000,select:cycling});
 const rows=[{...g,cluster:'a',reason:'win',starter:0,state:{...g.state,winner:0}},{...g,cluster:'a',reason:'win',starter:0,state:{...g.state,winner:1}},{...g,cluster:'b'}];
 const r=completionSummary(rows);assert.equal(r.games,3);assert.equal(r.firstWins,1);assert.equal(r.secondWins,1);assert.equal(r.unresolved,1);assert.equal(r.officialDraws,0);assert.deepEqual(r.firstFinalPossibleRange,[1/3,2/3]);assert.equal(r.firstDecidedRate,.5);assert.equal(r.firstAllRate,1/3);
});
test('memory budget saves an unresolved checkpoint before allocating the next turn',()=>{
 const g=advanceGame(newGame(cycle),{memoryBudgetMb:32,heapBytes:()=>33*1024**2});assert.equal(g.reason,'budget-memory');assert.equal(g.state.ply,0);verifyGame(g);
});
test('checkpoint callback can itself be resumed, and terminal replay validates the winner',()=>{
 let snapshot;advanceGame(newGame(cycle),{maxPlies:129,timeBudgetMs:10000,select:cycling,onCheckpoint:g=>{snapshot=JSON.parse(JSON.stringify(g));}});
 assert.equal(snapshot.state.ply,128);
 const g=advanceGame(snapshot,{maxPlies:132,timeBudgetMs:10000,select:cycling});assert.equal(g.state.ply,132);verifyGame(g);
});
test('study plan fully counterbalances seats and AI identities on each geometry',async()=>{
 const fs=await import('node:fs');
 const plan=JSON.parse(fs.readFileSync(new URL('../reports/tactics-completion-plan.json',import.meta.url)));
 const groups=new Map(),ids=new Set();
 for(const t of plan.tasks){
  assert.ok(!ids.has(t.id));ids.add(t.id);
  const k=[t.size,t.scenario,t.pair,t.orientation,t.matchup].join(':');
  if(!groups.has(k))groups.set(k,[]);groups.get(k).push(t);
 }
 for(const ts of groups.values()){
  assert.equal(new Set(ts.map(t=>t.seed)).size,1);assert.equal(new Set(ts.map(t=>t.layoutSeed)).size,1);
  const [a,b]=ts[0].matchup.split('/');assert.equal(ts.length,a===b?2:4);
  for(const policies of a===b?[[a,b]]:[[a,b],[b,a]])for(const starter of [0,1])assert.ok(ts.some(t=>t.starter===starter&&t.policies.join('/')===policies.join('/')));
 }
 assert.equal(ids.size,plan.plannedGames);
});
test('a recorded game can pass ply 120 and then terminate in a genuine win',async()=>{
 const fs=await import('node:fs'),f=JSON.parse(fs.readFileSync(new URL('../reports/tactics-completion-late-win.json',import.meta.url)));
 const g=advanceGame(newGame(f.initial,f),{maxPlies:f.expected.ply+1,timeBudgetMs:10000,select:s=>f.actions[s.ply]});
 assert.ok(g.state.ply>120);assert.equal(g.reason,'win');assert.equal(g.state.ply,f.expected.ply);assert.equal(g.state.winner,f.expected.winner);verifyGame(g);
});
test('a scoreless cycle can be checkpointed and extended to a larger safety budget',()=>{
 const a=advanceGame(newGame(cycle),{maxPlies:256,timeBudgetMs:10000,select:cycling});
 const b=advanceGame(a,{maxPlies:600,timeBudgetMs:10000,select:cycling});
 assert.equal(b.reason,'budget-plies');assert.equal(b.state.ply,600);assert.equal(b.state.winner,null);assert.equal(b.stages.length,2);assert.ok(b.repetitionCount>a.repetitionCount);verifyGame(b);
});
test('few identical clusters do not produce a falsely narrow conservative interval',()=>{
 const state={winner:0,ply:2};const metrics={quiet:0};
 const r=completionSummary([{reason:'win',starter:0,cluster:'a',state,metrics},{reason:'win',starter:1,cluster:'a',state,metrics},{reason:'win',starter:0,cluster:'b',state,metrics},{reason:'win',starter:1,cluster:'b',state,metrics}]);
 assert.deepEqual(r.pairedBootstrapDecided95,[.5,.5]);assert.ok(r.conservativeClusterDecided95[0]<.45);assert.ok(r.conservativeClusterDecided95[1]>.55);assert.equal(r.judgment,'inconclusive-or-outside-target');
});
