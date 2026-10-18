import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {initial,apply,key,LAYOUTS} from '../src/engine.js';
import {seeded} from '../src/ai.js';
import {turnSeed} from '../src/cpu-seed.js';
import {experimental} from './experimental-policies.js';
const pairs=Number(process.env.PAIRS??100),cap=Number(process.env.MAX_PLIES??120);
const matchups=(process.env.MATCHUPS??'random/random,greedy/greedy,defensive/greedy,defensive/defensive,greedy/random').split(',').map(x=>x.split('/'));
const out=process.env.REPORT??'reports/strategy-light.json';
const seedOffset=Number(process.env.SEED_OFFSET??0);
const rngMode=process.env.RNG_MODE??"stream";
if(!["stream","worker"].includes(rngMode))throw Error("Invalid RNG_MODE");
const layoutIds=(process.env.LAYOUT_IDS??'0,1,2').split(',').map(Number);
if(!layoutIds.length||new Set(layoutIds).size!==layoutIds.length||layoutIds.some(x=>!Number.isInteger(x)||x<0||x>=LAYOUTS.length))throw Error('Invalid LAYOUT_IDS');
if(!Number.isInteger(seedOffset)||seedOffset<0)throw Error('Invalid SEED_OFFSET');
if(!Number.isInteger(pairs)||pairs<1||pairs>500||!Number.isInteger(cap)||cap<1||cap>500||matchups.some(m=>m.length!==2||m.some(x=>!['random','greedy','search','strong','defensive','planner','route','route-progress','legacy-strong','route-mix'].includes(x)))) throw Error('Invalid experiment parameters');
const percentile=(a,q)=>a.length?[...a].sort((a,b)=>a-b)[Math.max(0,Math.ceil(a.length*q)-1)]:null;
const stats=a=>({n:a.length,mean:a.length?a.reduce((a,b)=>a+b,0)/a.length:null,median:percentile(a,.5),p90:percentile(a,.9),max:a.length?Math.max(...a):null});
function interval(games) {
  const paired=Array.from({length:pairs},(_,i)=>games.filter(g=>g.pair===i));
  const rng=seeded(9917), rates=[];
  for(let b=0;b<3000;b++) {
    let wins=0,decided=0;
    for(let j=0;j<pairs;j++) for(const g of paired[Math.floor(rng()*pairs)]) {
      if(g.winner!==null){decided++;wins+=g.winner===g.starter;}
    }
    if(decided)rates.push(wins/decided);
  }
  return [percentile(rates,.025),percentile(rates,.975)];
}
const canonicalAction=(a,starter)=>JSON.stringify([a.wall?(starter===0?a.wall.to:48-a.wall.to):null,(a.dir+(starter?2:0))%4]);
const canonicalState=(s,starter)=>key(starter===0?s:{...s,walls:s.walls.map(x=>48-x),stars:s.stars.map(x=>48-x),players:[48-s.players[1],48-s.players[0]],scores:[s.scores[1],s.scores[0]],turn:1-s.turn});
const rows=[], started=Date.now();
const fd=fs.openSync(out.replace('.json','.jsonl'),'w');
for(const layout of layoutIds) for(const policies of matchups){
  const games=[];
  for(let pair=0;pair<pairs;pair++) for(let starter=0;starter<2;starter++){
    const seed=seedOffset+173+pair*307+layout*791,rng=seeded(seed),seen=new Map();
    let s=initial(layout,starter),firstStar=null,quiet=0,maxQuiet=0,tied=false;
    const record=[],opening=[],states=[],latency=[],trailing=[false,false];
    let wallMoves=0,repeated=false,noLegal=false;
    while(s.winner===null&&s.ply<cap){
      const k=key(s);seen.set(k,(seen.get(k)||0)+1);repeated||=seen.get(k)>=3;
      const now=performance.now();const a=experimental(s,{level:policies[s.turn],rng:rngMode==="worker"?seeded(turnSeed(seed,s.ply)):rng,seen});latency.push(performance.now()-now);
      if(!a){noLegal=true;break;}
      if(a.wall)wallMoves++;
      if(s.ply<6)opening.push(canonicalAction(a,starter));
      const n=apply(s,a);record.push(a);
      if(n.stars.length<s.stars.length){firstStar??=n.ply;maxQuiet=Math.max(maxQuiet,quiet);quiet=0;}else quiet++;
      for(let p=0;p<2;p++) trailing[p]||=n.scores[p]<n.scores[1-p];
      tied||=n.scores[0]===2&&n.scores[1]===2;
      s=n;if(s.ply<=6)states.push(canonicalState(s,starter));
    }
    const g={layout,pair,seed,starter,policies,winner:s.winner,capped:s.winner===null,plies:s.ply,scores:s.scores,firstStar,wallMoves,skips:s.ply-wallMoves,repeated,noLegal,tiedAtTwo:tied,comeback:s.winner!==null&&trailing[s.winner],maxQuiet:Math.max(maxQuiet,quiet),opening,openingStates:states,latency:stats(latency)};
    fs.writeSync(fd,JSON.stringify({...g,actions:record,final:s})+'\n');games.push(g);
  }
  const decided=games.filter(g=>g.winner!==null),firstWins=decided.filter(g=>g.winner===g.starter).length;
  const row={layout,name:LAYOUTS[layout].name,policies:policies.join('/'),games:games.length,firstWins,secondWins:decided.length-firstWins,agent0Wins:decided.filter(g=>g.winner===0).length,capped:games.length-decided.length,decidedFirstRate:decided.length?firstWins/decided.length:null,pairedBootstrap95:interval(games),initiativeRateBounds:[firstWins/games.length,(firstWins+games.length-decided.length)/games.length],decidedPlies:stats(decided.map(g=>g.plies)),observedPlies:stats(games.map(g=>g.plies)),firstStar:stats(games.flatMap(g=>g.firstStar===null?[]:[g.firstStar])),scoreGap:stats(decided.map(g=>Math.abs(g.scores[0]-g.scores[1]))),tiedAtTwo:games.filter(g=>g.tiedAtTwo).length,comebacks:games.filter(g=>g.comeback).length,wallMoves:games.reduce((n,g)=>n+g.wallMoves,0),skips:games.reduce((n,g)=>n+g.skips,0),repeatedGames:games.filter(g=>g.repeated).length,noLegal:games.filter(g=>g.noLegal).length,longGames60:games.filter(g=>g.plies>=60).length,stalled20:games.filter(g=>g.maxQuiet>=20).length,canonicalFirstChoices:new Set(games.map(g=>g.opening[0])).size,canonicalSixPlyLines:new Set(games.map(g=>g.opening.join('|'))).size,canonicalSixPlyStates:new Set(games.map(g=>g.openingStates.at(-1))).size};
  rows.push(row);console.log(JSON.stringify({...row,gamesData:undefined}));
}
fs.closeSync(fd);
fs.writeFileSync(out.replace('.json','.jsonl.gz'),gzipSync(fs.readFileSync(out.replace('.json','.jsonl'))));
fs.unlinkSync(out.replace('.json','.jsonl'));
fs.writeFileSync(out,JSON.stringify({version:2,sourceCommit:process.env.GITHUB_SHA ?? execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),params:{pairs,cap,matchups,seedOffset,layoutIds,rngMode},notes:'Shared per-game RNG, paired initiative swap; capped is NOT draw. CI resamples seed pairs, conditional on decided games; initiative bounds allocate all capped games to either side. Duration in plies, NOT human minutes. Comeback means winner trailed in score at least once. Canonical openings rotate starter 1 by 180 degrees; wall target plus direction, not wall index. Experimental policies are not deployed.',elapsedSeconds:(Date.now()-started)/1000,totalGames:rows.reduce((a,r)=>a+r.games,0),rows},null,2)+'\n');
console.log('COMPLETE '+out);
