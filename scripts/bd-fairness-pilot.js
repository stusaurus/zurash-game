// Research-only paired games for the unchanged B/D boards and one-edit candidates.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {RESEARCH_LAYOUTS} from '../src/research-layouts.js';
import {toBoardState} from '../src/geometry.js';
import {validateBoard,recordBoard} from '../src/board-lab.js';
import {researchPlans,newResearchGame,advanceResearch,aggregateResearch} from './stall-research.js';
const dir=process.env.FAIRNESS_DIAG_REPORT??'reports/fairness-diagnostics';
const input=JSON.parse(readFileSync(dir+'/BD-candidates.json'));
const results={version:1,design:'frozen paired seeds; both starters, slots and AI assignments',timeBudgetMs:100,maxPlies:240,modes:[]};
for(const mode of input.modes){
 const raw=RESEARCH_LAYOUTS.find(x=>x.id===mode.id),original=toBoardState(raw),chosen=mode.topCandidates.slice(0,2);
 const records=[{label:'original',board:original},...chosen.map((c,i)=>({label:'candidate-'+(i+1),board:{...original,[c.kind]:original[c.kind].map(x=>x===c.from?c.to:x)},change:c}))];
 const modeOut={id:mode.id,records:[]};
 for(const item of records){
  const v=validateBoard(item.board);if(!v.ok)throw Error(mode.id+' '+item.label+' invalid '+v.errors);
  const record=recordBoard(v.state,{id:'fairness-'+mode.id+'-'+item.label,name:item.label});
  const plans=researchPlans(record,{stage:'fairness-paired-pilot',seeds:[160001,160019],pairs:[['search','route']]});
  const games=plans.map(p=>advanceResearch(newResearchGame(p),{timeBudgetMs:results.timeBudgetMs,maxPlies:results.maxPlies,memoryBudgetMb:640}));
  const settled=games.filter(g=>g.state.winner!==null);
  modeOut.records.push({label:item.label,change:item.change??null,total:games.length,settled:settled.length,unresolved:games.length-settled.length,firstWins:settled.filter(g=>g.state.winner===g.starter).length,secondWins:settled.filter(g=>g.state.winner!==g.starter).length,summary:aggregateResearch(games)});
 }
 results.modes.push(modeOut);
}
mkdirSync(dir,{recursive:true});writeFileSync(dir+'/BD-paired-pilot.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results.modes.map(x=>({id:x.id,records:x.records.map(y=>({label:y.label,total:y.total,settled:y.settled,firstWins:y.firstWins,secondWins:y.secondWins,unresolved:y.unresolved}))})),null,2));
