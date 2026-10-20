// Experimental layouts only. Not added to the production LAYOUTS menu.
// Odd star totals on even-width boards require orientation-paired layouts.
import { actions } from "../src/engine.js";

export const CANDIDATES = Object.freeze([
  {size:8, stars:7, target:4, walls:10},
  {size:9, stars:9, target:5, walls:12},
  {size:10, stars:11, target:6, walls:14},
]);
export const rotate = (cell,size) => size*size-1-cell;
function rng(seed) {
  let s=seed>>>0;
  return ()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296;};
}
function shuffle(xs,random) {
  for(let i=xs.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[xs[i],xs[j]]=[xs[j],xs[i]];}
  return xs;
}
function symmetricSet(size,count,used,random) {
  const mid=(size*size-1)/2;
  const result=[];
  if(count%2) {
    if(!Number.isInteger(mid)||used.has(mid))return null;
    result.push(mid);used.add(mid);
  }
  const pairs=shuffle(Array.from({length:Math.floor(size*size/2)},(_,i)=>[i,rotate(i,size)]),random);
  for(const [a,b] of pairs){
    if(result.length>=count)break;
    if(used.has(a)||used.has(b))continue;
    result.push(a,b);used.add(a);used.add(b);
  }
  return result.length===count?result:null;
}
export function makeCandidate({size,stars,target,walls},seed=1){
  if(![8,9,10].includes(size)||stars!==2*target-1||!Number.isInteger(walls)||walls<0||walls>size*size-stars-2)throw Error("Invalid candidate");
  const random=rng(seed),players=[size*(size-1),size-1],used=new Set(players);
  let starCells,wallCells;
  if(size%2===1){
    starCells=symmetricSet(size,stars,used,random);
    wallCells=starCells&&symmetricSet(size,walls,used,random);
  }else{
    // On an even board an odd number of stars cannot be centrosymmetric.
    // Construct an asymmetric layout AND its 180-degree-rotated partner.
    const free=shuffle(Array.from({length:size*size},(_,i)=>i).filter(x=>!used.has(x)),random);
    starCells=free.slice(0,stars);
    wallCells=free.slice(stars,stars+walls);
  }
  if(!starCells||!wallCells)throw Error("Could not generate layout");
  const state={size,target,walls:wallCells,stars:starCells,players,scores:[0,0],turn:0,ply:0,winner:null};
  if(!actions(state).length||!actions({...state,turn:1}).length)throw Error("No legal opening");
  return state;
}
export function rotatedPartner(s) {
  const size=s.size;
  return {...s,walls:s.walls.map(x=>rotate(x,size)),stars:s.stars.map(x=>rotate(x,size)),players:s.players.map(x=>rotate(x,size))};
}
export function geometryVariants(s) {
  return s.size%2===0?[s,rotatedPartner(s)]:[s];
}
