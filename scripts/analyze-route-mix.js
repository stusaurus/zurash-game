import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {seeded} from '../src/ai.js';
const reports=[0,1,2].map(l=>JSON.parse(fs.readFileSync(`reports/route-mix-holdout-${l}.json`)));
const raw=[0,1,2].flatMap(l=>gunzipSync(fs.readFileSync(`reports/route-mix-holdout-${l}.jsonl.gz`)).toString().trim().split('\n').map(JSON.parse));
const rows=reports.flatMap(r=>r.rows),pairs=reports[0].params.pairs,n=pairs*6,sum=(a,f)=>a.reduce((s,x)=>s+f(x),0),q=(a,p)=>[...a].sort((a,b)=>a-b)[Math.ceil(a.length*p)-1];
const get=p=>raw.filter(g=>g.policies.join('/')===p),head=get('route-mix/legacy-strong'),direct=get('route-mix/route'),mixed=get('route-mix/route-mix'),pure=get('route/route'),old=get('legacy-strong/legacy-strong');
function boot(fn){const rng=seeded(21739),values=[];for(let rep=0;rep<5000;rep++){
 const sample=[];for(let l=0;l<3;l++)for(let j=0;j<pairs;j++)sample.push([l,Math.floor(rng()*pairs)]);values.push(fn(sample));
}return [q(values,.025),q(values,.975)];}
const index=a=>new Map([0,1,2].flatMap(l=>Array.from({length:pairs},(_,p)=>[l+'/'+p,a.filter(g=>g.layout===l&&g.pair===p)])));
const h=index(head),d=index(direct),m=index(mixed),p=index(pure),o=index(old);
const totals=a=>({games:a.length,wins:sum(a,g=>g.winner===0),losses:sum(a,g=>g.winner===1),capped:sum(a,g=>g.capped),meanObservedPlies:sum(a,g=>g.plies)/a.length,stalled20:sum(a,g=>g.maxQuiet>=20)});
const ciHead=boot(sample=>sum(sample,x=>sum(h.get(x.join('/')),g=>g.winner===0))/n);
const ciDirect=boot(sample=>sum(sample,x=>sum(d.get(x.join('/')),g=>g.winner===null?.5:g.winner===0?1:0))/n);
const difference=(b,fn)=>boot(sample=>sum(sample,x=>sum(m.get(x.join('/')),fn)-sum(b.get(x.join('/')),fn))/n);
const capDelta95=difference(o,g=>+g.capped),oldMeanDelta95=difference(o,g=>g.plies),pureMeanDelta95=difference(p,g=>g.plies);
const byLayout=[0,1,2].map(l=>({layout:l,head:totals(head.filter(g=>g.layout===l)),mixed:rows.find(r=>r.layout===l&&r.policies==='route-mix/route-mix'),pure:rows.find(r=>r.layout===l&&r.policies==='route/route'),old:rows.find(r=>r.layout===l&&r.policies==='legacy-strong/legacy-strong')}));
const gates={beatsOldEachLayout:byLayout.every(x=>x.head.wins>x.head.losses),headConservativeCIOverHalf:ciHead[0]>.5,capsImproveCI:capDelta95[1]<0,meanImproveCI:oldMeanDelta95[1]<0,notLargeLossAgainstPure:ciDirect[0]>.35,selfMeanWithin10OfPure:totals(mixed).meanObservedPlies-totals(pure).meanObservedPlies<=10,pureMeanDeltaCIUpperWithin15:pureMeanDelta95[1]<=15,noLayoutCapsWorse5pp:byLayout.every(x=>x.mixed.capped-x.old.capped<=pairs*2*.05),firstChoicesNotFewerThanPure:byLayout.every(x=>x.mixed.canonicalFirstChoices>=x.pure.canonicalFirstChoices),firstChoicesImprove:byLayout.some(x=>x.layout!==1&&x.mixed.canonicalFirstChoices>x.pure.canonicalFirstChoices),sixPlyStatesIncrease:sum(byLayout,x=>x.mixed.canonicalSixPlyStates)>sum(byLayout,x=>x.pure.canonicalSixPlyStates),noLegalFailures:raw.every(g=>!g.noLegal)};
const result={totalGames:raw.length,totalPlies:sum(raw,g=>g.plies),conditions:reports.map(r=>r.params),method:'Stratified-by-layout paired-seed bootstrap, 5000 samples. Caps are nonwins against legacy, half-point only for direct noninferiority screen against route. Diversity counts are descriptive policy samples, not proof of meaningful strategy.',head:{...totals(head),conservativeCI95:ciHead},direct:{...totals(direct),pointRateCI95:ciDirect},self:totals(mixed),pureSelf:totals(pure),oldSelf:totals(old),capDelta95,oldMeanDelta95,pureMeanDelta95,byLayout,gates,numericGatesPassed:Object.values(gates).every(Boolean)};
fs.writeFileSync('reports/route-mix-analysis.json',JSON.stringify(result,null,2)+'\n');console.log({...result,byLayout:undefined,conditions:undefined});
