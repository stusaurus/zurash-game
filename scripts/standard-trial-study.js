// Isolated, reproducible evaluation of the proposed standard board.
// No writes to LAYOUTS or production assets; no human-playtime estimates.
import fs from "node:fs";
import assert from "node:assert/strict";
import { initial, actions, apply, successors, key } from "../src/engine.js";
import { choose, seeded, evaluate } from "../src/ai.js";

const OUTPUT = process.env.REPORT ?? "reports/standard-trial-v2.json";
const RECORDS = OUTPUT.replace(/\.json$/, ".jsonl");
const PAIRS = Number(process.env.PAIRS ?? 8);
const CAP = Number(process.env.MAX_PLIES ?? 96);
if (!Number.isInteger(PAIRS) || PAIRS < 1 || PAIRS > 100 ||
    !Number.isInteger(CAP) || CAP < 8 || CAP > 500)
  throw Error("Invalid PAIRS / MAX_PLIES");

const configs = [
  {id:"beginner-7x7-5-star-win3", label:"はじまりの氷原", build:()=>initial(0)},
  {id:"trial-9x9-7-star-win4",label:"9×9 星7／先取4",build:()=>initial(10)},
  {id:"trial-9x9-9-star-win4",label:"9×9 星9／先取4（試遊比較）",build:()=>initial(11)},
  {id:"trial-9x9-9-star-win5",label:"9×9 星9／先取5（主候補）",build:()=>initial(9)},
];
const matchups = [["greedy","greedy"],["random","random"]];
function quantile(vals,q){
  if (!vals.length) return null;
  const a=[...vals].sort((x,y)=>x-y);
  return a[Math.min(a.length-1,Math.ceil(a.length*q)-1)];
}
function numbers(vals){return {count:vals.length,median:quantile(vals,.5),p90:quantile(vals,.9),max:vals.length?Math.max(...vals):null};}
function openingAudit(base,starter){
  const s={...base,turn:starter};
  const children=successors(s), options=children.map(({a,n})=>({a,n,value:evaluate(n,s.turn)}));
  const best=Math.max(...options.map(c=>c.value));
  const near=options.filter(c=>c.value>=best-50);
  return {
    starter,legalActions:options.length,
    distinctWallChoices:new Set(options.map(c=>JSON.stringify(c.a.wall))).size,
    uniqueLandingSquares:new Set(options.map(c=>c.n.players[s.turn])).size,
    immediateScoringMoves:options.filter(c=>c.n.scores[s.turn]>s.scores[s.turn]).length,
    closeHeuristicActions:near.length,
    closeHeuristicWallChoices:new Set(near.map(c=>JSON.stringify(c.a.wall))).size,
    closeHeuristicLandings:new Set(near.map(c=>c.n.players[s.turn])).size,
  };
}
function game(config,policy,pair,starter) {
  const seed=210031+pair*211;
  const random=seeded(seed), seen=new Map();
  const original=config.build();
  let s={...original,turn:starter};
  const moves=[];
  let firstStar=null,maxQuiet=0,quiet=0,repeated=false;
  let lead=0,leadChanges=0,comeback=[false,false],earlyLead=[false,false];
  let wallMoves=0,initialChoice=null;
  while (s.winner===null && s.ply<CAP) {
    const serial=key(s),visits=(seen.get(serial)||0)+1;
    seen.set(serial,visits);
    if(visits>=3) repeated=true;
    const all=actions(s);
    if (!all.length) break;
    const a=choose(s,{level:policy[s.turn],rng:random,seen});
    assert.ok(a,"Policy returned no legal action");
    if(!initialChoice) initialChoice=JSON.stringify([a.wall,a.dir]);
    if(a.wall!==null) wallMoves++;
    const n=apply(s,a);
    const scoreAdded=n.stars.length<s.stars.length;
    if(scoreAdded){firstStar??=n.ply;maxQuiet=Math.max(maxQuiet,quiet);quiet=0;}
    else quiet++;
    if(n.scores[0]!==n.scores[1]){
      const nextLead=Math.sign(n.scores[0]-n.scores[1]);
      if(lead!==0 && lead!==nextLead)leadChanges++;
      lead=nextLead;
      earlyLead[n.scores[0]>n.scores[1]?0:1]=true;
    }
    for(let player=0;player<2;player++)
      comeback[player] ||= n.scores[player]<n.scores[1-player];
    moves.push(a);
    s=n;
  }
  maxQuiet=Math.max(maxQuiet,quiet);
  return {
    id:config.id,policy:policy.join("/"),pair,seed,starter,
    winner:s.winner,winningSide:s.winner===null?null:s.winner===starter?"first":"second",
    plies:s.ply,scores:s.scores,starsLeft:s.stars.length,
    target:s.target??3,firstStar,maxQuiet,repeatObserved:repeated,leadChanges,
    comeback:s.winner!==null&&comeback[s.winner],
    onePointFinish:s.winner!==null && Math.abs(s.scores[0]-s.scores[1])===1,
    wallMoves,firstChoice:initialChoice,finalKey:key(s),moves
  };
}
function replay(record,config){
  let s={...config.build(),turn:record.starter};
  for (const a of record.moves) s=apply(s,a);
  assert.equal(key(s),record.finalKey,"Recorded moves must replay exactly");
  assert.equal(s.winner,record.winner);
  assert.equal(s.ply,record.plies);
  assert.deepEqual(s.scores,record.scores);
}

