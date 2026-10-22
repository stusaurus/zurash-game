import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {successors,apply,key} from '../src/engine.js';
import {validateBoard} from '../src/board-lab.js';
import {newGame,advanceGame,verifyGame} from '../scripts/tactics-completion.js';
import {referenceChildren,reachableGraph,minimalVariants,researchPlans,newResearchGame,advanceResearch,mergeContinuation,settlementComparison,holm,solveGraph,aggregateResearch} from '../scripts/stall-research.js';
const rows=JSON.parse(gunzipSync(fs.readFileSync('reports/discovery-2026-10-22/catalogue.json.gz'))),u=rows.find(r=>r.id==='z-55f2fedf'),alias=rows.find(r=>r.id==='d-40d94fcdb64db85ae957dd95');
test('U fixtures differ only by actor labels; both starters have no reachable victory',()=>{
 assert.deepEqual(alias.board,{...u.board,players:[...u.board.players].reverse()});
 for(const r of [u,alias])for(const turn of [0,1]){
  const g=reachableGraph({...r.board,turn},{maxMs:10000,independent:true,keepGraph:true});
  assert.equal(g.complete,true);assert.equal(g.status,'no-reachable-victory');assert.equal(g.winningStates,0);assert.equal(g.noLegalStates,0);assert.deepEqual(g.uncapturedInitialStars,[12,13]);
  for(const v of g.graph){assert.deepEqual(referenceChildren(v.state),successors(v.state));for(const e of v.edges)assert.equal(key(apply(v.state,e.a)),key(g.graph[e.to].state));}
 }
});
test('bounded reachability is unknown on exhaustion and provides replayable winning witnesses',()=>{
 assert.equal(reachableGraph(u.board,{maxStates:1}).status,'unknown');
 const r=reachableGraph({...u.board,target:2},{maxMs:10000,independent:true});assert.ok(r.witness);let s={...u.board,target:2};for(const a of r.witness.actions)s=apply(s,a);assert.deepEqual(s,r.witness.state);assert.notEqual(s.winner,null);
});
test('minimal mutations preserve parent, report edit and validate every child',()=>{
 const before=JSON.stringify(u),v=minimalVariants(u);assert.equal(JSON.stringify(u),before);assert.ok(v.accepted.length>8);assert.ok(v.accepted.some(r=>r.change.kind==='stars'));assert.ok(v.accepted.some(r=>r.change.kind==='walls'));
 for(const r of v.accepted){assert.equal(r.parent,u.id);assert.ok(validateBoard(r.board).ok);if(r.change.kind==='stars'){assert.deepEqual(r.board.walls,u.board.walls);assert.deepEqual(r.board.players,u.board.players);assert.equal(r.board.target,u.board.target);}}
});
test('strict continuation import retains IDs and refuses a different prefix or RNG',()=>{
 const a=advanceGame(newGame(u.board,{id:'resume',policies:['star','star']}),{maxPlies:4,timeBudgetMs:10000});
 const b=advanceGame(a,{maxPlies:12,timeBudgetMs:10000});const m=mergeContinuation([a],[b]);assert.equal(m.newGames,0);assert.equal(m.continued,1);assert.equal(m.games.length,1);verifyGame(m.games[0]);
 const bad=structuredClone(b);bad.history[0].gain=!bad.history[0].gain;assert.throws(()=>mergeContinuation([a],[bad]),/Divergent/);
 const rng=structuredClone(a);rng.rngStates[0]^=1;assert.throws(()=>mergeContinuation([a],[rng]),/RNG/);assert.throws(()=>mergeContinuation([b],[a]),/Regressive/);
});
test('research policy labels, factorial seat assignment and fixed-ply RNG resume agree',()=>{
 const plans=researchPlans(u,{stage:'test',seeds:[931],pairs:[['repeat','score']]});assert.equal(plans.length,8);assert.equal(new Set(plans.map(p=>p.id)).size,8);
 for(const p of plans){assert.deepEqual(p.research.policyByActor,p.aiSwap?['score','repeat']:['repeat','score']);const g=newResearchGame(p);const direct=advanceResearch(g,{maxPlies:16,timeBudgetMs:10000}),part=advanceResearch(g,{maxPlies:8,timeBudgetMs:10000}),continued=advanceResearch(part,{maxPlies:16,timeBudgetMs:10000});assert.deepEqual(continued.history,direct.history);assert.deepEqual(continued.rngStates,direct.rngStates);verifyGame(direct);}
});
test('settlement keeps unresolved in denominator and Holm accounts for all comparisons',()=>{
 const plans=researchPlans(u,{stage:'test',seeds:[1,2,3,4],pairs:[['star','star']]}),gs=plans.map(p=>newResearchGame(p)),child=structuredClone(gs);child.forEach(g=>{g.state.winner=g.starter;});const c=settlementComparison(gs,child);assert.equal(c.settlementGain,1);assert.equal(c.matchedGames,32);assert.equal(c.oneSidedSeedSignFlipP,1/16);assert.equal(c.parent.unresolved,32);assert.deepEqual(holm([.01,.04,.03]),[.03,.06,.06]);
});
test('fixed point distinguishes no force from a forced positional win; custom policy identities survive aggregation',()=>{
 const a=reachableGraph(u.board,{keepGraph:true,independent:true});assert.equal(solveGraph(a).status,'neither-forces-victory');
 const b=reachableGraph({...u.board,target:2},{keepGraph:true,independent:true});assert.equal(solveGraph(b).status,'P1-forces-win');assert.equal(solveGraph({...b,complete:false}).status,'unknown');
 const gs=researchPlans(u,{stage:'test',seeds:[21],pairs:[['deeper','repeat']]}).map(p=>newResearchGame(p));const m=aggregateResearch(gs);assert.deepEqual(Object.keys(m.byPolicy).sort(),['deeper','repeat']);
});
