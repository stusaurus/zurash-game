// Research-only B fairness sensitivity to AI policy pairing.
import {writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {RESEARCH_LAYOUTS} from '../src/research-layouts.js';
import {toBoardState} from '../src/geometry.js';
import {validateBoard,recordBoard} from '../src/board-lab.js';
import {researchPlans,newResearchGame,advanceResearch} from './stall-research.js';
import {verifyGame} from './tactics-completion.js';
const dir=process.env.FAIRNESS_DIAG_REPORT??'reports/fairness-diagnostics';
const seeds=[460101,460117,460133,460151];
const pairs=[['star','route'],['search','search'],['route','route']];
const v=validateBoard(toBoardState(RESEARCH_LAYOUTS.find(x=>x.id==='B')));
if(!v.ok)throw Error(v.errors.join(','));
const record=recordBoard(v.state,{id:'B-policy-sensitivity',name:'B original'});
const rows=[];
const fingerprint=actions=>createHash('sha256').update(JSON.stringify(actions)).digest('hex');
const allGames=[];
for(const pair of pairs){
 const plans=researchPlans(record,{stage:'B-policy-sensitivity',seeds,pairs:[pair]});
 const games=plans.map(p=>{let g=advanceResearch(newResearchGame(p),{timeBudgetMs:750,maxPlies:2048,memoryBudgetMb:640});if(g.reason==='budget-time'&&g.state.winner===null)g=advanceResearch(g,{timeBudgetMs:3000,maxPlies:2048,memoryBudgetMb:640});verifyGame(g);return g;});
 allGames.push(...games.map(g=>({g,pair})));
 const settled=games.filter(g=>g.state.winner!==null);
 rows.push({policies:pair,total:games.length,settled:settled.length,unresolved:games.length-settled.length,firstWins:settled.filter(g=>g.state.winner===g.starter).length,secondWins:settled.filter(g=>g.state.winner!==g.starter).length,medianPlies:[...games.map(g=>g.history.length)].sort((a,b)=>a-b)[Math.floor(games.length/2)]});
}
const signatures=allGames.map(({g,pair})=>({policies:pair,starter:g.starter,initial:JSON.stringify(g.initial),full:fingerprint(g.history.map(h=>h.a)),first5:fingerprint(g.history.slice(0,5).map(h=>h.a)),first10:fingerprint(g.history.slice(0,10).map(h=>h.a)),winner:g.state.winner,settled:g.state.winner!==null}));
const counts=(field)=>{const m=new Map();for(const x of signatures){const k=x.initial+'|'+x[field];m.set(k,(m.get(k)??0)+1);}return {unique:m.size,duplicates:signatures.length-m.size,maxMultiplicity:Math.max(...m.values()),multiplicities:[...m.values()].sort((a,b)=>b-a).slice(0,10)};};
const uniqueOutcomes=rows.map(r=>{
 const subset=signatures.filter(x=>JSON.stringify(x.policies)===JSON.stringify(r.policies)&&x.settled);
 const unique=[...new Map(subset.map(x=>[x.initial+'|'+x.full,x])).values()];
 return {policies:r.policies,settledTrajectories:subset.length,uniqueSettledTrajectories:unique.length,firstWins:unique.filter(x=>x.winner===x.starter).length,secondWins:unique.filter(x=>x.winner!==x.starter).length};
});
const diversity={uniqueOutcomes,total:signatures.length,full:counts('full'),first5:counts('first5'),first10:counts('first10'),byPolicy:rows.map(r=>{const subset=signatures.filter(x=>JSON.stringify(x.policies)===JSON.stringify(r.policies));const unique=new Set(subset.map(x=>x.initial+'|'+x.full));return {policies:r.policies,total:subset.length,uniqueFull:unique.size};}),note:'Same initial state and identical action sequence count as repeated trajectories. Unique-outcome win rates are descriptive, not unbiased estimates. Time-censored outcomes must not count as losses. Opening fingerprints only indicate shared prefixes.'};
const report={version:3,mode:'B',stage:'policy-sensitivity',seeds,rows,diversity,warning:'Exploratory AI policies and small samples; not an independent fairness proof.'};
mkdirSync(dir,{recursive:true});writeFileSync(dir+'/B-policy-sensitivity.json',JSON.stringify(report,null,2)+'\n');console.log('B_POLICY_SENSITIVITY '+JSON.stringify(rows));console.log('B_TRAJECTORY_DIVERSITY '+JSON.stringify(diversity));
