// Diagnose whether stars are immediately scoreable, reachable by static-wall
// sliding, and evenly accessible from both seats. Research only.
import fs from "node:fs";
import {slide,actions,distances} from "../src/engine.js";
import {CANDIDATES,makeCandidate,geometryVariants} from "./tactics-candidates.js";

const seeds=Number(process.env.SEEDS??30);
if(!Number.isInteger(seeds)||seeds<1||seeds>1000)throw Error("Invalid SEEDS");
const report=[];
for(const config of CANDIDATES){
  for(let i=0;i<seeds;i++){
    let state;
    for(let attempt=0;attempt<100;attempt++){
      try{state=makeCandidate(config,10000+i*101+attempt);break;}
      catch(e){if(e.message!=="No legal opening")throw e;}
    }
    if(!state)throw Error("No playable candidate");
    for(const [orientation,s] of geometryVariants(state).entries()){
      const dist=[distances(s,0),distances(s,1)];
      const reachable=s.stars.map(star=>[dist[0][star],dist[1][star]]);
      const unreachable=reachable.filter(([a,b])=>!Number.isFinite(a)&&!Number.isFinite(b)).length;
      const oneSided=reachable.filter(([a,b])=>Number.isFinite(a)!==Number.isFinite(b)).length;
      const opening=[0,1].map(p=>{
        const n={...s,turn:p};
        const legal=actions(n);
        return {legal:legal.length,scoreNow:legal.filter(a=>{
          const afterWall=a.wall===null?n:{...n,walls:n.walls.map((v,j)=>j===a.wall.wall?a.wall.to:v)};
          return s.stars.includes(slide(afterWall,p,a.dir));
        }).length};
      });
      report.push({size:s.size,seed:i,orientation,wallCount:s.walls.length,unreachable,oneSided,opening,staticDistance:reachable.map(pair=>pair.map(x=>Number.isFinite(x)?x:null))});
    }
  }
}
const summary=CANDIDATES.map(c=>{
  const rows=report.filter(x=>x.size===c.size);
  const mean=fn=>rows.reduce((a,x)=>a+fn(x),0)/rows.length;
  return {size:c.size,layouts:rows.length,meanUnreachableStars:mean(x=>x.unreachable),meanOneSidedStars:mean(x=>x.oneSided),meanImmediateScoringMovesFirst:mean(x=>x.opening[0].scoreNow),meanImmediateScoringMovesSecond:mean(x=>x.opening[1].scoreNow),meanLegalMovesFirst:mean(x=>x.opening[0].legal),meanLegalMovesSecond:mean(x=>x.opening[1].legal)};
});
const output=process.env.OUTPUT??"reports/tactics-accessibility.json";
fs.writeFileSync(output,JSON.stringify({version:1,notes:"Static-wall reachability is diagnostic, not proof of dynamic reachability or seat fairness",seeds,summary,layouts:report},null,2)+"\n");
console.log(JSON.stringify(summary,null,2));
