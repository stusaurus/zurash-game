import test from "node:test";
import assert from "node:assert/strict";
import {initialCurry} from "../experiments/curry-power.js";
import {successorsTwoWall} from "../experiments/curry-two-wall.js";

const PLAYED_ACTIONS=[
 {"wall":{"wall":2,"to":11},"dir":1,"secondWall":null},
 {"wall":{"wall":2,"to":18},"dir":3,"secondWall":null},
 {"wall":{"wall":0,"to":7},"dir":3,"secondWall":null},
 {"wall":{"wall":5,"to":35},"dir":1,"secondWall":null},
 {"wall":{"wall":1,"to":9},"dir":1,"secondWall":null},
 {"wall":{"wall":1,"to":2},"dir":3,"secondWall":null},
 {"wall":{"wall":5,"to":36},"dir":3,"secondWall":null},
 {"wall":{"wall":0,"to":14},"dir":2,"secondWall":null},
 {"wall":{"wall":6,"to":37},"dir":0,"secondWall":null},
];
const ROOT={wall:null,dir:0,secondWall:null};
test("audited 9-ply two-wall game reaches a verifiable forced winning threat",()=>{
 let s=initialCurry(2,0,[21,27]);
 for(let i=0;i<PLAYED_ACTIONS.length;i++){
  const e=successorsTwoWall(s).find(x=>JSON.stringify(x.a)===JSON.stringify(PLAYED_ACTIONS[i]));
  assert.ok(e,"All 9 moves must be legal; ply "+i);
  s=e.n;
 }
 assert.deepEqual(s.walls,[14,2,18,22,26,36,37,40]);
 assert.deepEqual(s.stars,[17,24,45]);
 assert.deepEqual(s.players,[21,31]);
 assert.deepEqual(s.scores,[0,2]);
 assert.deepEqual(s.curries,[27]);
 assert.deepEqual(s.powers,[1,0]);
 assert.equal(s.turn,1);
 const first=successorsTwoWall(s).find(x=>JSON.stringify(x.a)===JSON.stringify(ROOT));
 assert.ok(first);
 assert.equal(first.n.winner,null);
 const opponentReplies=successorsTwoWall(first.n);
 assert.equal(opponentReplies.length,683,"exactly this many opponent replies");
 for(const {n} of opponentReplies){
  // Every legal opponent defense loses to some immediate action by P2.
  const winning=successorsTwoWall(n).find(x=>x.n.winner===1);
  assert.ok(winning,"A reply unexpectedly avoids a one-move finishing score");
 }
});
