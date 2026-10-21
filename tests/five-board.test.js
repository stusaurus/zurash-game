import test from 'node:test';
import assert from 'node:assert/strict';
import {generate,MODES,FAMILIES} from '../scripts/board-generator.js';
import {initial,actions,apply,successors} from '../src/engine.js';
import {captureRoutes} from '../src/route-ai.js';
import {newGame,advanceGame} from '../scripts/tactics-completion.js';
for(const [id,size] of MODES)test(`${id}: reproducible geometric proposals and route oracle`,()=>{
 for(const family of FAMILIES){const spec={id,size,stars:5,target:3,walls:Math.round(size*size*.12),family,seed:237};let c; for(let k=0;k<100;k++){spec.seed=237+k;try{c=generate(spec);break;}catch(e){assert.throws(()=>generate(spec));}} assert.ok(c, 'accepted proposal in family '+family);assert.deepEqual(generate(spec),c);const s=c.state;
 assert.equal(new Set([...s.players,...s.walls,...s.stars]).size,s.players.length+s.walls.length+s.stars.length);
 for(const p of [0,1]){const expected=new Set(successors({...s,turn:p}).filter(c=>c.n.scores[p]>0).map(c=>c.n.players[p]));assert.deepEqual(new Set(captureRoutes(s,p).keys()),expected);}
 assert.ok(actions(s).length);assert.equal(apply(s,actions(s)[0]).turn,1);
 }
});
test('Sprint configuration remains fixed',()=>{for(let i=0;i<3;i++){const s=initial(i);assert.deepEqual([s.size,s.stars.length,s.walls.length,s.target],[7,5,8,3]);}});
test('split completion preserves AI and RNG state',()=>{
 const s=generate({id:'D',size:6,stars:5,target:3,walls:5,family:'rotation',seed:19}).state;
 const g=newGame(s,{seed:71,policies:['star','star']});const opts={timeBudgetMs:30000};
 const one=advanceGame(g,{...opts,maxPlies:30});const split=advanceGame(advanceGame(g,{...opts,maxPlies:12}),{...opts,maxPlies:30});
 assert.deepEqual(split.history,one.history);assert.deepEqual(split.rngStates,one.rngStates);assert.deepEqual(split.state,one.state);
});
test('invalid proposals fail closed',()=>assert.throws(()=>generate({id:'A',size:8,stars:6,target:3,walls:10,family:'rotation',seed:1})));
test('all five fixtures conserve stars, enforce target and support both starters',async()=>{
 const {RESEARCH_LAYOUTS}=await import('../src/research-layouts.js');
 for(let i=0;i<RESEARCH_LAYOUTS.length;i++)for(const starter of [0,1]){
  let s=initial(i+4,starter);const original=structuredClone(s);const total=s.stars.length;
  for(let k=0;k<100&&s.winner===null;k++){
   const options=actions(s);assert.ok(options.length);s=apply(s,options[(k*17+starter)%options.length]);
   assert.equal(s.stars.length+s.scores[0]+s.scores[1],total);
   assert.equal(new Set([...s.walls,...s.stars,...s.players]).size,s.walls.length+s.stars.length+2);
   if(s.winner!==null)assert.equal(s.scores[s.winner],s.target);
  }
  assert.deepEqual(initial(i+4,starter),original);
 }
});
