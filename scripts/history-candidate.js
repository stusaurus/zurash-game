// Research only. Separate history-specific advantage from uniform reply lookahead.
import {choose,evaluate} from '../src/ai.js';
import {successors,key} from '../src/engine.js';
import {learningContext,learningFeature} from '../src/learning.js';
export function featureWeights(model,s,cs){const counts=model?.contexts?.[learningContext(s)]??Array(16).fill(0), multiplicity=Array(16).fill(0);for(const c of cs)multiplicity[learningFeature(s,c.a,c.n)]++;return cs.map(c=>(1+counts[learningFeature(s,c.a,c.n)])/multiplicity[learningFeature(s,c.a,c.n)]);}
export function chooseHistory(s,{rng,seen=new Map(),opponentModel}={}){
 if(!opponentModel||opponentModel.samples<8)return choose(s,{level:'greedy',rng,seen});
 const p=s.turn,ranked=successors(s).map(c=>({...c,score:evaluate(c.n,p)-(seen.get(key(c.n))??0)*130,tie:rng()})).sort((a,b)=>b.score-a.score||a.tie-b.tie);
 if(!ranked.length)return null;const base=ranked[0];if(base.n.winner===p)return base.a;
 let best=0,pick=base.a;const baseSafe=!successors(base.n).some(c=>c.n.winner===1-p);
 for(const c of ranked.filter(c=>c.score===base.score).slice(0,8)){const cs=successors(c.n);if(!cs.length)continue;if(baseSafe&&cs.some(r=>r.n.winner===1-p))continue;const ws=featureWeights(opponentModel,c.n,cs),neutral=featureWeights(null,c.n,cs),sum=ws.reduce((a,b)=>a+b,0),ns=neutral.reduce((a,b)=>a+b,0);const bonus=cs.reduce((a,r,i)=>a+(ws[i]/sum-neutral[i]/ns)*evaluate(r.n,p),0);if(bonus>best+1e-8){best=bonus;pick=c.a;}}
 return pick;
}
