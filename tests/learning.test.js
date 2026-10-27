import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initial,actions,apply,key} from '../src/engine.js';
import {choose,seeded} from '../src/ai.js';
import {freshLearning,validateLearning,openLearning,learningContext,learningFeature,learnWeight,LEARNING_KEY} from '../src/learning.js';
import {turnSeed} from '../src/cpu-seed.js';
import {choose as previousChoose} from './reference/ai-before-learning.js';

const storage = () => { const data=new Map(); return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}; };
const legal = (s,a) => actions(s).some(x=>JSON.stringify(x)===JSON.stringify(a));

// Reused from PR #18: cold starts must match both choice and RNG position.
test('cold and other-board learning match greedy and its RNG on 7×7 and A–E',()=>{
  for(const layout of [0,4,5,6,7,8]) for(const starter of [0,1]) {
    const state=initial(layout,starter), history=new Map([[key(state),2]]);
    for(const model of [null,freshLearning(),{...freshLearning(),samples:80,contexts:{'99x99:9:0':Array(16).fill(5)}}]) {
      const a=seeded(41),b=seeded(41),before=choose(state,{level:'greedy',rng:a,seen:history});
      const after=choose(state,{level:'learning',rng:b,seen:history,opponentModel:model});
      assert.deepEqual(after,before);assert.equal(a(),b());assert.ok(legal(state,after));
    }
  }
});

test('PR #18 directional profiles alter legal choices as recorded',()=>{
  const f=JSON.parse(readFileSync(new URL('./fixtures/learning-adaptation-pr18.json',import.meta.url)));
  const choices=f.profiles.map(opponentModel=>choose(f.state,{level:'learning',opponentModel,rng:seeded(41)}));
  assert.deepEqual(choices,f.choices);assert.ok(new Set(choices.map(JSON.stringify)).size>1);
  for(const action of choices) assert.ok(legal(f.state,action));
});

test('learned CPU returns legal moves on all boards and target/size history is isolated',()=>{
  for(const layout of [0,4,5,6,7,8]) {
    const state=initial(layout),context=learningContext(state),counts=Array(16).fill(1);
    const model={...freshLearning(),samples:16,contexts:{[context]:counts}};
    assert.ok(legal(state,choose(state,{level:'learning',opponentModel:model,rng:seeded(9)})));
    const other={...state,target:(state.target??3)+1},a=seeded(18),b=seeded(18);
    assert.deepEqual(choose(other,{level:'learning',opponentModel:model,rng:a}),choose(other,{level:'greedy',rng:b}));
    assert.equal(a(),b());
    const sparse={...freshLearning(),samples:81,contexts:{[context]:[1,...Array(15).fill(0)],'99x99:9:0':Array(16).fill(5)}};
    const c=seeded(19),d=seeded(19);
    assert.deepEqual(choose(state,{level:'learning',opponentModel:sparse,rng:c}),choose(state,{level:'greedy',rng:d}));assert.equal(c(),d());
  }
});

test('record human moves and completed results once; unresolved only by explicit confirmation',()=>{
  const disk=storage(),store=openLearning(disk),s=initial(),a=actions(s)[0],next=apply(s,a);
  const session=store.beginMatch({id:'game_1',mode:'cpu'});
  assert.equal(session.observe(s,{wall:null,dir:99}),false);assert.equal(session.observe(s,a),true);assert.equal(session.observe(next,actions(next)[0]),false);
  assert.equal(disk.data.size,0);assert.equal(session.finish(next),false);
  assert.equal(session.finish({...next,winner:0}),true);assert.equal(session.finish({...next,winner:0}),false);
  const again=openLearning(disk);assert.equal(again.beginMatch({id:'game_1',mode:'cpu'}).finish({...next,winner:0}),false);
  assert.equal(again.model.wins,1);assert.equal(again.model.total,1);assert.equal(again.model.samples,1);
  assert.equal(learnWeight(again.model,s,a,next),2);assert.equal(learningFeature(s,a,next)>=0,true);
  const loss=again.beginMatch({id:'game_2',mode:'cpu'});assert.equal(loss.finish({...s,winner:1}),true);
  const draw=again.beginMatch({id:'game_3',mode:'cpu'});assert.equal(draw.finish(s),false);assert.equal(draw.finish(s,{unresolved:true}),true);
  const local=again.beginMatch({id:'game_4',mode:'local'});assert.equal(local.observe(s,a),false);assert.equal(local.finish({...s,winner:0}),false);
  const abandoned=again.beginMatch({id:'game_5',mode:'cpu'});abandoned.observe(s,a);abandoned.discard();assert.equal(abandoned.finish({...s,winner:0}),false);
  assert.deepEqual([again.model.wins,again.model.losses,again.model.draws,again.model.total,again.model.samples],[1,1,1,3,1]);
  assert.equal(again.reset(),true);assert.equal(disk.data.has(LEARNING_KEY),false);assert.deepEqual(openLearning(disk).model,freshLearning());
});

