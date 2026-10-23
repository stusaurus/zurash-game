// Reachable tactical forks, exhaustively certified to two plies by independent rules.
import fs from 'node:fs';
import {choose,seeded} from '../src/ai.js';
import {successors,apply} from '../src/engine.js';
import {CANDIDATES,makeCandidate} from './tactics-candidates.js';
import {oracleChildren} from '../tests/tactics-oracle.js';
const examples=[],started=Date.now();
outer:for(const c of CANDIDATES)for(let seed=10000;seed<10010;seed++){
 let s;try{s=makeCandidate(c,seed);}catch{continue;}
 const rng=seeded(seed),history=[];
 for(let ply=0;ply<120&&s.winner===null;ply++){
  if(Date.now()-started>45000)break outer;
  if(s.scores[1-s.turn]===s.target-1){
   const moves=oracleChildren(s).map(({a,n})=>{
    const reply=n.winner===null?oracleChildren(n).find(({n:nn})=>nn.winner===1-s.turn):null;
    return {action:a,scored:n.scores[s.turn]>s.scores[s.turn],winning:n.winner===s.turn,losesNext:!!reply,opponentWinningReply:reply?.a??null};
   });
   const bad=moves.find(m=>m.losesNext),safe=moves.find(m=>!m.losesNext&&!m.winning);
   if(bad&&safe&&!examples.some(e=>e.size===c.size)){
    examples.push({size:c.size,seed,state:s,history,legalMoves:moves.length,unsafeMoves:moves.filter(m=>m.losesNext).length,safeMoves:moves.filter(m=>!m.losesNext).length,bad,safe,scope:'Bad action permits a legal immediate opponent win; safe action prevents ALL immediate wins, not a guarantee of winning later.'});
    break;
   }
  }
  const a=choose(s,{level:'greedy',rng});if(!a)break;
  history.push(a);s=apply(s,a);
 }
 if(examples.length===3)break outer;
}
for(const e of examples){let s=makeCandidate(CANDIDATES.find(c=>c.size===e.size),e.seed);for(const a of e.history)s=apply(s,a);if(JSON.stringify(s)!==JSON.stringify(e.state))throw Error('Replay mismatch');if(successors(s).length!==e.legalMoves)throw Error('Independent legal move mismatch');}
fs.writeFileSync('reports/tactics-strategy-witnesses.json',JSON.stringify({elapsedMs:Date.now()-started,examples},null,2)+'\n');
console.log(examples.map(({size,state,legalMoves,unsafeMoves,safeMoves,bad,safe})=>({size,ply:state.ply,legalMoves,unsafeMoves,safeMoves,bad,safe})));
