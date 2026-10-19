// EXPERIMENT ONLY: orient both seats identically for deterministic CPU studies.
// Compare the default search agent to an orientation-normalized copy; neither
// is a proof of rule fairness or a production AI change.
import {chooseTwoWall} from "./curry-two-wall-ai.js";
import {stateKeyCurry} from "./curry-power.js";
const flip=n=>48-n;
export function rotateCurryState(s){
 return {
  ...s,
  walls:s.walls.map(flip),
  stars:s.stars.map(flip),
  players:[flip(s.players[1]),flip(s.players[0])],
  scores:[s.scores[1],s.scores[0]],turn:1-s.turn,
  winner:s.winner===null?null:1-s.winner,
  curries:s.curries.map(flip),
  powers:[s.powers[1],s.powers[0]],
 };
}
export function rotateTwoWallAction(a){
 if(a===null)return null;
 // Preserve property insertion order from existing valid actions:
 // one-wall actions have {wall,dir,secondWall}, two-wall actions have
 // {wall,secondWall,dir}. The UI and research matcher serialize them.
 return Object.fromEntries(Object.entries(a).map(([field,value])=>{
  if(field==="dir")return [field,(value+2)%4];
  if(value===null)return [field,null];
  return [field,{wall:value.wall,to:flip(value.to)}];
 }));
}
export function rotateCurryHistory(seen){
 const out=new Map();
 for(const [k,n] of seen){
  const [walls,stars,players,scores,turn,curries,powers]=JSON.parse(k);
  const state={walls,stars,players,scores,turn,curries,powers,winner:null};
  const rotated=stateKeyCurry(rotateCurryState(state));
  out.set(rotated,(out.get(rotated)||0)+n);
 }
 return out;
}
export function chooseOrientationFairTwoWall(s,{level="search",rng=Math.random,seen=new Map()}={}){
 if(s.turn===0)return chooseTwoWall(s,{level,rng,seen});
 const rotated=rotateCurryState(s);
 const action=chooseTwoWall(rotated,{level,rng,seen:rotateCurryHistory(seen)});
 return rotateTwoWallAction(action);
}