test('reset invalidates pending sessions and undo removes observations',()=>{
  const store=openLearning(storage()),s=initial(),a=actions(s)[0], session=store.beginMatch({id:'undo',mode:'cpu'});
  session.observe(s,a);session.undo();assert.equal(session.finish({...s,winner:0}),true);assert.equal(store.model.samples,0);
  const pending=store.beginMatch({id:'stale',mode:'cpu'});pending.observe(s,a);store.reset();assert.equal(pending.finish({...s,winner:0}),false);assert.equal(store.model.total,0);
});

test('corruption, unavailable storage, and legacy data are handled safely',()=>{
  const s=initial(),data=storage();data.data.set(LEARNING_KEY,'{broken');
  const corrupt=openLearning(data);assert.ok(corrupt.warning);assert.equal(corrupt.beginMatch({id:'x',mode:'cpu'}).finish({...s,winner:0}),true);assert.equal(data.data.get(LEARNING_KEY),'{broken');
  const fail=openLearning({getItem:()=>null,setItem:()=>{throw Error('quota');},removeItem:()=>{throw Error('blocked');}});
  assert.equal(fail.beginMatch({id:'x',mode:'cpu'}).finish({...s,winner:1}),true);assert.ok(fail.warning);assert.equal(fail.reset(),false);
  assert.throws(()=>validateLearning({...freshLearning(),samples:1}));assert.throws(()=>validateLearning({...freshLearning(),total:1}));
  data.data.set(LEARNING_KEY,JSON.stringify({version:1,wins:2,losses:3,samples:0,contexts:{}}));assert.equal(openLearning(data).model.total,5);
  const a=seeded(3),b=seeded(3);assert.deepEqual(choose(s,{level:'learning',opponentModel:{contexts:{broken:1}},rng:a}),choose(s,{level:'greedy',rng:b}));assert.equal(a(),b());
});

test('worker passes learning model and existing levels preserve same seeded choices',async()=>{
  const oldSelf=globalThis.self;let result;globalThis.self={postMessage:data=>{result=data;}};
  try {
    await import('../src/cpu-worker.js');
    for(const layout of [0,4,5,6,7,8]) for(const level of ['random','greedy','search','strong','learning']) {
      const state=initial(layout),history=[[key(state),1]],seed=94;
      const context=learningContext(state),model={...freshLearning(),samples:16,contexts:{[context]:Array(16).fill(1)}};
      self.onmessage({data:{id:1,state,history,seed,level,opponentModel:model}});
      assert.equal(result.error,undefined);assert.ok(legal(state,result.action));
      assert.deepEqual(result.action,choose(state,{level,opponentModel:model,seen:new Map(history),rng:seeded(turnSeed(seed,state.ply))}));
    }
  } finally {if(oldSelf===undefined)delete globalThis.self;else globalThis.self=oldSelf;}
});

// Snapshot from PR #42; compare both choice and subsequent random value.
test('all four existing levels match PR #42 with identical seed and history',()=>{
  for (const layout of [0,4,5,6,7,8]) for (const level of ['random','greedy','search','strong']) {
    const state=initial(layout),seen=new Map([[key(state),2]]),a=seeded(77),b=seeded(77);
    assert.deepEqual(choose(state,{level,rng:a,seen}),previousChoose(state,{level,rng:b,seen}));
    assert.equal(a(),b());
  }
});