if(process.argv.includes("--verify")){
  const rows=fs.readFileSync(RECORDS,"utf8").trim().split("\n").map(JSON.parse);
  for(const record of rows) {
    const config=configs.find(c=>c.id===record.id);
    assert.ok(config);
    replay(record,config);
  }
  process.stdout.write("REPLAY VERIFIED: "+rows.length+" legal games\n");
  process.exit(0);
}

fs.mkdirSync("reports",{recursive:true});
fs.writeFileSync(RECORDS,"");
const report={version:1,sourceCommit:process.env.GITHUB_SHA??"local",
  parameters:{pairs:PAIRS,cap:CAP,matchups,seedFormula:"210031 + pair*211",
    pairedStarts:[0,1],pilot:true,policies:"existing production random and greedy"},
  notes:[
    "Exploratory pilot: tiny paired samples, not a proof of balance or enjoyment.",
    "Beginner vs new boards changes size, stars, walls and victory target: not causal.",
    "Nine-star win4 is simulation-only to distinguish star-count from target-count changes.",
    "The 9×9 wall and starting positions are fixed in all three trial conditions.",
    "A capped game is unresolved, never a formal draw.",
    "Heuristic-near moves are approximate AI scores, not proven strategic alternatives.",
    "Number of AI plies does not establish human play duration.",
    "Only one player starts on each side of fixed initial positions: swapping starts is not a full positional fairness test."
  ],
  opening:configs.map(c=>({id:c.id,stars:c.build().stars.length,walls:c.build().walls.length,
    target:c.build().target??3,openings:[0,1].map(starter=>openingAudit(c.build(),starter))})),
  rows:[]};
for(const audit of report.opening) console.log("OPENING_AUDIT "+JSON.stringify(audit));
for(const config of configs){
  for(const matchup of matchups){
    const games=[];
    for(let pair=0;pair<PAIRS;pair++) for(let starter=0;starter<2;starter++){
      const g=game(config,matchup,pair,starter);
      replay(g,config);
      fs.appendFileSync(RECORDS,JSON.stringify(g)+"\n");
      games.push(g);
    }
    const decided=games.filter(g=>g.winner!==null);
    const firstWins=decided.filter(g=>g.winningSide==="first").length;
    const row={
      id:config.id,label:config.label,policy:matchup.join("/"),
      games:games.length,decided:decided.length,undecided:games.length-decided.length,
      firstWins,secondWins:decided.length-firstWins,
      firstWinAmongDecided:decided.length?Number((firstWins/decided.length).toFixed(3)):null,
      firstWinUnresolvedBounds:[firstWins/games.length,(firstWins+games.length-decided.length)/games.length],
      decidedPlies:numbers(decided.map(g=>g.plies)),
      observedPlies:numbers(games.map(g=>g.plies)),
      firstStarPlies:numbers(games.filter(g=>g.firstStar!==null).map(g=>g.firstStar)),
      maxQuiet:numbers(games.map(g=>g.maxQuiet)),
      longQuiet20:games.filter(g=>g.maxQuiet>=20).length,
      repeated:games.filter(g=>g.repeatObserved).length,
      onePointFinishes:decided.filter(g=>g.onePointFinish).length,
      comebacks:decided.filter(g=>g.comeback).length,
      distinctOpenings:new Set(games.map(g=>g.firstChoice)).size,
      totalWallMoves:games.reduce((n,g)=>n+g.wallMoves,0),
      totalActions:games.reduce((n,g)=>n+g.plies,0)
    };
    report.rows.push(row);
    console.log(JSON.stringify(row));
  }
}
fs.writeFileSync(OUTPUT,JSON.stringify(report,null,2)+"\n");
console.log("COMPLETE "+OUTPUT);
