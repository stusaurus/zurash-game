import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,actions,apply,successors,key} from '../src/engine.js';
import {choose,seeded} from '../src/ai.js';
import {actions as oldActions} from '../scripts/reference/engine-v1.js';
import {choose as preRouteChoose} from '../scripts/reference/ai-pre-route.js';
import {choose as oldChoose} from '../scripts/reference/ai-v1.js';
test('search successors equal validated actions, including terminal states; no input mutation',()=>{
  for(let layout=0;layout<3;layout++){
    let s=initial(layout),rng=seeded(72+layout);
    for(let ply=0;ply<40&&s.winner===null;ply++){
      const before=structuredClone(s),legal=actions(s),next=successors(s);
      assert.deepEqual(legal,oldActions(s));
      assert.deepEqual(next.map(c=>c.a),legal);
      next.forEach(c=>assert.deepEqual(c.n,apply(s,c.a)));
      assert.deepEqual(s,before);s=next[Math.floor(rng()*next.length)].n;
    }
  }
  const s={walls:[],stars:[6],players:[0,48],scores:[2,2],turn:0,ply:5,winner:null};
  const win=successors(s).find(c=>c.n.winner===0).n;
  assert.deepEqual(successors(win),[]);
  assert.throws(()=>apply(win,{wall:null,dir:1}));
});
test('normal and archived optimized CPU preserve old choices over reachable corpus and histories',()=>{
  for(let layout=0;layout<3;layout++){
    let s=initial(layout),history=new Map(),rng=seeded(123+layout);
    for(let ply=0;ply<16&&s.winner===null;ply++){
      history.set(key(s),3);
      for(const level of ['greedy','search','strong']){
        assert.deepEqual((level==='strong'?preRouteChoose:choose)(s,{level,rng:seeded(ply+7),seen:history}),oldChoose(s,{level,rng:seeded(ply+7),seen:history}));
      }
      s=apply(s,choose(s,{level:'greedy',rng}));
    }
  }
});
