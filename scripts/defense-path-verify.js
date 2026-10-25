import {readFileSync,writeFileSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {key,distances} from '../src/engine.js';
import {choose,seeded} from '../src/ai.js';
import {referenceChildren} from './stall-research.js';
import {researchDecision,actionID} from './defense-path-ai.js';
import {auditPosition} from './defense-path-audit.js';
const dir=process.argv.includes('--confirm-e')?'reports/defense-path-e-confirm-2026-10-26':process.argv.includes('--confirm')?'reports/defense-path-confirm-2026-10-26':'reports/defense-path-2026-10-26',plan=JSON.parse(readFileSync(dir+'/plan.json'));
const games=JSON.parse(gunzipSync(readFileSync(dir+'/games.json.gz'))),partial=process.argv.includes('--partial');
if(!partial)assert.equal(games.length,plan.games);
assert.equal(new Set(games.map(g=>g.id)).size,games.length);
const validIDs=new Set();for(const b of plan.boards)for(const policies of plan.pairs)for(const seed of plan.seeds)for(const starter of [0,1])for(const swap of [false,true])validIDs.add(JSON.stringify([b.mode,b.name,policies,seed,starter,swap]));
let transitions=0,aiRecalculated=0,verifiedGames=0;const holdout=[],physicalWinners=new Map();
for(const g of games){
 assert.ok(validIDs.has(g.id));assert.equal(g.id,JSON.stringify([g.mode,g.candidate,g.policies,g.seed,g.starter,g.swap]));
 const b=plan.boards.find(c=>c.mode===g.mode&&c.name===g.candidate),expected={...structuredClone(b.board),turn:g.starter};if(g.swap)expected.players.reverse();assert.deepEqual(g.initial,expected);
 let s=g.initial,quiet=0,maxQuiet=0,firstScore=null;const seen=new Map(),rng=seeded(g.seed);
 // Full decision replay on one seed for all boards/policies/assignments. Remaining
 // games replay all transitions; CPU-budget censoring itself is not deterministic.
 const recalc=g.seed===plan.seeds[0];
 for(let i=0;i<g.trace.length;i++){
  if(recalc){const r=researchDecision(s,{variant:g.policies[s.turn],rng,seen});assert.deepEqual(r.action,g.trace[i]);assert.deepEqual(r.stats,g.stats[i]);aiRecalculated++;}
  const c=referenceChildren(s).find(c=>actionID(c.a)===actionID(g.trace[i]));assert.ok(c);
  const gain=c.n.scores[s.turn]>s.scores[s.turn];if(gain){quiet=0;firstScore??={actor:s.turn,ply:c.n.ply};}else quiet++;
  maxQuiet=Math.max(maxQuiet,quiet);
  if(!partial&&g.candidate==='control'&&g.seed===plan.seeds.at(-1)&&g.starter===0&&!g.swap&&g.policies[0]===g.policies[1]&&[0,Math.floor(g.trace.length/2),g.trace.length-1].includes(i)){
   holdout.push({mode:g.mode,variant:g.policies[0],source:{id:g.id,ply:i},...auditPosition(s,{seed:620003+i,seen:new Map(seen)})});
  }
  s=c.n;seen.set(key(s),(seen.get(key(s))||0)+1);transitions++;
 }
 assert.deepEqual(s,g.state);if(s.winner!==null){const physical=b.board.players.indexOf(g.initial.players[s.winner]);assert.equal(physical,g.swap?1-s.winner:s.winner);physicalWinners.set(g.id,physical);}
 assert.equal(g.maxQuiet,maxQuiet);assert.deepEqual(g.firstScore,firstScore);assert.equal(g.stats.length,g.trace.length);assert.equal(g.timings.length,g.trace.length);
 assert.equal(g.reason,g.state.winner!==null?'winner':g.trace.length===plan.maxPlies?'ply-cap':'cpu-cap');
 if(++verifiedGames%64===0)console.log('verified',verifiedGames,'/',games.length,'transitions',transitions,'AI decisions',aiRecalculated);
}
const quant=(xs,p)=>xs.length?[...xs].sort((a,b)=>a-b)[Math.min(xs.length-1,Math.floor((xs.length-1)*p))]:null;
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
function metrics(gs){const decided=gs.filter(g=>g.state.winner!==null),lens=gs.map(g=>g.trace.length),dl=decided.map(g=>g.trace.length),think=gs.flatMap(g=>g.timings.map(t=>t.cpu));return {games:gs.length,uniqueTraces:new Set(gs.map(g=>JSON.stringify([g.initial,g.trace]))).size,uniqueCompletedTraces:new Set(decided.map(g=>JSON.stringify([g.initial,g.trace]))).size,first:decided.filter(g=>g.state.winner===g.starter).length,second:decided.filter(g=>g.state.winner!==g.starter).length,unresolved:gs.length-decided.length,positionWins:[0,1].map(p=>decided.filter(g=>physicalWinners.get(g.id)===p).length),settlement:decided.length/gs.length,firstScoreStarter:gs.filter(g=>g.firstScore?.actor===g.starter).length,noScore:gs.filter(g=>!g.firstScore).length,allPlies:{mean:mean(lens),median:quant(lens,.5),p90:quant(lens,.9)},decidedPlies:{mean:mean(dl),median:quant(dl,.5),p90:quant(dl,.9)},quiet:{mean:mean(gs.map(g=>g.maxQuiet)),max:Math.max(...gs.map(g=>g.maxQuiet))},thinkCpuMs:{mean:mean(think),p90:quant(think,.9),max:Math.max(...think)},generated:gs.reduce((n,g)=>n+g.stats.reduce((n,s)=>n+s.generated,0),0),evaluated:gs.reduce((n,g)=>n+g.stats.reduce((n,s)=>n+s.evaluated,0),0),routeQueries:gs.reduce((n,g)=>n+g.stats.reduce((n,s)=>n+s.routeQueries,0),0),cpuCap:gs.filter(g=>g.reason==='cpu-cap').length};}
const groups=new Map();for(const g of games){const k=JSON.stringify([g.mode,g.candidate,g.policies]);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(g);}
const rows=[...groups].map(([k,gs])=>({condition:JSON.parse(k),...metrics(gs)}));
function bootstrap(xs){if(!xs.length)return null;const rng=seeded(625003),bs=Array.from({length:4000},()=>mean(xs.map(()=>xs[Math.floor(rng()*xs.length)]))).sort((a,b)=>a-b);return [bs[100],bs[3899]];}
const mixed=[];
for(const b of plan.boards)for(const variant of ['defense','path','combined']){
 const gs=games.filter(g=>g.mode===b.mode&&g.candidate===b.name&&g.policies.includes(variant)&&g.policies.includes('control')&&g.policies[0]!==g.policies[1]);if(!gs.length)continue;
 const wins=gs.filter(g=>g.state.winner!==null&&g.policies[g.state.winner]===variant).length,losses=gs.filter(g=>g.state.winner!==null&&g.policies[g.state.winner]==='control').length;
 const blocks=plan.seeds.map(seed=>{const xs=gs.filter(g=>g.seed===seed);return mean(xs.map(g=>g.state.winner===null?0:g.policies[g.state.winner]===variant?1:-1));}).filter(v=>v!==null);
 const self=games.filter(g=>g.mode===b.mode&&g.candidate===b.name&&g.policies.every(p=>p===variant)),control=games.filter(g=>g.mode===b.mode&&g.candidate===b.name&&g.policies.every(p=>p==='control'));
 const settlementDiff=plan.seeds.map(seed=>{const a=self.filter(g=>g.seed===seed),c=control.filter(g=>g.seed===seed);return a.length&&c.length?metrics(a).settlement-metrics(c).settlement:null;}).filter(v=>v!==null);
 mixed.push({mode:b.mode,candidate:b.name,variant,games:gs.length,wins,losses,unresolved:gs.length-wins-losses,seedBlocks:blocks.length,winMinusLossPerGame:mean(blocks),exploratorySeedBootstrap95:bootstrap(blocks),selfSettlementDifference:mean(settlementDiff),selfSettlementBootstrap95:bootstrap(settlementDiff),adopt:false});
}
const reachability=[];const archived=JSON.parse(gunzipSync(readFileSync('reports/defense-path-2026-10-26/positions.json.gz'))).cases;
for(const mode of 'ABCDE'){
 let targets=0,staticDistanceMisses=0,states=0;
 for(const c of archived.filter(c=>c.mode===mode)){for(const p of [0,1]){const cs=referenceChildren({...c.state,turn:p}),reachable=[...new Set(cs.filter(x=>x.n.scores[p]>c.state.scores[p]).map(x=>x.n.players[p]))],dist=distances(c.state,p);targets+=reachable.length;staticDistanceMisses+=reachable.filter(star=>dist[star]!==1).length;states++;}}
 reachability.push({mode,actorPositions:states,legalNextTurnScoreTargets:targets,missedByFixedWallDistanceOne:staticDistanceMisses,meaning:'geometry reachability only; not a guaranteed score against intervening opponent'});
}
const holdoutSummary=[...'ABCDE'].map(mode=>({mode,positions:holdout.filter(c=>c.mode===mode).length,byVariant:Object.fromEntries(['control','defense','path','combined'].map(v=>{const cs=holdout.filter(c=>c.mode===mode),winOpp=cs.filter(c=>c.safeWin&&c.hasWinRisk),scoreOpp=cs.filter(c=>c.safeScore&&c.hasScoreRisk);return [v,{positions:cs.length,immediateWinDefenseSuccessRate:winOpp.length?winOpp.filter(c=>!c.selected[v].classification.allowsWin).length/winOpp.length:null,immediateScoreDefenseSuccessRate:scoreOpp.length?scoreOpp.filter(c=>!c.selected[v].classification.allowsScore).length/scoreOpp.length:null,winDefenseOpportunities:cs.filter(c=>c.safeWin&&c.hasWinRisk).length,scoreDefenseOpportunities:cs.filter(c=>c.safeScore&&c.hasScoreRisk).length,avoidableLoss:cs.filter(c=>c.safeWin&&c.hasWinRisk&&c.selected[v].classification.allowsWin).length,avoidableScore:cs.filter(c=>c.safeScore&&c.hasScoreRisk&&c.selected[v].classification.allowsScore).length}];}))}));
writeFileSync(dir+(partial?'/partial-summary.json':'/summary.json'),JSON.stringify({complete:games.length===plan.games,games:games.length,extensions:0,forks:0,transitions,aiRecalculated,rows,mixed,reachability,holdoutSummary,limits:[`${plan.seeds.length} seed blocks; games within a block are dependent; percentile bootstrap may be degenerate`,'Paired actor/position swaps are clustered by seed','1500ms soft process CPU budget per game and 256-ply censoring; unresolved are not draws','Generation and reference verification are separate; shared-host timing is descriptive','No best-play fairness proof, human-fun assessment or production adoption']},null,2));
if(!partial)writeFileSync(dir+'/holdout-positions.json.gz',gzipSync(JSON.stringify(holdout)),{flush:true});
console.log({games:games.length,transitions,aiRecalculated,mixed});
