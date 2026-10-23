import test from 'node:test';
import assert from 'node:assert/strict';
import {candidates,replayDiagnosis,captureWitness} from '../scripts/b-settlement-study.js';
import {key,apply} from '../src/engine.js';
import {validateBoard,definitionKey,recordBoard} from '../src/board-lab.js';
import {researchPlans,newResearchGame,advanceResearch} from '../scripts/stall-research.js';
import {RESEARCH_LAYOUTS} from '../src/research-layouts.js';
test('settlement candidates are reproducible legal children, not mutations of B',()=>{
 const before=JSON.stringify(RESEARCH_LAYOUTS),a=candidates(),b=candidates();assert.deepEqual(a,b);assert.ok(a.rows.length>=10);assert.equal(JSON.stringify(RESEARCH_LAYOUTS),before);
 assert.equal(new Set(a.rows.map(r=>definitionKey(r.board))).size,a.rows.length);
 for(const r of a.rows){assert.ok(validateBoard(r.board).ok);if(r.id!=='mode-B')assert.equal(r.parent,'mode-B');}
});
const board={width:3,height:3,playableCells:[0,1,2,3,4,5,6,7,8],players:[6,2],stars:[0,8,4],walls:[],target:2,scores:[0,0],turn:0,ply:0,winner:null};
test('diagnosis independently replays actions and rejects corrupt gain metadata',()=>{
 const r=recordBoard(board),p=researchPlans(r,{stage:'test',seeds:[33],pairs:[['star','positional']]} )[0],g=advanceResearch(newResearchGame(p),{maxPlies:12,timeBudgetMs:10000});
 const a=replayDiagnosis(g,{independent:true});assert.equal(a.plies,g.history.length);assert.ok(a.snapshots.length>=2);assert.ok(a.maxVisits>=1);
 const bad=structuredClone(g);bad.history[0].gain=!bad.history[0].gain;assert.throws(()=>replayDiagnosis(bad,{independent:true}));
});
test('full state repetition ignores ply but includes turn, scores, walls and stars',()=>{
 const r=recordBoard({...board,stars:[4],target:1}),p=researchPlans(r,{stage:'cycle',seeds:[71],pairs:[['star','positional']]} )[0];
 const g=newResearchGame(p);g.reason='budget-plies';const a=replayDiagnosis(g);assert.equal(a.duplicateStates,0);assert.equal(a.snapshots[0].ply,0);assert.equal(a.reason,'budget-plies');assert.equal(g.state.winner,null);
 assert.equal(key(board),key({...board,ply:100}));
 for(const change of [{turn:1},{scores:[1,0]},{walls:[1]},{stars:[0,8]}])assert.notEqual(key(board),key({...board,...change}));
});
test('cooperative scoring witness is replayable and bounded unknown is not impossibility',()=>{
 const s={...board,players:[6,2],stars:[0,4,8]};const r=captureWitness(s,0);assert.equal(r.status,'cooperative-capture-witness');let n=s;for(const a of r.actions)n=apply(n,a);assert.deepEqual(n,r.state);assert.ok(n.scores[0]>0);
 const limited=captureWitness({...s,stars:[4]},0,{maxStates:1});assert.equal(limited.status,'unknown');assert.equal(limited.stop,'states');
});
test('matched factorial seeds preserve AI assignment and reproducible RNG checkpoints',()=>{
 const r=recordBoard(board),plans=researchPlans(r,{stage:'seed-check',seeds:[91],pairs:[['star','positional']]});assert.equal(plans.length,8);assert.equal(new Set(plans.map(p=>p.id)).size,8);
 for(const p of plans){
  const g=newResearchGame(p);assert.deepEqual(g.research.policyByActor,p.aiSwap?['positional','star']:['star','positional']);
  assert.deepEqual(g.initial.players,p.positionSwap?[...board.players].reverse():board.players);
  const a=advanceResearch(g,{maxPlies:4,timeBudgetMs:10000}),b=advanceResearch(g,{maxPlies:4,timeBudgetMs:10000});assert.deepEqual(a.history,b.history);assert.deepEqual(a.rngStates,b.rngStates);assert.deepEqual(a.state,b.state);
 }
});
