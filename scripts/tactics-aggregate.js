// Aggregate GitHub Actions artifacts from both completed simulation runs.
// Usage: node scripts/tactics-aggregate.js directory-with-extracted-json-files
import fs from "node:fs";
import path from "node:path";
const root=process.argv[2];
if(!root)throw Error("Provide extracted artifact directory");
const files=fs.readdirSync(root,{recursive:true}).filter(x=>String(x).endsWith(".json")&&String(x).includes("tactics-fairness-screen"));
const seen=new Set(),groups=new Map();
for(const f of files){
  const report=JSON.parse(fs.readFileSync(path.join(root,f),"utf8"));
  const shard=report.params?.shard;
  if(!Number.isInteger(shard)||shard<0||shard>49||seen.has(shard))throw Error("Duplicate or invalid shard "+shard);
  seen.add(shard);
  for(const g of report.games){
    const k=g.size+"-"+g.policy;
    if(!groups.has(k))groups.set(k,[]);
    groups.get(k).push(g);
  }
}
if(seen.size!==50)throw Error("Expected 50 distinct shards; found "+seen.size);
const summary=[...groups].sort((a,b)=>a[0].localeCompare(b[0])).map(([key,games])=>{
  const decided=games.filter(x=>!x.capped);
  const firstWins=decided.filter(x=>x.winner===x.starter).length;
  const sorted=decided.map(x=>x.plies).sort((a,b)=>a-b);
  return {board:key.split("-")[0],policy:key.split("-")[1],games:games.length,firstWins,secondWins:decided.length-firstWins,capped:games.length-decided.length,cappedRate:(games.length-decided.length)/games.length,firstSeatWinRateDecided:decided.length?firstWins/decided.length:null,medianDecidedPlies:sorted.length?sorted[Math.floor((sorted.length-1)/2)]:null,stalled20:games.filter(x=>x.longestQuiet>=20).length,repeated:games.filter(x=>x.repeated).length};
});
const totals=summary.reduce((n,x)=>n+x.games,0);
if(totals!==25000)throw Error("Expected 25000 games, found "+totals);
fs.mkdirSync("reports",{recursive:true});
fs.writeFileSync("reports/tactics-25000-summary.json",JSON.stringify({totalGames:totals,shards:seen.size,summary},null,2)+"\n");
console.log(JSON.stringify({totalGames:totals,shards:seen.size,summary},null,2));
