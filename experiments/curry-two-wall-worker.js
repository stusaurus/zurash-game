import {chooseTwoWall} from "./curry-two-wall-ai.js";
import {seeded} from "../src/ai.js";
import {turnSeed} from "../src/cpu-seed.js";
self.onmessage=({data})=>{
 const {id,state,history,seed,level}=data;
 try{
  const action=chooseTwoWall(state,{rng:seeded(turnSeed(seed,state.ply)),
   seen:new Map(history),level});
  self.postMessage({id,action});
 }catch(err){self.postMessage({id,error:String(err)});}
};
