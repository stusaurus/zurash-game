// Research only. Never imported by src or the play site.
import {successors,key} from '../src/engine.js';
import {evaluate} from '../src/ai.js';
import {captureRoutes} from '../src/route-ai.js';

export const actionID = a => JSON.stringify(a);
// Exact one-turn reachability with one legal wall shift; deeper use is a heuristic.
export function pathValue(s,p) {
  const base=evaluate(s,p);
  if(s.winner!==null)return base;
  const a=captureRoutes(s,p).size,b=captureRoutes(s,1-p).size;
  return base+100*(a-b)+(s.turn===p&&s.scores[p]===(s.target??3)-1&&a?20000:0)
    -(s.turn!==p&&s.scores[1-p]===(s.target??3)-1&&b?20000:0);
}
// Same depth, beam, RNG calls, repetition penalties and legacy cutoff as search.
// Defense reserves safe moves only in mixed safe/unsafe tactical positions.
export function researchDecision(s,{variant='control',rng=Math.random,seen=new Map(),beam=8}={}) {
  const p=s.turn,stats={generated:0,evaluated:0,routeQueries:0,rootCandidates:0,defenseActivated:false};
  const paths=variant==='path'||variant==='combined',defense=variant==='defense'||variant==='combined'||variant==='win-guard'&&s.scores[1-p]===(s.target??3)-1;
  const children=n=>{const cs=successors(n);stats.generated+=cs.length;return cs;};
  const value=n=>{stats.evaluated++;if(paths){stats.routeQueries+=n.winner===null?2:0;return pathValue(n,p);}return evaluate(n,p);};
  let ranked=children(s).map(c=>({...c,score:value(c.n)-(seen.get(key(c.n))||0)*130,tie:rng()}))
    .sort((a,b)=>b.score-a.score||a.tie-b.tie);
  if(!ranked.length)return {action:null,stats};
  if(ranked[0].n.winner===p)return {action:ranked[0].a,stats};
  let candidates=ranked.slice(0,beam);
  if(defense){
    // Check all root children, including moves below the beam. Do not require
    // a threat before our turn: moving our own stopper may create the threat.
    const safe=ranked.filter(c=>{stats.routeQueries++;return !captureRoutes(c.n,1-p).size;});
    if(safe.length&&safe.length<ranked.length){
      const winningThreat=s.scores[1-p]===(s.target??3)-1;
      // Keep up to half the beam for score defense; all slots for win defense.
      const reserved=safe.slice(0,winningThreat?beam:Math.ceil(beam/2));
      const ids=new Set(reserved.map(c=>actionID(c.a)));
      candidates=[...reserved,...ranked.filter(c=>!ids.has(actionID(c.a)))].slice(0,beam);
      stats.defenseActivated=true;
    }
  }
  let best=-Infinity,pick=candidates[0].a;
  const values=[];
  for(const c of candidates){
    let worst=Infinity;
    for(const {n} of children(c.n)){
      worst=Math.min(worst,value(n));
      if(worst<best-150)break;
    }
    const v=worst*.88+c.score*.12-(seen.get(key(c.n))||0)*130;
    values.push({action:c.a,value:v});
    if(v>best){best=v;pick=c.a;}
  }
  stats.rootCandidates=candidates.length;
  return {action:pick,stats,candidateIDs:candidates.map(c=>actionID(c.a)),values};
}
