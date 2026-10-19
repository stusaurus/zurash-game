// Isolated 5/10-minute *target* laboratory. 7x7 and 9x9 share the
// same core wall->slide->star rules; duration is measured, NOT guaranteed.
// This does not modify src/engine.js or the existing curry comparison page.
export const DIRECTIONS=[
  {dx:0,dy:-1,label:"上",symbol:"↑"},
  {dx:1,dy:0,label:"右",symbol:"→"},
  {dx:0,dy:1,label:"下",symbol:"↓"},
  {dx:-1,dy:0,label:"左",symbol:"←"},
];
export const MODES={
  quick7:{
    id:"quick7",name:"5分候補 · 7×7",subtitle:"星3個先取・シンプル対戦",
    size:7,target:3,players:[42,6],
    walls:[8,10,12,22,26,36,38,40],
    stars:[3,17,24,31,45],curries:[21,27],
    targetMinutes:5,
  },
  deep7:{
    id:"deep7",name:"10分候補 · 7×7",subtitle:"星4個先取・今の盤でじっくり",
    size:7,target:4,players:[42,6],
    walls:[8,10,12,22,26,36,38,40],
    stars:[3,17,21,24,27,31,45],curries:[5,43],
    targetMinutes:10,
  },
  wide9:{
    id:"wide9",name:"10分候補 · 9×9",subtitle:"星4個先取・12枚の壁",
    size:9,target:4,players:[72,8],
    walls:[10,14,20,24,28,32,48,52,56,60,66,70],
    stars:[4,22,30,40,50,58,76],curries:[25,55],
    targetMinutes:10,
  },
};
export function validatePreset(p){
 if(!p||![7,9].includes(p.size))throw Error("unsupported board size");
 const n=p.size*p.size,occupied=[...p.players,...p.walls,...p.stars,...p.curries];
 if(p.players.length!==2||p.target<3||p.target>p.stars.length||
    p.stars.length%2!==1||p.walls.length%2!==0||
    occupied.some(x=>!Number.isInteger(x)||x<0||x>=n)||
    new Set(occupied).size!==occupied.length)throw Error("invalid initial positions");
 const symmetrical=a=>a.every(x=>a.includes(n-1-x));
 if(!symmetrical(p.walls)||!symmetrical(p.stars)||!symmetrical(p.curries)||
    p.players[0]+p.players[1]!==n-1)throw Error("opening is not rotationally symmetric");
}
for(const p of Object.values(MODES))validatePreset(p);
export function initialDuration(id="quick7",curryEnabled=true,starter=0){
 const p=MODES[id];if(!p)throw Error("unknown duration mode");
 if(![0,1].includes(starter))throw Error("invalid first player");
 return {
  id:p.id,size:p.size,target:p.target,
  walls:[...p.walls],stars:[...p.stars],players:[...p.players],
  curries:curryEnabled?[...p.curries]:[],powers:[0,0],
  scores:[0,0],winner:null,ply:0,turn:starter,
 };
}
export function stepAt(pos,dir,size){
 const x=pos%size+DIRECTIONS[dir].dx;
 const y=Math.floor(pos/size)+DIRECTIONS[dir].dy;
 return x<0||y<0||x>=size||y>=size?null:y*size+x;
}
export function slideAt(s,player,dir){
 let p=s.players[player],next;
 while((next=stepAt(p,dir,s.size))!==null &&
       !s.walls.includes(next) && next!==s.players[1-player]){
  p=next;
 }
 return p;
}
function mobility(s,p){
 for(let dir=0;dir<4;dir++)if(slideAt(s,p,dir)!==s.players[p])return true;
 return false;
}
export function possibleShifts(s,blockedWall=null){
 if(s.winner!==null)return [];
 const blocked=new Set([...s.walls,...s.players,...s.stars,...s.curries]);
 const result=[];
 for(let wall=0;wall<s.walls.length;wall++){
  if(wall===blockedWall)continue;
  for(let d=0;d<4;d++){
   const to=stepAt(s.walls[wall],d,s.size);
   if(to===null||blocked.has(to))continue;
   const walls=s.walls.slice();walls[wall]=to;
   const moved={...s,walls};
   if(!mobility(moved,0)||!mobility(moved,1))continue;
   result.push({wall,to});
  }
 }
 return result;
}
function shiftUnchecked(s,a){
 if(a===null)return s;
 const walls=s.walls.slice();walls[a.wall]=a.to;
 return {...s,walls};
}
function slideChoices(s){
 const moves=[];
 for(let dir=0;dir<4;dir++){
  const to=slideAt(s,s.turn,dir);
  if(to===s.players[s.turn])continue;
  const players=s.players.slice();players[s.turn]=to;
  const after={...s,players};
  if(mobility(after,0)&&mobility(after,1))moves.push({dir,to});
 }
 return moves;
}
function finishTurn(original,after,action,to){
 const p=original.turn;
 const gotStar=original.stars.includes(to);
 const gotCurry=original.curries.includes(to);
 const scores=original.scores.slice();
 if(gotStar)scores[p]++;
 const players=original.players.slice();players[p]=to;
 const powers=original.powers.slice();
 powers[p]=gotCurry?1:0;
 const winner=scores[p]>=original.target?p:null;
 const next={
  ...original,
  walls:after.walls.slice(),
  stars:gotStar?original.stars.filter(v=>v!==to):original.stars.slice(),
  curries:gotCurry?original.curries.filter(v=>v!==to):original.curries.slice(),
  players,scores,powers,winner,turn:winner===null?1-p:p,ply:original.ply+1,
 };
 return {
  a:action,n:next,pickedCurry:gotCurry,gotStar,boosted:Boolean(action.secondWall),
 };
}
export function successorsDuration(s){
 if(s.winner!==null)return [];
 const moves=[];
 const powered=s.powers[s.turn]===1;
 for(const first of [null,...possibleShifts(s)]){
  const once=shiftUnchecked(s,first);
  // Zero/one shifted wall are always available, even on a power turn.
  for(const m of slideChoices(once)){
   moves.push(finishTurn(s,once,{wall:first,secondWall:null,dir:m.dir},m.to));
  }
  if(!powered||first===null)continue;
  for(const second of possibleShifts(once,first.wall)){
   const twice=shiftUnchecked(once,second);
   for(const m of slideChoices(twice)){
    moves.push(finishTurn(s,twice,{wall:first,secondWall:second,dir:m.dir},m.to));
   }
  }
 }
 return moves;
}
export function stateKeyDuration(s){
 return JSON.stringify([
  s.id,[...s.walls].sort((a,b)=>a-b),[...s.stars].sort((a,b)=>a-b),
  s.players,s.scores,s.turn,[...s.curries].sort((a,b)=>a-b),s.powers,
 ]);
}
export function rotationDuration(s){
 const f=x=>s.size*s.size-1-x;
 return {...s,walls:s.walls.map(f),stars:s.stars.map(f),
  curries:s.curries.map(f),
  players:[f(s.players[1]),f(s.players[0])],
  scores:[s.scores[1],s.scores[0]],powers:[s.powers[1],s.powers[0]],
  turn:1-s.turn,winner:s.winner===null?null:1-s.winner};
}
