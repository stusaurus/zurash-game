import fs from 'node:fs';import {initial,apply,actions,key} from '../src/engine.js';import {CANDIDATES} from './standard-candidate-layouts.js';
const files=process.argv.slice(2),cases={};const legal=(s,a)=>actions(s).some(x=>JSON.stringify(x)===JSON.stringify(a));
for(const file of files)for(const line of fs.readFileSync(file,'utf8').trim().split('\n')){
 const g=JSON.parse(line);if(cases[g.id])continue;const board=CANDIDATES.find(x=>x.id===g.id);if(!board)continue;
 let s=initial({...board,players:g.swap?[...board.players].reverse():board.players},g.starter),states=[];
 for(let t=0;t<g.moves.length;t++){
  const a=g.moves[t],n=apply(s,a);states.push(s);
  if(t>=2&&n.scores[s.turn]>s.scores[s.turn]){
   const old=g.moves[t-2],reply=g.moves[t-1],before=states[t-2],skip={wall:null,dir:old.dir};
   if(old.wall&&legal(before,skip)){
    const skipped=apply(before,skip),actual=states[t-1];
    if(JSON.stringify(skipped.players)===JSON.stringify(actual.players)&&JSON.stringify(skipped.scores)===JSON.stringify(actual.scores)&&legal(skipped,reply)){
     const altered=apply(skipped,reply);
     if(altered.winner===null&&legal(altered,a)){const result=apply(altered,a);if(result.scores[s.turn]===altered.scores[s.turn] && JSON.stringify(altered.players)===JSON.stringify(s.players)){
      cases[g.id]={seed:g.seed,policy:g.policy,starter:g.starter,swap:g.swap,ply:t,priorMove:old,alternative:skip,opponentMove:reply,scoringMove:a,priorState:before,state:s,actualResult:n,counterfactualState:altered,counterfactualResult:result,history:g.moves.slice(0,t+1),note:'All alternate moves legal. Opponent follows the same reply in both branches; no claim that an adversary must cooperate or that this wins.'};break;
     }}
    }
   }
  }
  s=n;
 }
}
fs.writeFileSync('/tmp/zurash-causal.json',JSON.stringify(cases,null,2)+'\n');console.log(Object.fromEntries(Object.entries(cases).map(([k,v])=>[k,{seed:v.seed,ply:v.ply,prior:v.priorMove,opponent:v.opponentMove,score:v.scoringMove}])));
