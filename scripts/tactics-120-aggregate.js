// Aggregate the 50 fresh 120-ply simulation shards; compare 80 vs 120
// using checkpoints from the SAME games rather than unrelated samples.
// Usage: node scripts/tactics-120-aggregate.js artifacts/
import fs from "node:fs";
import path from "node:path";
const root=process.argv[2];
if(!root)throw Error("Pass extracted artifact directory");
const files=fs.readdirSync(root,{recursive:true}).map(String).filter(p=>p.endsWith(".json")&&p.includes("tactics-120-ply-"));
const shards=new Set(),groups=new Map();
for(const file of files){
  const r=JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
  const shard=r.params?.shard;
  if(!Number.isInteger(shard)||shard<50||shard>=100||r.params.cap!==120||shards.has(shard))throw Error("Unexpected/duplicate shard: "+shard);
  shards.add(shard);
  for(const g of r.games){
    const k=g.size+"-"+g.policy;
    if(!groups.has(k))groups.set(k,[]);
    groups.get(k).push(g);
  }
}
if(shards.size!==50)throw Error("Expected 50 shards; found "+shards.size);
const summary=[...groups].sort((a,b)=>a[0].localeCompare(b[0])).map(([key,rows])=>{
  let at80=0,at120=0,first80=0,first120=0,converted=0;
  for(const g of rows){
    const w80=g.plies<=80?g.winner:g.winnerAt80;
    if(w80!==null){at80++;first80+=Number(w80===g.starter);}
    if(g.winner!==null){at120++;first120+=Number(g.winner===g.starter);}
    if(w80===null&&g.winner!==null)converted++;
  }
  return {board:key.split("-")[0],policy:key.split("-")[1],games:rows.length,decided80:at80,decided120:at120,convertedAfter80:converted,undecided80:rows.length-at80,undecided120:rows.length-at120,firstSeatWinRate80:at80?first80/at80:null,firstSeatWinRate120:at120?first120/at120:null};
});
const total=summary.reduce((a,b)=>a+b.games,0);
if(total!==25000)throw Error("Expected 25000 games, found "+total);
fs.mkdirSync("reports",{recursive:true});
fs.writeFileSync("reports/tactics-120-comparison.json",JSON.stringify({shards:50,totalGames:total,summary},null,2)+"\n");
console.log(JSON.stringify({shards:50,totalGames:total,summary},null,2));
