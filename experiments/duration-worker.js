import {chooseDuration} from "./duration-ai.js";
import {seeded} from "../src/ai.js";
import {turnSeed} from "../src/cpu-seed.js";
self.onmessage=({data})=>{
 const {id,state,seen,seed}=data;
 try{
  const action=chooseDuration(state,{
   seen:new Map(seen),rng:seeded(turnSeed(seed,state.ply)),level:"search"
  });
  self.postMessage({id,action});
 }catch(e){self.postMessage({id,error:String(e)});}
};
