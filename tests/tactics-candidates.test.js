import test from "node:test";
import assert from "node:assert/strict";
import {actions,apply} from "../src/engine.js";
import {CANDIDATES,makeCandidate,geometryVariants,rotate} from "../scripts/tactics-candidates.js";

test("Tactics candidates are reproducible, in bounds, disjoint and playable",()=>{
  for(const config of CANDIDATES){
    const s=makeCandidate(config,1);
    assert.deepEqual(s,makeCandidate(config,1));
    assert.equal(s.stars.length,2*s.target-1);
    assert.equal(s.walls.length,config.walls);
    const occupied=[...s.walls,...s.stars,...s.players];
    assert.equal(new Set(occupied).size,occupied.length);
    assert.ok(occupied.every(x=>Number.isInteger(x)&&x>=0&&x<s.size*s.size));
    for(const variant of geometryVariants(s)){
      for(const starter of [0,1]){
        const n={...variant,turn:starter};
        const legal=actions(n);
        assert.ok(legal.length>0,`no legal opening ${s.size} starter ${starter}`);
        const next=apply(n,legal[0]);
        assert.equal(next.ply,1);
      }
    }
  }
});
test("9x9 is centrosymmetric; even board candidates have rotated partners",()=>{
  for(const config of CANDIDATES){
    const s=makeCandidate(config,1);
    const variants=geometryVariants(s);
    const sorted=a=>[...a].sort((x,y)=>x-y);
    if(s.size%2){
      assert.equal(variants.length,1);
      for(const list of [s.walls,s.stars,s.players])
        assert.deepEqual(sorted(list),sorted(list.map(x=>rotate(x,s.size))));
    }else{
      assert.equal(variants.length,2);
      for(const type of ["walls","stars","players"])
        assert.deepEqual(variants[1][type],s[type].map(x=>rotate(x,s.size)));
    }
  }
});
