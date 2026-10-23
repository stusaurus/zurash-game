// Read-only decision gate: never select a layout from the training screen alone.
import {readFileSync,writeFileSync} from 'node:fs';
const dir=process.env.FAIRNESS_DIAG_REPORT??'reports/fairness-diagnostics';
const pilot=JSON.parse(readFileSync(dir+'/BD-paired-pilot.json'));
const holdout=JSON.parse(readFileSync(dir+'/D-holdout.json'));
const rows=[];
for(const mode of pilot.modes){
 for(const r of mode.records){
  const h=mode.id==='D'?holdout.comparison.find(x=>x.label===r.label):null;
  const n=h??r,rate=n.settled/n.total,firstRate=n.settled?n.firstWins/n.settled:null;
  // Conservative predeclared gate: at least 95% settled, >=64 independent games,
  // and <=10 percentage points from 50/50 in the independent holdout.
  const independent=Boolean(h),pass=independent&&n.total>=64&&rate>=0.95&&Math.abs(firstRate-0.5)<=0.10;
  rows.push({mode:mode.id,label:r.label,pilot:{total:r.total,settled:r.settled,firstWins:r.firstWins,secondWins:r.secondWins},holdout:h??null,decidedRate:rate,firstWinRateAmongDecided:firstRate,independent,passesGate:pass,decision:pass?'eligible-for-further-review':'do-not-promote'});
 }
}
const report={version:1,gate:'independent n>=64, settled>=95%, |first-win rate among decided - 50%| <=10pp',warning:'Passing this screening gate does not establish fairness; paired uncertainty, different policies and human play remain necessary.',rows};
writeFileSync(dir+'/BD-decision.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(rows.map(({mode,label,decidedRate,firstWinRateAmongDecided,passesGate,decision})=>({mode,label,decidedRate,firstWinRateAmongDecided,passesGate,decision})),null,2));
