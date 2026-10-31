// Exact one-opponent-turn analysis of saved pilot positions. No claim of optimal play.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {initial,apply,successors,key} from '../src/engine.js';
const dir='reports/strategy-followup-2026-10-31';
const records=fs.readFileSync(`${dir}/games.jsonl`,'utf8').trim().split('\n').map(JSON.parse);
const cases=[]; let positions=0;
for(const g of records.filter(g=>g.id==='trial-9x9-9-star-win4' && g.policy==='greedy/greedy')){
 let s=initial(11,g.starter);
 for(const played of g.moves){
   if(s.winner!==null) break;
   const p=s.turn, opp=1-p;
   const threat=successors({...s,turn:opp}).filter(x=>x.n.scores[opp]>s.scores[opp]);
   if(threat.length){
     positions++;
     const children=successors(s), scored=children.filter(x=>x.n.scores[p]>s.scores[p]);
     const non=children.filter(x=>x.n.scores[p]===s.scores[p]);
     if(scored.length && non.length){
       const allows = x => x.n.winner===p ? [] : successors(x.n).filter(r=>r.n.scores[opp]>s.scores[opp]);
       const risk=scored.map(x=>({x,replies:allows(x)})).find(z=>z.replies.length);
       const block=non.find(x=>allows(x).length===0);
       if(risk && block){
         const replies=successors(block.n);
         assert.equal(replies.filter(r=>r.n.scores[opp]>s.scores[opp]).length,0);
         assert.equal(key(apply(s,block.a)),key(block.n));
         assert.equal(key(apply(s,risk.x.a)),key(risk.x.n));
         cases.push({seed:g.seed,starter:g.starter,ply:s.ply,initial:initial(11,g.starter),history:g.moves.slice(0,s.ply),state:s,threatCount:threat.length,immediateScores:scored.length,nonScoringActions:non.length,score:{action:risk.x.a,result:risk.x.n,opponentScoringReply:risk.replies[0].a,opponentReplyResult:risk.replies[0].n},block:{action:block.a,result:block.n,opponentReplies:replies.length,opponentScoringReplies:0}});
         break;
       }
     }
   }
   s=apply(s,played);
 }
 if(cases.length>=3)break;
}
fs.writeFileSync(`${dir}/tactics.json`,JSON.stringify({positionsExamined:positions,cases},null,2)+'\n');
console.log(JSON.stringify({positionsExamined:positions,cases:cases.map(({seed,starter,ply,state,threatCount,immediateScores,score,block})=>({seed,starter,ply,players:state.players,scores:state.scores,stars:state.stars,walls:state.walls,threatCount,immediateScores,score:score.action,reply:score.opponentScoringReply,block:block.action,replyCount:block.opponentReplies}))},null,2));
