// Re-open saved games without discarding their prefix. Policy switches are counterfactuals only.
import fs from 'node:fs';import zlib from 'node:zlib';import readline from 'node:readline';
import {advanceGame,verifyGame} from './tactics-completion.js';import {completionSummary,loadCompletionSummary} from './tactics-completion-statistics.js';
import {prove} from './tactics-proof.js';import {successors,apply} from '../src/engine.js';
const prefix=process.argv[2]??'reports/tactics-completion';
const games=[];
for await(const line of readline.createInterface({input:fs.createReadStream(prefix+'-games.jsonl.gz').pipe(zlib.createGunzip()),crlfDelay:Infinity})){if(line)games.push(JSON.parse(line));}
const study=loadCompletionSummary(prefix);
const budgetMs=Math.min(90000,Math.max(0,720000-study.elapsedMs));
const aggregateOnly=process.argv.includes('--aggregate-only');
const previous=aggregateOnly?JSON.parse(fs.readFileSync(prefix+'-final-summary.json')):null;
if(games.length!==study.recordedGames||new Set(games.map(g=>g.id)).size!==games.length)throw Error('Raw archive/summary count mismatch');
const started=Date.now(),rows=aggregateOnly?zlib.gunzipSync(fs.readFileSync(prefix+'-followup.jsonl.gz')).toString().trim().split('\n').filter(Boolean).map(JSON.parse):[],selected=[];
// Stratify by candidate; prefer unfinished search self-play, including repeated games.
for(const size of [8,9,10]){
 const candidates=games.filter(g=>g.size===size&&g.reason!=='win'&&g.reason.startsWith('budget-')&&g.history.length).sort((a,b)=>Number(b.matchup==='search/search')-Number(a.matchup==='search/search')||b.repetitionCount-a.repetitionCount);
 selected.push(...candidates.slice(0,6));
}
for(const g of aggregateOnly?[]:selected){
 if(Date.now()-started>=budgetMs)break;
 let s=g.initial,opponentCaptureDenials=0,opponentWinningThreats=0,stoppedImmediateDefeats=0,diagnosticTurns=0;
 // Inspect a deterministic, at most 16-turn tail; all legal replies, no heuristic certificates.
 for(let i=0;i<g.history.length;i++){
  const n=apply(s,g.history[i].a);
  if(i>=g.history.length-16&&s.winner===null&&n.winner===null){
   const hypothetical=successors({...s,turn:1-s.turn});
   const beforeCapture=hypothetical.some(c=>c.n.scores[1-s.turn]>s.scores[1-s.turn]);
   const beforeWin=hypothetical.some(c=>c.n.winner===1-s.turn);
   const replies=successors(n),afterCapture=replies.some(c=>c.n.scores[1-s.turn]>n.scores[1-s.turn]),afterWin=replies.some(c=>c.n.winner===1-s.turn);
   opponentCaptureDenials+=Number(beforeCapture&&!afterCapture);opponentWinningThreats+=Number(beforeWin);stoppedImmediateDefeats+=Number(beforeWin&&!afterWin);diagnosticTurns++;
  }
  s=n;
 }
 const proof=prove(g.state,{horizon:4,nodeBudget:20000,timeBudgetMs:100});
 const original=advanceGame(g,{maxPlies:16384,timeBudgetMs:1500,memoryBudgetMb:320});verifyGame(original);
 const switched=structuredClone(g);switched.policies=switched.policies.map(p=>p==='search'?'search-progress':p);
 let intervention=null;
 if(switched.policies.join('/')!==g.policies.join('/')&&Date.now()-started<budgetMs){intervention=advanceGame(switched,{maxPlies:16384,timeBudgetMs:1500,memoryBudgetMb:320});verifyGame(intervention);}
 rows.push({id:g.id,size:g.size,scenario:g.scenario,matchup:g.matchup,prefixPlies:g.state.ply,prefixReason:g.reason,prefixRepetitions:g.repetitionCount,diagnosticTurns,opponentCaptureDenials,opponentWinningThreats,stoppedImmediateDefeats,proof,original,intervention});
 console.log(JSON.stringify({id:g.id,oldPly:g.state.ply,newPly:original.state.ply,originalReason:original.reason,interventionReason:intervention?.reason}));
}
fs.writeFileSync(prefix+'-followup.jsonl.gz',zlib.gzipSync(rows.map(r=>JSON.stringify(r)).join('\n')+'\n'));
const replacements=new Map(rows.map(r=>[r.id,r.original]));
if(aggregateOnly&&fs.existsSync(prefix+'-extension.jsonl.gz'))for(const line of zlib.gunzipSync(fs.readFileSync(prefix+'-extension.jsonl.gz')).toString().trim().split('\n').filter(Boolean)){const g=JSON.parse(line);replacements.set(g.id,g);}
const updated=games.map(g=>({...g,...(replacements.get(g.id)??{}),cluster:g.cluster,size:g.size,scenario:g.scenario,matchup:g.matchup}));
const groups=[];
for(const scenario of ['varied','fixed'])for(const size of [8,9,10])for(const matchup of [...new Set(games.map(g=>g.matchup))]){const gs=updated.filter(g=>g.size===size&&g.scenario===scenario&&g.matchup===matchup);if(gs.length)groups.push({scenario,size,matchup,...completionSummary(gs)});}
const report={budgetMs,elapsedMs:previous?.elapsedMs??Date.now()-started,followed:rows.length,originalNewDecisions:rows.filter(r=>r.original.reason==='win').length,counterfactualDecisions:rows.filter(r=>r.intervention?.reason==='win').length,extension:aggregateOnly&&fs.existsSync(prefix+'-extension-summary.json')?JSON.parse(fs.readFileSync(prefix+'-extension-summary.json')):null,method:'Original-policy continuations replace only their own censored records. Policy-switch interventions are separate and NEVER pooled into fairness.',candidates:[8,9,10].map(size=>({size,...completionSummary(updated.filter(g=>g.size===size))})),groups,diagnostics:rows.map(({original,intervention,...r})=>({...r,originalReason:original.reason,originalPly:original.state.ply,interventionReason:intervention?.reason??null,interventionPly:intervention?.state.ply??null}))};
fs.writeFileSync(prefix+'-final-summary.json',JSON.stringify(report,null,2)+'\n');
