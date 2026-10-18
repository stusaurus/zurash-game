import fs from 'node:fs';import {initial,apply,actions,key,LAYOUTS} from '../src/engine.js';import {choose,seeded} from '../src/ai.js';
const pairs=Number(process.env.PAIRS||6),limit=160,results=[];
for(let layout=0;layout<3;layout++)for(const matchup of [['random','random'],['greedy','greedy'],['search','search'],['search','greedy'],['greedy','random']]){
 const row={layout:LAYOUTS[layout].name,matchup:matchup.join('/'),games:0,firstWins:0,secondWins:0,capped:0,repeated:0,noLegal:0,plies:[],wallMoves:0,skips:0,captures:0,options:[],agentAWins:0};
 for(let pair=0;pair<pairs;pair++)for(let swap=0;swap<2;swap++){
  const policies=matchup;const starter=swap;let s=initial(layout,starter),seen=new Map(),rep=false;const rng=seeded(701+pair*131+layout*977);let ply=0;
  for(;ply<limit&&s.winner===null;ply++){const k=key(s);seen.set(k,(seen.get(k)||0)+1);if(seen.get(k)>=3)rep=true;const legal=actions(s);row.options.push(legal.length);if(!legal.length){row.noLegal++;break;}const a=choose(s,{level:policies[s.turn],rng,seen,beam:6});if(a.wall)row.wallMoves++;else row.skips++;const before=s.stars.length;s=apply(s,a);row.captures+=before-s.stars.length;}
  row.games++;row.plies.push(ply);if(rep)row.repeated++;if(s.winner===null)row.capped++;else{if(s.winner===starter)row.firstWins++;else row.secondWins++;const aPlayer=0;if(s.winner===aPlayer)row.agentAWins++;}
 }
 row.meanPlies=+(row.plies.reduce((a,b)=>a+b,0)/row.games).toFixed(1);row.maxPlies=Math.max(...row.plies);row.minPlies=Math.min(...row.plies);row.meanOptions=+(row.options.reduce((a,b)=>a+b,0)/row.options.length).toFixed(1);delete row.options;results.push(row);console.log(JSON.stringify(row));
}
const report={date:new Date().toISOString(),pairs,limit,search:'two-ply minimax, beam=6, all replies, fixed seed; UI beam=8',method:'For each pair, agents keep their starting cells and swap initiative: agent A starts once and follows once; layouts are rotationally symmetric. Same layout and paired PRNG seed. Fixed layout, no random setup. Capped games are measurement stops, not in-game draws.',results};fs.writeFileSync('reports/balance.json',JSON.stringify(report,null,2)+'\n');
