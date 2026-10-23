// Independent, frozen holdout for D candidate 1 versus the original D board.
// This file does not change production boards or CPU policies.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {RESEARCH_LAYOUTS} from '../src/research-layouts.js';
import {toBoardState} from '../src/geometry.js';
import {validateBoard,recordBoard} from '../src/board-lab.js';
import {researchPlans,newResearchGame,advanceResearch} from './stall-research.js';
const dir=process.env.FAIRNESS_DIAG_REPORT??'reports/fairness-diagnostics';
const selected=JSON.parse(readFileSync(dir+'/BD-candidates.json')).modes.find(m=>m.id==='D').topCandidates[0];
if(!selected)throw Error('D candidate missing');
const original=toBoardState(RESEARCH_LAYOUTS.find(x=>x.id==='D'));
const modified={...original,[selected.kind]:original[selected.kind].map(x=>x===selected.from?selected.to:x)};
const seeds=[260101,260111,260129,260147,260167,260179,260191,260209];
const results={version:1,stage:'independent-holdout',seeds,timeBudgetMs:750,maxPlies:2048,comparison:[],warning:'Holdout is limited to one AI pairing; do not promote without further independent policy and human testing.'};
for(const [label,board] of [['original',original],['candidate-1',modified]]){
 const v=validateBoard(board);if(!v.ok)throw Error(label+': '+v.errors.join(','));
 const record=recordBoard(v.state,{id:'D-holdout-'+label,name:label});
 const plans=researchPlans(record,{stage:'fairness-independent-holdout',seeds,pairs:[['search','route']]});
 const games=plans.map(p=>advanceResearch(newResearchGame(p),{timeBudgetMs:results.timeBudgetMs,maxPlies:results.maxPlies,memoryBudgetMb:640}));
 const settled=games.filter(g=>g.state.winner!==null);
 results.comparison.push({label,change:label==='candidate-1'?selected:null,total:games.length,settled:settled.length,unresolved:games.length-settled.length,firstWins:settled.filter(g=>g.state.winner===g.starter).length,secondWins:settled.filter(g=>g.state.winner!==g.starter).length});
}
mkdirSync(dir,{recursive:true});writeFileSync(dir+'/D-holdout.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results.comparison,null,2));
