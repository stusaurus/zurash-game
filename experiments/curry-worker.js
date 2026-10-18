import {chooseCurry} from "./curry-ai.js";
import {seeded} from "../src/ai.js";
import {turnSeed} from "../src/cpu-seed.js";
self.onmessage=({data})=>{
 const {id,state,history,seed,level}=data;
 try{
  const action=chooseCurry(state,{level,seen:new Map(history),
   rng:seeded(turnSeed(seed,state.ply))});
  self.postMessage({id,action});
 }catch(e){self.postMessage({id,error:String(e)});}
};
