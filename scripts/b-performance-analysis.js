import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {key} from '../src/engine.js';
import {referenceChildren} from './stall-research.js';
import {bFactorMove} from './b-factorial-ai.js';
import {inventory} from './guard-ai.js';
import {seenAt} from './b-factorial-study.js';
import {randomStream} from './tactics-completion.js';
import {oldUnresolved,load,save} from './b-performance-study.js';
export function flatDiagnosis(){
 const rows=oldUnresolved().map(r=>{const g=r.game,s=g.state,seen=seenAt(g),inv=inventory(s,'retain',g.rngStates[s.turn],seen),q=bFactorMove(s,'D',randomStream(g.rngStates[s.turn]),seen,{maxMs:3600000,trace:true});
 return {id:g.id,ply:s.ply,legal:inv.rows.length,prepare:inv.rows.filter(r=>r.prepare).length,deny:inv.rows.filter(r=>r.deny).length,capture:inv.rows.filter(r=>r.capture).length,retained:q.retainedCount,values:q.scores.map(r=>r.value),uniqueValues:new Set(q.scores.map(r=>r.value)).size,choice:q.action,allRankedRoutes:inv.rows.map(r=>[r.ownRoutes,r.opponentRoutes])};});
 save('flat-diagnosis',rows);return rows;
}
// Objective tactical decisions, not a count of human strategic depth.
export function tactical(game){let s=game.initial;const rows=[];
 for(const h of game.history){const p=s.turn,cs=referenceChildren(s),chosen=cs.find(c=>JSON.stringify(c.a)===JSON.stringify(h.a));assert.ok(chosen);
  const wins=cs.filter(c=>c.n.winner===p),threat=s.scores[1-p]===(s.target??3)-1;
  let safe=cs.length,dangerous=0,selectedDanger=false;
  if(threat){safe=0;for(const c of cs){const danger=c.n.winner===null&&referenceChildren(c.n).some(r=>r.n.winner===1-p);if(danger)dangerous++;else safe++;if(c===chosen)selectedDanger=danger;}}
  const criticalWin=wins.length>0&&wins.length<cs.length,criticalDefense=safe>0&&dangerous>0;
  if(criticalWin||criticalDefense||selectedDanger)rows.push({ply:s.ply,actor:p,AI:game.research.policyByActor[p],criticalWin,criticalDefense,selectedDanger,avoidable: selectedDanger&&safe>0,missedWin:wins.length>0&&chosen.n.winner!==p,safe,dangerous,winning:wins.length});
  s=chosen.n;
 }assert.deepEqual(s,game.state);return {id:game.id,rows};
}
export function tacticalPart(index){const rows=load(`fresh-${index}`).map(r=>tactical(r.game));save(`tactical-${index}`,rows);console.log('tactical full census',index,rows.length);return rows;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [flag,n]=process.argv.slice(2);if(flag==='--flat')flatDiagnosis();else if(flag==='--tactical')tacticalPart(Number(n));else throw Error('Specify analysis');}
