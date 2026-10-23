// Independent, research-only holdout for the unchanged B layout.
// Preserve paired seeds, starter, slot and policy swaps. Never promote automatically.
import {writeFileSync,mkdirSync} from 'node:fs';
import {RESEARCH_LAYOUTS} from '../src/research-layouts.js';
import {toBoardState} from '../src/geometry.js';
import {validateBoard,recordBoard} from '../src/board-lab.js';
import {researchPlans,newResearchGame,advanceResearch} from './stall-research.js';
import {verifyGame} from './tactics-completion.js';
const dir=process.env.FAIRNESS_DIAG_REPORT??'reports/fairness-diagnostics';
const seeds=[360101,360113,360127,360149,360163,360179,360191,360211];
const v=validateBoard(toBoardState(RESEARCH_LAYOUTS.find(x=>x.id==='B')));
if(!v.ok)throw Error('Invalid B: '+v.errors.join(','));
const record=recordBoard(v.state,{id:'B-independent-holdout',name:'B original'});
const plans=researchPlans(record,{stage:'B-independent-holdout',seeds,pairs:[['search','route']]});
const games=plans.map(p=>{let g=advanceResearch(newResearchGame(p),{timeBudgetMs:750,maxPlies:2048,memoryBudgetMb:640});if(g.reason==='budget-time'&&g.state.winner===null)g=advanceResearch(g,{timeBudgetMs:3000,maxPlies:2048,memoryBudgetMb:640});verifyGame(g);return g;});
const settled=games.filter(g=>g.state.winner!==null),unresolved=games.filter(g=>g.state.winner===null);
const firstWins=settled.filter(g=>g.state.winner===g.starter).length;
const reasons=Object.fromEntries([...new Set(games.map(g=>g.reason))].sort().map(reason=>[reason,games.filter(g=>g.reason===reason).length]));
const result={version:1,mode:'B',layout:'original',stage:'independent-holdout',seeds,policies:['search','route'],timeBudgetMs:[750,3000],maxPlies:2048,total:games.length,settled:settled.length,unresolved:unresolved.length,firstWins,secondWins:settled.length-firstWins,reasons,plies:{median:[...games.map(g=>g.history.length)].sort((a,b)=>a-b)[Math.floor(games.length/2)],max:Math.max(...games.map(g=>g.history.length))},warning:'Independent seeds but one AI pairing; no fairness proof and no production change.'};
mkdirSync(dir,{recursive:true});writeFileSync(dir+'/B-holdout.json',JSON.stringify(result,null,2)+'\n');console.log('B_HOLDOUT '+JSON.stringify(result));
