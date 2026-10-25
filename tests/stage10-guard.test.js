import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';
import {seeded} from '../src/ai.js';import {referenceChildren} from '../scripts/stall-research.js';
import {researchDecision,actionID} from '../scripts/defense-path-ai.js';import {stage10Decision} from '../scripts/stage10-policy.js';
const cases=JSON.parse(gunzipSync(readFileSync(new URL('../reports/defense-path-2026-10-26/positions.json.gz',import.meta.url)))).cases;
test('win-only guard is exactly the original search outside opponent match point, including RNG and work',()=>{
 let checked=0;for(const c of cases){if(c.state.scores[1-c.state.turn]===(c.state.target??3)-1)continue;
  const a=seeded(c.seed),b=seeded(c.seed),seen=new Map(c.seen),x=researchDecision(c.state,{variant:'control',rng:a,seen}),y=researchDecision(c.state,{variant:'win-guard',rng:b,seen});
  assert.deepEqual(y,x);assert.equal(a(),b());checked++;
 }assert.ok(checked>50);
});
test('win-only guard avoids independently proved immediate losses whenever a safe move exists',()=>{
 let checked=0;for(const c of cases){if(c.state.scores[1-c.state.turn]!==c.state.target-1)continue;
  const before=structuredClone(c.state),p=c.state.turn,options=referenceChildren(c.state),safe=options.filter(c=>c.n.winner===p||!referenceChildren(c.n).some(r=>r.n.winner===1-p));
  const r=researchDecision(c.state,{variant:'win-guard',rng:seeded(c.seed),seen:new Map(c.seen)});
  if(safe.length)assert.ok(safe.some(c=>actionID(c.a)===actionID(r.action)));
  assert.ok(r.stats.rootCandidates<=8);assert.deepEqual(c.state,before);checked++;
 }assert.ok(checked>0);assert.throws(()=>stage10Decision(cases[0].state,{variant:'typo'}),/Unknown/);
});
