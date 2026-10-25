import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {victoryWalkDistance,tieMove} from '../scripts/d-walk-ties.js';
import {walkingDistance,progressMove} from '../scripts/b-progress-ai.js';
import {plans,lengthBounds,play,makeInitial,physicalKey} from '../scripts/d-walk-study.js';
import {randomStream} from '../scripts/tactics-completion.js';
import {independentRoots,judgeChoice} from '../scripts/b-factorial-study.js';
const s={width:3,height:3,playableCells:[0,1,2,3,4,5,6,7,8],players:[6,2],walls:[4],stars:[0,3,8],scores:[0,0],target:2,turn:0,ply:0,winner:null};
test('victory-distance estimates required stars, preserves the board, and is not a new movement rule',()=>{
 const before=structuredClone(s),one={...s,target:1};assert.equal(victoryWalkDistance(one,0),walkingDistance(one,0));assert.equal(victoryWalkDistance(s,0),2);assert.equal(victoryWalkDistance({...s,target:4},0),Infinity);assert.deepEqual(s,before);
});
test('all exact-tie selectors preserve ranked defensive roots, RNG and the maximum original D value',()=>{
 const cs=JSON.parse(gunzipSync(Buffer.from(readFileSync(new URL('../reports/trajectory-followup-2026-10-23/B-cases.json.gz.b64',import.meta.url),'utf8'),'base64')));let count=0;
 for(const c of cs.filter(c=>c.probes.find(p=>p.variant==='archived').loss.avoidableImmediateLoss)){
  const cp=c.checkpoint,seen=new Map(cp.visits.map(([k,v])=>[k,v.count])),d=tieMove(cp.state,'D',randomStream(cp.rngStates[cp.state.turn]),seen,{maxMs:3600000});
  for(const variant of ['D-walk','D-repeat','D-victory']){const r=tieMove(cp.state,variant,randomStream(cp.rngStates[cp.state.turn]),seen,{maxMs:3600000});assert.equal(r.rngAfter,d.rngAfter);assert.deepEqual(r.retainedActions,d.retainedActions);assert.equal(judgeChoice(independentRoots(cp.state),r).avoidableDanger,false);if(d.scores.length)assert.equal(r.scores.find(x=>JSON.stringify(x.action)===JSON.stringify(r.action)).value,Math.max(...d.scores.map(x=>x.value)));}
  count++;
 }assert.equal(count,3);
});
test('existing D-walk action and RNG are unchanged by the independent comparison adapter',()=>{
 const a=progressMove(s,randomStream(17),new Map()),b=tieMove(s,'D-walk',randomStream(17),new Map());assert.deepEqual(a.action,b.action);assert.equal(a.rngAfter,b.rngAfter);
});
test('censored length bounds retain unfinished games instead of reporting only quick wins',()=>{
 const game=(winner,n)=>({state:{winner},history:Array(n)}),r=lengthBounds([game(0,2),game(1,4),game(null,8),game(null,10)]);
 assert.deepEqual(r.median,[4,4]);assert.deepEqual(r.p90,[9,null]);assert.deepEqual(r.restrictedMean256,[6.5,129.5]);
});
test('independent rosters cross all four physical/turn conditions and keep sources distinct',()=>{
 const a=plans('self'),b=plans('panel');assert.equal(a.length,192);assert.equal(b.length,256);assert.equal(new Set([...a,...b].map(g=>g.id)).size,448);
 assert.equal(new Set([...a,...b].map(g=>g.seed)).size,20);for(const g of [...a,...b])assert.equal(g.experiment.regime,'standard');
 const x=makeInitial('self',2424001,['D','D-walk'],false,0),y={...x.initial,players:[...x.initial.players].reverse(),scores:[...x.initial.scores].reverse(),turn:1};assert.equal(physicalKey(x.initial),physicalKey(y));
});
test('mixed-policy continuation preserves history and replays both controller identities',()=>{
 const g=makeInitial('self',2424001,['D','D-walk'],false,0),stats=[],a=play(g,{ms:10000,plies:4,stats}),b=play(a,{ms:10000,plies:4});assert.deepEqual(b.history.slice(0,a.history.length),a.history);assert.deepEqual(stats.map(s=>s.label),['D','D-walk','D','D-walk']);const replay=play(g,{ms:3600000,plies:a.state.ply,replayStats:stats});for(const k of ['history','state','rngStates','visits'])assert.deepEqual(replay[k],a[k]);
});
