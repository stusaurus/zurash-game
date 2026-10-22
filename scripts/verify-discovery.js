import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {apply} from '../src/engine.js';
import {validateBoard,definitionKey} from '../src/board-lab.js';
import {verifyExperiment,uniqueGames,aggregate,factorialPlans,HOLDOUT_SEEDS,TRAIN_SEEDS} from './board-discovery.js';
const dir=process.env.DISCOVERY_REPORT??'reports/discovery-2026-10-22',read=name=>JSON.parse(gunzipSync(readFileSync(`${dir}/${name}.json.gz`))),summary=JSON.parse(readFileSync(`${dir}/summary.json`)),records=[...read('records'),...(existsSync(`${dir}/position-roster.json.gz`)?read('position-roster'):[])],byId=new Map(records.map(r=>[r.id,r])),primaryGames=read('games'),followGames=existsSync(`${dir}/position-games.json.gz`)?read('position-games'):[],games=[...primaryGames,...followGames],basics=read('basics'),positions=read('positions'),frozen=read('frozen');
assert.equal(basics.length,1135);assert.equal(new Set(basics.map(r=>r.id)).size,1135);assert.equal(positions.length,1135);
const definitions=new Set();for(const r of byId.values()){assert.ok(validateBoard(r.board).ok,r.id);const k=definitionKey(r.board);assert.ok(!definitions.has(k),'Duplicate definition');definitions.add(k);}
const unique=uniqueGames(games);assert.equal(unique.length,games.length,'Duplicate game record');
const followFrozen=existsSync(`${dir}/position-frozen.json.gz`)?read('position-frozen'):[],followIds=new Set(followFrozen.flatMap(r=>[r.parent,r.child].filter(Boolean))),followSeeds=[9800003,9800033,9800059,9800083];
const finalIds=new Set(frozen.flatMap(f=>[f.parent,f.positionChild,f.otherChild].filter(Boolean)));let plies=0,holds=0,controls=0,leadMetrics=0;
for(const g of unique){
 verifyExperiment(g);const r=byId.get(g.experiment.boardId);assert.ok(r);assert.equal(definitionKey({...g.initial,players:g.experiment.physicalSlots}),definitionKey(r.board));
 const planned=factorialPlans(r,{stage:g.experiment.stage,seeds:[g.seed],pairs:[g.experiment.pair],regime:g.experiment.regime}).find(p=>p.id===g.id);assert.ok(planned,'Experiment fingerprint');assert.deepEqual(planned.policies,g.policies);assert.deepEqual(planned.board.players,g.initial.players);
 if(g.experiment.stage==='holdout'){assert.ok(HOLDOUT_SEEDS.includes(g.seed));assert.ok(!TRAIN_SEEDS.includes(g.seed));assert.ok(finalIds.has(r.id));holds++;}
 if(g.experiment.stage==='position-holdout'){assert.ok(followSeeds.includes(g.seed));assert.ok(followIds.has(r.id));holds++;}
 if(g.experiment.stage==='position-train')assert.equal(g.seed,6300013);
 if(g.experiment.regime!=='standard')controls++;
 let s=g.initial,wallMoves=0,priorLead=0,changes=0,scored=0;const loserMatchpoint=[false,false];
 for(const h of g.history){for(let p=0;p<2;p++)if(s.scores[p]===s.target-1&&s.scores[p]>s.scores[1-p])loserMatchpoint[p]=true;
  assert.equal(h.from,s.players[s.turn]);if(h.a.wall){assert.equal(h.wallFrom,s.walls[h.a.wall.wall]);wallMoves++;}
  const n=apply(s,h.a);assert.equal(h.gain,n.scores[s.turn]>s.scores[s.turn]);if(h.gain)scored++;
  const lead=Math.sign(n.scores[0]-n.scores[1]);if(priorLead&&lead&&lead!==priorLead)changes++;if(lead)priorLead=lead;s=n;plies++;
 }
 assert.deepEqual(s,g.state);assert.equal(wallMoves,g.metrics.wallMoves);assert.equal(scored,g.metrics.scorePlies.length);assert.equal(changes,g.metrics.leadChanges);leadMetrics++;
 if(g.state.winner!==null)assert.equal(g.metrics.nearVictoryReversal,loserMatchpoint[1-g.state.winner]);
}
const standard=aggregate(primaryGames.filter(g=>g.experiment.regime==='standard'));
for(const field of ['games','first','second','unresolved','positionWins','leadChangeGames','nearVictoryReversals','wallMoves','plies'])assert.deepEqual(standard[field],summary.standard[field]);assert.equal(summary.uniqueGames,primaryGames.length);
if(existsSync(`${dir}/discovery-final.json`)){const final=JSON.parse(readFileSync(`${dir}/discovery-final.json`)),normal=aggregate(unique.filter(g=>g.experiment.regime==='standard'));assert.equal(final.uniqueNewGames,unique.length);for(const f of ['games','first','second','unresolved','positionWins','wallMoves','plies'])assert.deepEqual(normal[f],final.normal[f]);}
for(const r of (existsSync(`${dir}/position-roster.json.gz`)?read('position-roster'):[]).filter(r=>r.mutation==='positions'&&!r.discoveryParent)){const parent=byId.get(r.parent);assert.ok(parent);for(const field of ['walls','stars','playableCells'])assert.deepEqual(r.board[field],parent.board[field]);assert.equal(r.board.target,parent.board.target);assert.notDeepEqual([...r.board.players].sort((a,b)=>a-b),[...parent.board.players].sort((a,b)=>a-b));}
let verifiedContinuations=0;
if(existsSync(`${dir}/continuation-audit.json.gz`)){const map=new Map(unique.map(g=>[g.id,g]));for(const a of read('continuation-audit')){const g=map.get(a.id);assert.ok(g);assert.ok(g.history.length>=a.afterPlies);assert.equal(createHash('sha256').update(JSON.stringify(g.history.slice(0,a.beforePlies))).digest('hex'),a.beforePrefixSHA256);if(g.history.length===a.afterPlies)assert.deepEqual(g.rngStates,a.afterRNG);verifiedContinuations++;}}
const hashes=Object.fromEntries(['basics','positions','records','mutations','frozen','games','comparisons','library','position-games','position-frozen','position-roster','position-audit','position-comparisons','catalogue','placement-audit','continuation-audit'].filter(name=>existsSync(`${dir}/${name}.json.gz`)).map(name=>[name+'.json.gz',createHash('sha256').update(readFileSync(`${dir}/${name}.json.gz`)).digest('hex')]));
const result={basicBoards:basics.length,legalSavedDefinitions:definitions.size,uniqueGames:unique.length,standardGames:unique.filter(g=>g.experiment.regime==='standard').length,interventionGames:controls,holdoutGames:holds,replayedPlies:plies,independentlyCheckedLeadMetrics:leadMetrics,verifiedContinuations,newGamesFromContinuation:0,hashes};writeFileSync(`${dir}/verification.json`,JSON.stringify(result,null,2)+'\n');console.log(result);
