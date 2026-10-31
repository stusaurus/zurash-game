import fs from 'node:fs';
import {apply,successors,key} from '../src/engine.js';
import {evaluate} from '../src/ai.js';
const path='reports/strategy-followup-2026-10-31/tactics.json';
const c=JSON.parse(fs.readFileSync(path,'utf8')).cases[0],s=c.state,p=s.turn,q=1-p;
const branches={};
for(const type of ['score','block']){
 const n=apply(s,c[type].action), replies=successors(n).map(r=>{
   const scored=r.n.scores[q]>n.scores[q];
   if(r.n.winner!==null)return {a:r.a,score:scored,value:evaluate(r.n,p),response:null,ownScoring:0};
   const own=successors(r.n).map(x=>({...x,v:evaluate(x.n,p)})).sort((a,b)=>b.v-a.v);
   return {a:r.a,score:scored,value:own[0]?.v??evaluate(r.n,p),response:own[0]?.a??null,ownScoring:own.filter(x=>x.n.scores[p]>r.n.scores[p]).length};
 }).sort((a,b)=>a.value-b.value);
 branches[type]={action:c[type].action,score:n.scores,replyCount:replies.length,scoringReplies:replies.filter(x=>x.score).length,allRepliesPermitImmediateOwnScore:replies.every(x=>x.ownScoring>0),minOwnScoringReplies:Math.min(...replies.map(x=>x.ownScoring)),adversarialHeuristicReply:replies[0],allReplies:replies};
}
fs.writeFileSync('/tmp/zurash-branches.json',JSON.stringify({source: 'strategy-followup first case',note:'All opponent replies and own replies enumerated, but heuristic evaluation at ply 3 is not a proof of game-theoretic advantage.',state:s,branches},null,2)+'\n');
for(const [type,b] of Object.entries(branches))console.log(JSON.stringify({type,action:b.action,score:b.score,replyCount:b.replyCount,scoringReplies:b.scoringReplies,allRepliesPermitImmediateOwnScore:b.allRepliesPermitImmediateOwnScore,worst:b.adversarialHeuristicReply}));
