import test from "node:test";
import assert from "node:assert/strict";
import {initialCurry} from "../experiments/curry-power.js";
import {successorsTwoWall} from "../experiments/curry-two-wall.js";

const trace=[
 {wall:{wall:0,to:1},dir:2,secondWall:null},
 {wall:{wall:6,to:37},dir:1,secondWall:null},
 {wall:{wall:5,to:35},dir:0,secondWall:null},
 {wall:{wall:6,to:44},dir:3,secondWall:null},
 {wall:{wall:0,to:2},dir:3,secondWall:null},
 {wall:{wall:7,to:47},dir:0,secondWall:null},
 {wall:{wall:1,to:9},dir:2,secondWall:null},
 {wall:{wall:2,to:13},dir:2,secondWall:null},
 {wall:{wall:0,to:3},dir:2,secondWall:null},
 {wall:{wall:0,to:4},dir:1,secondWall:null},
 {wall:{wall:0,to:3},dir:2,secondWall:null},
 {wall:{wall:0,to:4},dir:0,secondWall:null},
 {wall:{wall:0,to:3},dir:0,secondWall:null},
 {wall:{wall:4,to:25},dir:2,secondWall:null},
 {wall:{wall:6,to:45},dir:2,secondWall:null},
 {wall:{wall:0,to:4},dir:0,secondWall:null},
 {wall:{wall:4,to:32},dir:0,secondWall:null},
];
const winningThreat={wall:{wall:1,to:16},dir:2,secondWall:null};
test("after 17 legal moves at 2:1, moving wall then down forces victory against every reply",()=>{
 let s=initialCurry(2,0,[5,43]);
 for(const [i,a] of trace.entries()){
  const next=successorsTwoWall(s).find(x=>JSON.stringify(x.a)===JSON.stringify(a));
  assert.ok(next,"Replay action "+i+" must be legal");
  s=next.n;
 }
 assert.deepEqual(s.walls,[4,9,13,22,32,35,45,47]);
 assert.deepEqual(s.stars,[24,31]);
 assert.deepEqual(s.players,[11,3]);
 assert.deepEqual(s.scores,[2,1]);
 assert.deepEqual(s.curries,[5,43]);
 assert.deepEqual(s.powers,[0,0]);
 assert.equal(s.turn,0);
 const action=successorsTwoWall(s).find(x=>JSON.stringify(x.a)===JSON.stringify(winningThreat));
 assert.ok(action);
 assert.equal(action.n.winner,null);
 const allReplies=successorsTwoWall(action.n);
 assert.equal(allReplies.length,49);
 for(const {n} of allReplies){
  assert.ok(successorsTwoWall(n).some(x=>x.n.winner===0),
   "Every legal opponent move must allow a forced third star");
 }
});
