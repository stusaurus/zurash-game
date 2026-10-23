import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {apply,key} from '../src/engine.js';
import {validateBoard,definitionKey} from '../src/board-lab.js';
import {verifyExperiment} from './board-discovery.js';
import {referenceChildren,mergeContinuation,researchPlans,sha,solveGraph,aggregateResearch} from './stall-research.js';
const dir=process.env.STALL_REPORT??'reports/stall-2026-10-23',base='reports/discovery-2026-10-22',read=(d,n)=>JSON.parse(gunzipSync(readFileSync(`${d}/${n}.json.gz`)));
const old=[...read(base,'games'),...read(base,'position-games')],delta=read(dir,'imported-delta'),m=mergeContinuation(old,delta),provenance=JSON.parse(readFileSync(`${dir}/import-provenance.json`));
assert.equal(sha(old),provenance.baseline);assert.equal(sha(delta),provenance.delta);assert.equal(sha(m.games),provenance.source);assert.equal(m.continued,provenance.continued);assert.equal(m.newlySettled,provenance.newlySettled);
const bySource=new Map(m.games.map(g=>[g.id,g]));for(const a of read(dir,'imported-source-audit')){const before=old.find(g=>g.id===a.id),after=bySource.get(a.id);assert.ok(before&&after);assert.equal(sha(before.history),a.beforePrefixSHA256);assert.equal(before.history.length,a.beforePlies);assert.deepEqual(before.rngStates,a.beforeRNG);assert.equal(after.history.length,a.afterPlies);assert.deepEqual(after.rngStates,a.afterRNG);}
for(const g of m.games)verifyExperiment(g);
const diagnosis=read(dir,'diagnosis'),proofResults=[];let proofStates=0;
for(const r of diagnosis)for(const p of r.proofs){assert.equal(p.complete,true);const seen=new Set();for(let i=0;i<p.graph.length;i++){
 const v=p.graph[i];assert.ok(!seen.has(key(v.state)));seen.add(key(v.state));const cs=referenceChildren(v.state);assert.equal(cs.length,v.edges.length);for(let j=0;j<cs.length;j++){const e=v.edges[j];assert.deepEqual(e.a,cs[j].a);assert.equal(key(p.graph[e.to].state),key(cs[j].n));}if(v.parent!==null)assert.deepEqual(apply(p.graph[v.parent].state,v.action),v.state);proofStates++;
 }assert.equal(p.winningStates,0);assert.ok(p.graph.every(v=>v.state.winner===null));proofResults.push({id:r.id,turn:p.turn,...solveGraph(p)});}
const variants=read(dir,'variants'),roster=read(dir,'roster'),records=new Map([...diagnosis,...variants.accepted.map(v=>v.record),...roster].map(r=>[r.id,r]));for(const r of records.values())assert.ok(validateBoard(r.board).ok,r.id);
let variantProofStates=0;
if(existsSync(`${dir}/variant-proofs.json.gz`))for(const r of read(dir,'variant-proofs'))for(const p of r.starts){
 if(!p.complete)continue;assert.equal(p.graph.length,p.states);assert.deepEqual(p.graph[0].state,{...records.get(r.id).board,turn:p.turn});const seen=new Set();
 for(const v of p.graph){assert.ok(!seen.has(key(v.state)));seen.add(key(v.state));const cs=referenceChildren(v.state);assert.equal(cs.length,v.edges.length);for(let i=0;i<cs.length;i++){assert.deepEqual(cs[i].a,v.edges[i].a);assert.equal(key(cs[i].n),key(p.graph[v.edges[i].to].state));}variantProofStates++;}
 assert.deepEqual(solveGraph(p),p.solution);assert.equal(p.winningStates,p.graph.filter(v=>v.state.winner!==null).length);
}
const protocol=JSON.parse(readFileSync(`${dir}/protocol.json`)),games=read(dir,'games'),ids=new Set();let plies=0;
for(const g of games){assert.ok(!ids.has(g.id));ids.add(g.id);verifyExperiment(g);const r=records.get(g.experiment.boardId);assert.ok(r);const plan=researchPlans(r,{stage:g.experiment.stage,seeds:[g.seed],pairs:[g.research.labels]}).find(p=>p.id===g.id);assert.ok(plan,'Research ID fingerprint');assert.deepEqual(g.research,plan.research);assert.equal(definitionKey(g.initial),definitionKey(plan.board));
 if(g.experiment.stage==='stall-holdout'){assert.ok(protocol.holdoutSeeds.includes(g.seed));assert.ok(!protocol.trainingSeeds.includes(g.seed));}
 let s=g.initial,wall=0,gains=0;for(const h of g.history){const cs=referenceChildren(s),c=cs.find(c=>JSON.stringify(c.a)===JSON.stringify(h.a));assert.ok(c,'Independent legal action');assert.equal(h.legal,cs.length);assert.equal(h.gain,c.n.scores[s.turn]>s.scores[s.turn]);assert.equal(h.canScore,cs.some(c=>c.n.scores[s.turn]>s.scores[s.turn]));assert.equal(h.canWin,cs.some(c=>c.n.winner===s.turn));assert.equal(h.from,s.players[s.turn]);if(h.a.wall)wall++;if(h.gain)gains++;s=c.n;plies++;}assert.deepEqual(s,g.state);assert.equal(wall,g.metrics.wallMoves);assert.equal(gains,g.metrics.scorePlies.length);
}
const summary=JSON.parse(readFileSync(`${dir}/summary.json`));assert.equal(summary.uniqueNewGames,games.length);
const fields=['games','first','second','unresolved','positionWins','wallMoves','plies','leadChangeGames','nearVictoryReversals'];
for(const [stage,m] of Object.entries(summary.newByStage)){const a=aggregateResearch(games.filter(g=>g.experiment.stage===stage));for(const f of fields)assert.deepEqual(a[f],m[f]);}
for(const r of read(dir,'catalogue')){const a=aggregateResearch(games.filter(g=>g.experiment.boardId===r.id&&g.experiment.stage==='stall-holdout'));for(const f of fields)assert.deepEqual(a[f],r.metrics[f]);if(summary.complete)assert.equal(a.games,64);}
const result={sourceUniqueGames:m.games.length,importedContinuations:m.continued,newlySettledSourceGames:m.newlySettled,sourceNewGames:0,newResearchGames:ids.size,replayedNewPlies:plies,independentlyCheckedProofStates:proofStates,variantProofStates,proofResults,validatedDefinitions:records.size,hashes:Object.fromEntries(['games','imported-delta','diagnosis','variants','variant-proofs','frozen','catalogue'].filter(n=>existsSync(`${dir}/${n}.json.gz`)).map(n=>[n,sha(readFileSync(`${dir}/${n}.json.gz`))]))};writeFileSync(`${dir}/verification.json`,JSON.stringify(result,null,2)+'\n');console.log(result);
