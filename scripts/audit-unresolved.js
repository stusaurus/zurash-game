// Read-only audit of the existing discovery game ledgers.
// No continuation, new games, or changes to the official rules.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {join} from 'node:path';

const dir=process.env.DISCOVERY_REPORT??'reports/discovery-2026-10-22';
const out=process.env.AUDIT_OUTPUT??join(dir,'unresolved-diagnostics.json');
const read=name=>JSON.parse(gunzipSync(readFileSync(join(dir,name+'.json.gz'))));
const ledgers=[['games',read('games')],['position-games',read('position-games')]];
const records=[],seen=new Set(),counts={total:0,settled:0,unresolved:0,duplicateIds:0,withRepetition:0,withNoScoreProgress:0,missingReason:0};
const reasonCounts={},byBoard={},byStage={},byPolicy={},byBoardDetail={},boardGameCounts={};
const inc=(obj,k)=>obj[k]=(obj[k]??0)+1;
function analyse(g,ledger){
  const h=Array.isArray(g.history)?g.history:[];
  // History records gain per move; score snapshots are not stored there.
  // Quiet streak is measured from the last scoring move, not inferred from
  // missing score snapshots.
  const lastGain=h.findLastIndex(item=>item?.gain===true);
  const scoreStallPlies=h.every(item=>typeof item?.gain==='boolean')
    ?h.length-(lastGain+1):null;
  const unresolved=g.state?.winner==null;
  const reason=g.reason==null?'unspecified':String(g.reason);
  const boardId=g.experiment?.boardId??g.boardId??'unknown';
  const stage=g.experiment?.stage??g.stage??'unknown';
  const policies=g.policies??[];
  const policyKey=Array.isArray(policies)?policies.join(' vs '):String(policies);
  const repeated=Number(g.repetitionCount??0)>0;
  const row={id:g.id,ledger,boardId,stage,policies:policyKey,unresolved,reason,plies:g.state?.ply??h.length,repetitionObserved:repeated,scoreStallPlies,scoreMetricAvailable:scoreStallPlies!==null};
  return row;
}
for(const [name,rows] of ledgers)for(const g of rows){
  if(!g?.id)throw Error('Missing game ID in '+name);
  if(seen.has(g.id)){counts.duplicateIds++;continue;}seen.add(g.id);
  const r=analyse(g,name);records.push(r);counts.total++;inc(boardGameCounts,r.boardId);
  if(r.unresolved){counts.unresolved++;inc(reasonCounts,r.reason);inc(byBoard,r.boardId);
    const d=byBoardDetail[r.boardId]??={unresolved:0,withRepetition:0,withNoScoreProgress:0,reasons:{},stages:{},policies:{}};
    d.unresolved++;inc(d.reasons,r.reason);inc(d.stages,r.stage);inc(d.policies,r.policies);
    if(r.repetitionObserved)d.withRepetition++;
    if(r.scoreStallPlies!==null&&r.scoreStallPlies>=30)d.withNoScoreProgress++;inc(byStage,r.stage);inc(byPolicy,r.policies);if(r.repetitionObserved)counts.withRepetition++;if(r.scoreStallPlies!==null&&r.scoreStallPlies>=30)counts.withNoScoreProgress++;if(r.reason==='unspecified')counts.missingReason++;}
  else counts.settled++;
}
const unresolved=records.filter(r=>r.unresolved).sort((a,b)=>a.boardId.localeCompare(b.boardId)||a.id.localeCompare(b.id));
const boardPriority=Object.entries(byBoardDetail).map(([boardId,d])=>({boardId,...d,totalGames:boardGameCounts[boardId],unresolvedRate:d.unresolved/boardGameCounts[boardId],investigationScore:d.unresolved+d.withRepetition+d.withNoScoreProgress})).sort((a,b)=>b.investigationScore-a.investigationScore||a.boardId.localeCompare(b.boardId));
const result={version:2,scope:'existing discovery ledgers; read-only; no new games',counts,reasonCounts,unresolvedByBoard:byBoard,unresolvedByStage:byStage,unresolvedByPolicy:byPolicy,boardPriority,unresolved,limitations:['Investigation score ranks where to inspect, not board quality or causal proof','Reasons reflect engine-recorded stopping reasons, not proven causes of non-termination','Repetition observed is not a proof of an infinite loop','Score stall is null unless all move records include the gain flag','No determination of star accessibility or legal-move scarcity','Duplicate IDs are excluded from counts','This script does not resume games or certify boards']};
mkdirSync(out.split('/').slice(0,-1).join('/')||'.',{recursive:true});writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({output:out,...counts,reasonCounts,byStage,topBoards:boardPriority.slice(0,10).map(({boardId,totalGames,unresolved,unresolvedRate,withRepetition,withNoScoreProgress,investigationScore})=>({boardId,totalGames,unresolved,unresolvedRate,withRepetition,withNoScoreProgress,investigationScore}))},null,2));
