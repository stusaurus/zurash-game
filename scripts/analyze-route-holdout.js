import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {seeded} from '../src/ai.js';
const files=[0,1,2].map(l=>`reports/route-holdout-${l}.json`);
const reports=files.map(f=>JSON.parse(fs.readFileSync(f))),raw=files.flatMap(f=>gunzipSync(fs.readFileSync(f.replace('.json','.jsonl.gz'))).toString().trim().split('\n').map(JSON.parse));
const pairs=reports[0].params.pairs,groups=(policy,layout)=>raw.filter(g=>g.layout===layout&&g.policies.join('/')===policy);
const q=(a,p)=>[...a].sort((a,b)=>a-b)[Math.max(0,Math.ceil(a.length*p)-1)];
const sum=(a,fn)=>a.reduce((n,x)=>n+fn(x),0);
function bootstrap(fn){const rng=seeded(19237),values=[];for(let b=0;b<5000;b++){
 const sample=[];for(let layout=0;layout<3;layout++)for(let p=0;p<pairs;p++)sample.push({layout,pair:Math.floor(rng()*pairs)});
 values.push(fn(sample));
}return [q(values,.025),q(values,.975)];}
const findings=[];
for(const name of ['route','route-progress']){
 const versus=[],self=[],baseline=[];
 for(let l=0;l<3;l++){versus.push(...groups(name+'/strong',l));self.push(...groups(name+'/'+name,l));baseline.push(...groups('strong/strong',l));}
 const pairIndex=(games)=>new Map(Array.from({length:3},(_,l)=>Array.from({length:pairs},(_,p)=>[`${l}/${p}`,games.filter(g=>g.layout===l&&g.pair===p)])).flat());
 const vi=pairIndex(versus),si=pairIndex(self),bi=pairIndex(baseline);
 const winCI=bootstrap(sample=>sum(sample,x=>sum(vi.get(`${x.layout}/${x.pair}`),g=>g.winner===0))/versus.length);
 const delta=fn=>bootstrap(sample=>sum(sample,x=>sum(si.get(`${x.layout}/${x.pair}`),fn)-sum(bi.get(`${x.layout}/${x.pair}`),fn))/self.length);
 const byLayout=[0,1,2].map(l=>{const v=versus.filter(g=>g.layout===l),a=self.filter(g=>g.layout===l),b=baseline.filter(g=>g.layout===l);return {layout:l,wins:sum(v,g=>g.winner===0),losses:sum(v,g=>g.winner===1),capped:sum(v,g=>g.capped),selfCapped:sum(a,g=>g.capped),baselineCapped:sum(b,g=>g.capped),selfMean:sum(a,g=>g.plies)/a.length,baselineMean:sum(b,g=>g.plies)/b.length};});
 const wins=sum(versus,g=>g.winner===0),losses=sum(versus,g=>g.winner===1),capped=sum(versus,g=>g.capped),sc=sum(self,g=>g.capped),bc=sum(baseline,g=>g.capped);
 const eligibility={winsEveryLayout:byLayout.every(x=>x.wins>x.losses),conservativeWin95LowerOverHalf:winCI[0]>.5,selfCapsDecrease:sc<bc,selfObservedMeanDecrease:sum(self,g=>g.plies)<sum(baseline,g=>g.plies),noLayoutCapWorseOver5pp:byLayout.every(x=>x.selfCapped-x.baselineCapped<=pairs*2*.05),noLegalFailures:raw.every(g=>!g.noLegal)};
 findings.push({name,versus:{games:versus.length,wins,losses,capped,conservativeWinRate:wins/versus.length,pairedStratified95:winCI},byLayout,self:{games:self.length,capped:sc,baselineCapped:bc,mean:sum(self,g=>g.plies)/self.length,baselineMean:sum(baseline,g=>g.plies)/baseline.length,capDelta95:delta(g=>+g.capped),meanPliesDelta95:delta(g=>g.plies),stalled20:sum(self,g=>g.maxQuiet>=20),baselineStalled20:sum(baseline,g=>g.maxQuiet>=20),scoreGapMeanDecided:sum(self.filter(g=>!g.capped),g=>Math.abs(g.scores[0]-g.scores[1]))/self.filter(g=>!g.capped).length},eligibility,numericGatePassed:Object.values(eligibility).every(Boolean)});
}
const lookup=(policy)=>new Map([0,1,2].flatMap(l=>Array.from({length:pairs},(_,p)=>[`${l}/${p}`,groups(policy,l).filter(g=>g.pair===p)])));
const vr=lookup('route/strong'),vp=lookup('route-progress/strong'),sr=lookup('route/route'),sp=lookup('route-progress/route-progress');
const denominator=pairs*2*3;
const ablation={progressMinusRouteWinRate95:bootstrap(sample=>sum(sample,x=>sum(vp.get(`${x.layout}/${x.pair}`),g=>g.winner===0)-sum(vr.get(`${x.layout}/${x.pair}`),g=>g.winner===0))/denominator),progressMinusRouteSelfMean95:bootstrap(sample=>sum(sample,x=>sum(sp.get(`${x.layout}/${x.pair}`),g=>g.plies)-sum(sr.get(`${x.layout}/${x.pair}`),g=>g.plies))/denominator)};
const result={conditions:reports.map(r=>r.params),ablation,totalGames:raw.length,totalPlies:sum(raw,g=>g.plies),method:'5000 stratified-by-layout seed-pair bootstrap resamples. Head-to-head caps count as nonwins. Selfplay differences pair same layout/seed/starter. 900 trials share seeds across policies; do not pool as 900 independent observations.',findings};
fs.writeFileSync('reports/route-holdout-analysis.json',JSON.stringify(result,null,2)+'\n');console.log(result.findings);
