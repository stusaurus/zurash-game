// Research-only B fairness sensitivity to AI policy pairing.
import {writeFileSync,mkdirSync} from 'node:fs';
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
for(const pair of pairs){
 const plans=researchPlans(record,{stage:'B-policy-sensitivity',seeds,pairs:[pair]});
 const games=plans.map(p=>{let g=advanceResearch(newResearchGame(p),{timeBudgetMs:750,maxPlies:2048,memoryBudgetMb:640});if(g.reason==='budget-time'&&g.state.winner===null)g=advanceResearch(g,{timeBudgetMs:3000,maxPlies:2048,memoryBudgetMb:640});verifyGame(g);return g;});
 const settled=games.filter(g=>g.state.winner!==null);
 rows.push({policies:pair,total:games.length,settled:settled.length,unresolved:games.length-settled.length,firstWins:settled.filter(g=>g.state.winner===g.starter).length,secondWins:settled.filter(g=>g.state.winner!==g.starter).length,medianPlies:[...games.map(g=>g.history.length)].sort((a,b)=>a-b)[Math.floor(games.length/2)]});
}
const report={version:1,mode:'B',stage:'policy-sensitivity',seeds,rows,warning:'Exploratory AI policies and small samples; not an independent fairness proof.'};
mkdirSync(dir,{recursive:true});writeFileSync(dir+'/B-policy-sensitivity.json',JSON.stringify(report,null,2)+'\n');console.log('B_POLICY_SENSITIVITY '+JSON.stringify(rows));
