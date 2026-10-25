import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {initial,key,successors} from '../src/engine.js';
import {choose,seeded} from '../src/ai.js';
import {referenceChildren} from '../scripts/stall-research.js';
import {researchDecision,actionID,pathValue} from '../scripts/defense-path-ai.js';
import {replayOriginalDefense} from '../scripts/defense-source-replay.js';
import {forcedScoreWithinThree} from '../scripts/defense-path-audit.js';
const archive=JSON.parse(gunzipSync(readFileSync(new URL('../reports/defense-path-2026-10-26/positions.json.gz',import.meta.url))));
test('research control preserves archived production decisions with exact RNG and history',()=>{
 for(const c of archive.cases){const seen=new Map(c.seen);assert.deepEqual(researchDecision(c.state,{rng:seeded(c.seed),seen}).action,choose(c.state,{rng:seeded(c.seed),seen}));}
});
test('D regression: all immediate win defenses fall outside the old beam; preserve them',()=>{
 const original=replayOriginalDefense();assert.deepEqual(original.safe.map(c=>c.rank),[9,10,18]);assert.equal(original.choices.control.allowsImmediateLoss,true);assert.equal(original.choices.defense.allowsImmediateLoss,false);
 const c=archive.cases.find(c=>c.allWinDefenseOutsideBeam);assert.equal(c.mode,'D');
 const cs=referenceChildren(c.state),p=c.state.turn;
 const safe=cs.filter(c=>c.n.winner===p||!referenceChildren(c.n).some(r=>r.n.winner===1-p));
 assert.ok(safe.length>0);assert.ok(c.moves.filter(m=>!m.allowsWin).every(m=>m.rank>8));
 for(const variant of ['defense','path','combined']){
  const r=researchDecision(c.state,{variant,rng:seeded(c.seed),seen:new Map(c.seen)});
  assert.ok(safe.some(c=>actionID(c.a)===actionID(r.action)));assert.ok(r.stats.rootCandidates<=8);
 }
 const strong=choose(c.state,{level:'strong',rng:seeded(c.seed),seen:new Map(c.seen)});
 assert.ok(safe.some(c=>actionID(c.a)===actionID(strong)),'existing strong CPU already has immediate safety protection');
});
test('research variants preserve input, legal transitions and terminal priorities in every mode',()=>{
 for(let mode=4;mode<=8;mode++)for(const variant of ['control','defense','path','combined']){
  const s=initial(mode),copy=structuredClone(s),seen=new Map([[key(s),2]]),before=[...seen];
  const r=researchDecision(s,{variant,rng:seeded(77),seen});
  assert.ok(successors(s).some(c=>actionID(c.a)===actionID(r.action)));assert.deepEqual(s,copy);assert.deepEqual([...seen],before);
 }
 const wins=archive.cases.filter(c=>c.moves.some(m=>m.ownWin));assert.ok(wins.length);
 for(const c of wins)for(const variant of ['control','defense','path','combined']){const r=researchDecision(c.state,{variant,rng:seeded(c.seed),seen:new Map(c.seen)});assert.equal(referenceChildren(c.state).find(c=>actionID(c.a)===actionID(r.action)).n.winner,c.state.turn);}
});
test('three-ply witnesses are independently verified with production transitions and all replies',()=>{
 assert.ok(archive.deeper.some(c=>c.mode==='E'&&c.result.witnesses.some(w=>w.plies===3&&w.action.wall!==null)));
 for(const c of archive.deeper)for(const witness of c.result.witnesses){
  const p=c.state.turn,cs=successors(c.state),n=cs.find(x=>actionID(x.a)===actionID(witness.action)).n;
  if(witness.plies===1){assert.ok(n.scores[p]>c.state.scores[p]);continue;}
  const rs=successors(n);assert.ok(rs.length);
  for(const r of rs){assert.notEqual(r.n.winner,1-p);assert.ok(successors(r.n).some(next=>next.n.scores[p]>c.state.scores[p]));}
 }
 const s=initial(8),r=forcedScoreWithinThree(s,{budget:1});assert.equal(r.complete,false);assert.equal(r.verdict,'unknown');
 assert.equal(pathValue({...s,winner:0},0),100000);
});
