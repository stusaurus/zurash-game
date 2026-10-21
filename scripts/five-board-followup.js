import fs from 'node:fs';
import {gunzipSync, gzipSync} from 'node:zlib';
import {advanceGame, newGame, verifyGame} from './tactics-completion.js';
import {completionSummary} from './tactics-completion-statistics.js';

// Preserve the first study; continue every training game with its original AI/RNG.
const source='reports/five-board', out='reports/five-board-followup-2026-10-22';
fs.mkdirSync(out,{recursive:true});
const readLines=name=>{
  const path=`${source}/${name}.jsonl`;
  return (fs.existsSync(path)?fs.readFileSync(path,'utf8'):gunzipSync(fs.readFileSync(path+'.gz')).toString()).trim().split('\n').map(JSON.parse);
};
const selected=JSON.parse(fs.readFileSync(`${source}/selected.json`));
const rankings=JSON.parse(fs.readFileSync(`${source}/refinement-ranking.json`));
const training=readLines('refinement'), trainFd=fs.openSync(`${out}/training.jsonl`,'w');
const continued=[];
for(const original of training){
  const g=original.state.winner===null?advanceGame(original,{maxPlies:4096,timeBudgetMs:4000,memoryBudgetMb:512}):original;
  verifyGame(g);
  if(JSON.stringify(original.history)!==JSON.stringify(g.history.slice(0,original.history.length)))throw Error('Continuation prefix mismatch');
  fs.writeSync(trainFd,JSON.stringify(g)+'\n');continued.push(g);
  if(continued.length%20===0)console.log('training',continued.length,'/',training.length);
}
fs.closeSync(trainFd);
function counts(gs){
 const first=gs.filter(g=>g.state.winner===g.starter).length,second=gs.filter(g=>g.state.winner===1-g.starter).length;
 return {n:gs.length,first,second,unresolved:gs.length-first-second};
}
const plan=[];
for(const group of rankings){
 const candidates=group.ranking.map(r=>{
   const gs=continued.filter(g=>g.id.startsWith(`${group.id}-${r.candidate.seed}-`));
   const c=counts(gs);
   return {...r.candidate,training:c,imbalance:Math.abs(c.first-c.second)};
 });
 // Keep non-dominated tradeoffs; no single weighted score declares a winner.
 const frontier=candidates.filter(c=>!candidates.some(d=>d!==c&&d.training.unresolved<=c.training.unresolved&&d.imbalance<=c.imbalance&&(d.training.unresolved<c.training.unresolved||d.imbalance<c.imbalance)));
 const current=selected.find(c=>c.id===group.id);
 const alternatives=frontier.filter(c=>c.seed!==current.seed).sort((a,b)=>a.imbalance-b.imbalance||a.training.unresolved-b.training.unresolved||a.seed-b.seed);
 // If the frontier only contains the current board, still independently test
 // the least imbalanced alternative; do not conclude the current board is fair.
 if(!alternatives.length)alternatives.push(...candidates.filter(c=>c.seed!==current.seed).sort((a,b)=>a.imbalance-b.imbalance||a.training.unresolved-b.training.unresolved));
 const finalist=alternatives[0];
 plan.push({id:group.id,current,alternative:finalist,frontier:frontier.map(c=>c.seed),candidates});
}
fs.writeFileSync(`${out}/plan.json`,JSON.stringify({seedSeparation:{training:60001,independent:[71001,71002,71003]},timeBudgetMs:6000,maxPlies:4096,plan},null,2));
const holdoutFd=fs.openSync(`${out}/independent.jsonl`,'w');
const rows=[];
for(const p of plan){
 for(const candidate of [p.current,p.alternative])for(const seed of [71001,71002,71003])for(const policies of [['search','search'],['mixed','mixed'],['route','route']])for(const starter of [0,1]){
  let g=newGame(candidate.state,{starter,seed,policies,id:`${p.id}-${candidate.seed}-independent-${policies[0]}-${seed}-${starter}`});
  g=advanceGame(g,{maxPlies:4096,timeBudgetMs:6000,memoryBudgetMb:512});verifyGame(g);
  fs.writeSync(holdoutFd,JSON.stringify(g)+'\n');rows.push(g);
 }
 console.log(p.id,'independent complete');
}
fs.closeSync(holdoutFd);
const summarize=gs=>completionSummary(gs.map(g=>({...g,cluster:`${g.policies.join('/')}:${g.seed}`})));
const summaries=plan.map(p=>({id:p.id,currentSeed:p.current.seed,alternativeSeed:p.alternative.seed,boards:[p.current,p.alternative].map(c=>({seed:c.seed,spec:{size:c.state.size,stars:c.state.stars.length,walls:c.state.walls.length,target:c.state.target},all:summarize(rows.filter(g=>g.id.startsWith(`${p.id}-${c.seed}-`))),byPolicy:Object.fromEntries(['search','mixed','route'].map(policy=>[policy,summarize(rows.filter(g=>g.id.startsWith(`${p.id}-${c.seed}-`)&&g.policies[0]===policy))]))}))}));
fs.writeFileSync(`${out}/summary.json`,JSON.stringify({trainingGames:training.length,independentGames:rows.length,summaries,decision:'Research only; no automatic fixture replacement or fairness certification.'},null,2));
for(const name of ['training','independent'])fs.writeFileSync(`${out}/${name}.jsonl.gz`,gzipSync(fs.readFileSync(`${out}/${name}.jsonl`),{mtime:0}));
console.log('complete',rows.length);
