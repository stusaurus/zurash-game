import {seeded} from '../src/ai.js';
export function summarize(games){
  const n=games.length,decided=games.filter(g=>g.winner!==null),wins=decided.filter(g=>g.winner===g.starter).length;
  const rate=decided.length?wins/decided.length:null;
  const sorted=games.map(g=>g.plies).sort((a,b)=>a-b),ds=decided.map(g=>g.plies).sort((a,b)=>a-b);
  const median=a=>a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null;
  const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
  const z=1.95996398454,d=decided.length;
  const den=1+z*z/(d||1),mid=d?(rate+z*z/(2*d))/den:null,half=d?z*Math.sqrt(rate*(1-rate)/d+z*z/(4*d*d))/den:null;
  // Resample whole base-layout clusters: both starters AND orientations stay together.
  const clusters=new Map();for(const g of games){const id=`${g.shard??0}:${g.pair}`;if(!clusters.has(id))clusters.set(id,[]);clusters.get(id).push(g);}
  const cs=[...clusters.values()].map(gs=>({d:gs.filter(g=>g.winner!==null).length,w:gs.filter(g=>g.winner!==null&&g.winner===g.starter).length}));
  const rng=seeded(20261021),ratios=[];
  for(let i=0;i<2000&&cs.length;i++){let d=0,w=0;for(let j=0;j<cs.length;j++){const c=cs[Math.floor(rng()*cs.length)];d+=c.d;w+=c.w;}if(d)ratios.push(w/d);}
  ratios.sort((a,b)=>a-b);
  const interval=ratios.length?[ratios[Math.floor(.025*(ratios.length-1))],ratios[Math.ceil(.975*(ratios.length-1))]]:null;
  return {games:n,clusters:cs.length,decided:d,firstWins:wins,secondWins:d-wins,firstSeatDecidedRate:rate,secondSeatDecidedRate:rate===null?null:1-rate,undecidedRate:n?(n-d)/n:null,reach120Rate:n?games.filter(g=>g.plies>=120).length/n:null,wilson95IndependentGames:d?[mid-half,mid+half]:null,pairedLayoutBootstrap95:cs.length>=2?interval:null,meanAllPlies:mean(sorted),medianAllPlies:median(sorted),meanDecidedPlies:mean(ds),medianDecidedPlies:median(ds),estimatedMinutesAtSecondsPerPly:Object.fromEntries([5,10,15].map(t=>[t,{meanAll:mean(sorted)===null?null:mean(sorted)*t/60,medianDecided:median(ds)===null?null:median(ds)*t/60}])),caveat:'Exploratory policy-specific inference. Bootstrap clusters base layouts; Wilson assumes independent games and is descriptive only. Capped times are censored; no human timing.'};
}
