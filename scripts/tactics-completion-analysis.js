import fs from 'node:fs';import zlib from 'node:zlib';import readline from 'node:readline';
const prefix=process.argv[2]??'reports/tactics-completion';
const followups=zlib.gunzipSync(fs.readFileSync(prefix+'-followup.jsonl.gz')).toString().trim().split('\n').filter(Boolean).map(JSON.parse),replace=new Map(followups.map(r=>[r.id,r.original]));
if(fs.existsSync(prefix+'-extension.jsonl.gz'))for(const line of zlib.gunzipSync(fs.readFileSync(prefix+'-extension.jsonl.gz')).toString().trim().split('\n').filter(Boolean)){const g=JSON.parse(line);replace.set(g.id,g);}
const aggregates=new Map(),cross=new Map();
function make(){return {games:0,plies:0,captureOpportunities:0,declinedCapture:0,immediateWinsOffered:0,immediateWinsMissed:0,wallMoves:0,wallBacktracks:0,pawnBacktracks:0,repeatedGames:0,quietRepeatedUnresolved:0,nearVictoryReversals:0,leadChanges:0,scoreIntervals:[],legalCounts:[0,0,0],bandPlies:[0,0,0],terminalQuiet:[]};}
for await(const line of readline.createInterface({input:fs.createReadStream(prefix+'-games.jsonl.gz').pipe(zlib.createGunzip()),crlfDelay:Infinity})){
 if(!line)continue;const base=JSON.parse(line),g={...base,...(replace.get(base.id)??{})};
 const id=`${g.scenario}:${g.size}`;if(!aggregates.has(id))aggregates.set(id,make());const a=aggregates.get(id),m=g.metrics;
 a.games++;a.plies+=g.state.ply;a.repeatedGames+=Number(g.repetitionCount>0);a.quietRepeatedUnresolved+=Number(g.reason!=='win'&&g.repetitionCount>0&&m.quiet>=40);a.nearVictoryReversals+=Number(m.nearVictoryReversal);a.leadChanges+=m.leadChanges;
 for(const k of ['captureOpportunities','declinedCapture','immediateWinsOffered','immediateWinsMissed','wallMoves','wallBacktracks','pawnBacktracks'])a[k]+=m[k];
 let last=0;for(const p of m.scorePlies){a.scoreIntervals.push(p-last);last=p;}
 a.terminalQuiet.push(m.quiet);
 for(let i=0;i<3;i++)a.legalCounts[i]+=m.legalCounts[i];
 a.bandPlies[0]+=Math.min(g.state.ply,40);a.bandPlies[1]+=Math.min(80,Math.max(0,g.state.ply-40));a.bandPlies[2]+=Math.max(0,g.state.ply-120);
 if(g.policies[0]!==g.policies[1]){
  const cid=`${g.scenario}:${g.size}:${g.matchup}`;if(!cross.has(cid))cross.set(cid,{games:0,wins:{},unresolved:0});const c=cross.get(cid);c.games++;if(g.reason==='win'){const p=g.policies[g.state.winner];c.wins[p]=(c.wins[p]||0)+1;}else c.unresolved++;
 }
}
const result=[...aggregates].map(([id,a])=>{
 a.scoreIntervals.sort((a,b)=>a-b);a.terminalQuiet.sort((a,b)=>a-b);
 const intervals=a.scoreIntervals;return {id,...a,scoreIntervals:undefined,terminalQuiet:undefined,medianScoreInterval:intervals.length?intervals[Math.floor((intervals.length-1)/2)]:null,p95ScoreInterval:intervals.length?intervals[Math.floor(.95*(intervals.length-1))]:null,captureOpportunityRate:a.plies?a.captureOpportunities/a.plies:null,declinedCaptureRate:a.captureOpportunities?a.declinedCapture/a.captureOpportunities:null,meanLegalByPlyBand:a.legalCounts.map((n,i)=>a.bandPlies[i]?n/a.bandPlies[i]:null)};
});
fs.writeFileSync(prefix+'-analysis.json',JSON.stringify({method:'Observed opportunity/behavior frequencies, not proof of optimality or causal effect. Capture decline may be rational defense. Ply bands: 0-39, 40-119, >=120. Hypothetical threat-tail diagnostics are in final summary.',aggregates:result,crossMatchups:[...cross].map(([id,a])=>({id,...a}))},null,2)+'\n');
const r=JSON.parse(fs.readFileSync(prefix+'-final-summary.json'));
const columns=['scenario','size','matchup','games','firstWins','secondWins','officialDraws','unresolved','decidedRate','firstDecidedRate','firstAllRate','secondAllRate','repeatedGames','budgetInterrupted','finalMin','finalMax','bootstrapLo','bootstrapHi','conservativeLo','conservativeHi'];
fs.writeFileSync(prefix+'-fairness.csv',columns.join(',')+'\n'+r.groups.map(g=>{const x={...g,finalMin:g.firstFinalPossibleRange?.[0],finalMax:g.firstFinalPossibleRange?.[1],bootstrapLo:g.pairedBootstrapDecided95?.[0],bootstrapHi:g.pairedBootstrapDecided95?.[1],conservativeLo:g.conservativeClusterDecided95?.[0],conservativeHi:g.conservativeClusterDecided95?.[1]};return columns.map(k=>x[k]??'').join(',');}).join('\n')+'\n');
