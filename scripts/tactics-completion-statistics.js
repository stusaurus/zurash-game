import fs from 'node:fs';import zlib from 'node:zlib';import path from 'node:path';
import {randomStream} from './tactics-completion.js';
const fraction=(a,b)=>b?a/b:null;
export function completionSummary(games,{bootstrap=2000}={}){
 const n=games.length,first=games.filter(g=>g.reason==='win'&&g.state.winner===g.starter).length,second=games.filter(g=>g.reason==='win'&&g.state.winner!==g.starter).length,decided=first+second,u=n-decided;
 const sorted=games.filter(g=>g.reason==='win').map(g=>g.state.ply).sort((a,b)=>a-b),quantile=p=>sorted.length?sorted[Math.floor(p*(sorted.length-1))]:null;
 const clusters=new Map();for(const g of games){if(!clusters.has(g.cluster))clusters.set(g.cluster,[]);clusters.get(g.cluster).push(g);}
 const counts=[...clusters.values()].map(gs=>[gs.filter(g=>g.reason==='win'&&g.state.winner===g.starter).length,gs.filter(g=>g.reason==='win').length,gs.length]);
 const rng=randomStream(20261021),rates=[],allRates=[];
 for(let i=0;i<bootstrap&&counts.length;i++){let f=0,d=0,t=0;for(let j=0;j<counts.length;j++){const c=counts[Math.floor(rng()*counts.length)];f+=c[0];d+=c[1];t+=c[2];}if(d)rates.push(f/d);if(t)allRates.push(f/t);}
 const interval=rs=>{rs.sort((a,b)=>a-b);return counts.length<2||rs.length<bootstrap*.9?null:[rs[Math.floor(.025*(rs.length-1))],rs[Math.ceil(.975*(rs.length-1))]];};
 const reasons={};for(const g of games)reasons[g.reason]=(reasons[g.reason]||0)+1;
 const ci=interval(rates),range=n?[first/n,(first+u)/n]:null;
 // Weighted independent-cluster Hoeffding bounds for first-win and decision means.
 // Four tails at alpha=.05; unlike the bootstrap this does not collapse with 2-6 clusters.
 const eps=n?Math.sqrt(Math.log(80)*counts.reduce((a,c)=>a+(c[2]/n)**2,0)/2):null;
 const fl=n?Math.max(0,first/n-eps):null,fu=n?Math.min(1,first/n+eps):null;
 const dl=n?Math.max(0,decided/n-eps):null,du=n?Math.min(1,decided/n+eps):null;
 const conservativeRatio=n?[du?fl/du:0,dl?Math.min(1,fu/dl):1]:null;
 return {games:n,clusters:counts.length,firstWins:first,secondWins:second,officialDraws:0,unresolved:u,anomalies:games.filter(g=>['no-legal-action','invalid-policy-action'].includes(g.reason)).length,budgetInterrupted:games.filter(g=>g.reason.startsWith('budget-')).length,repeatedGames:games.filter(g=>g.repetitionCount>0).length,repeatedUnresolvedQuietGames:games.filter(g=>g.reason!=='win'&&g.repetitionCount>0&&g.metrics.quiet>=40).length,decidedRate:fraction(decided,n),firstDecidedRate:fraction(first,decided),firstAllRate:fraction(first,n),secondAllRate:fraction(second,n),firstFinalPossibleRange:range,pairedBootstrapDecided95:ci,conservativeClusterFirstAll95:n?[fl,fu]:null,conservativeClusterDecided95:conservativeRatio,conservativeClusterFinalFirstRange95:n?[fl,Math.min(1,fu+1-dl)]:null,pairedBootstrapFirstAll95:interval(allRates),reasons,plies:{min:quantile(0),q25:quantile(.25),median:quantile(.5),q75:quantile(.75),p90:quantile(.9),p95:quantile(.95),max:quantile(1),mean:sorted.length?sorted.reduce((a,b)=>a+b,0)/sorted.length:null,beyond120Wins:sorted.filter(p=>p>120).length},judgment:!n||!conservativeRatio||u||conservativeRatio[0]<.45||conservativeRatio[1]>.55?'inconclusive-or-outside-target':'policy-conditional-target-only'};
}

export function loadCompletionSummary(prefix){
 const r=JSON.parse(fs.readFileSync(prefix+'-summary.json'));
 if(!r.rows)r.rows=zlib.gunzipSync(fs.readFileSync(path.join(path.dirname(prefix),r.rowsArchive))).toString().trim().split('\n').filter(Boolean).map(JSON.parse);
 return r;
}
