import fs from 'node:fs';
import {newGame,advanceGame,verifyGame} from './tactics-completion.js';
const dir='reports/five-board',proposals=JSON.parse(fs.readFileSync(dir+'/proposals.json')).proposals,current=JSON.parse(fs.readFileSync(dir+'/selected.json'));
const fd=fs.openSync(dir+'/refinement.jsonl','w'),rankings=[];
for(const c of current){
 const candidates=[c,...['rotation','mirror','central','dispersed','corridor','perturbed'].map(f=>proposals.filter(p=>p.id===c.id&&p.family===f&&p.seed!==c.seed).sort((a,b)=>a.diagnostics.distanceGap-b.diagnostics.distanceGap)[0]).filter(Boolean)];const scores=[];
 for(const candidate of candidates){const gs=[];for(const policies of [['search','search'],['mixed','mixed']])for(const starter of [0,1]){
  let g=newGame(candidate.state,{starter,policies,seed:60001,id:`${c.id}-${candidate.seed}-refinement-${policies[0]}-${starter}`});g=advanceGame(g,{maxPlies:1024,timeBudgetMs:1000,memoryBudgetMb:512});verifyGame(g);fs.writeSync(fd,JSON.stringify(g)+'\n');gs.push(g);
 }
 const first=gs.filter(g=>g.state.winner===g.starter).length,second=gs.filter(g=>g.state.winner===1-g.starter).length,u=gs.length-first-second;
 scores.push({candidate,first,second,unresolved:u,screeningLoss:u*4+Math.abs(first-second)});
 }
 scores.sort((a,b)=>a.screeningLoss-b.screeningLoss);rankings.push({id:c.id,ranking:scores,status:'Training screen only. No automatic replacement or fairness certification. Requires fresh independent validation.'});console.log(c.id,'refined',scores.length);
}
fs.closeSync(fd);fs.writeFileSync(dir+'/refinement-ranking.json',JSON.stringify(rankings,null,2));
