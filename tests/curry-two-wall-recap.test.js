import test from "node:test";
import assert from "node:assert/strict";
import {matchRecap} from "../experiments/curry-two-wall-recap.js";

const event=(player,{star=false,curry=false,walls=1}={})=>({
 player, gotStar:star, pickedCurry:curry, wallCount:walls,
});
test("classic finish shows star and wall remarks but never discusses curry powers",()=>{
 const events=[
  event(0,{star:true,walls:1}),
  event(1,{star:true,walls:0}),
  event(0,{star:true,walls:0}),
  event(1,{walls:1}),
  event(0,{star:true,walls:1}),
 ];
 const r=matchRecap({curryEnabled:false,scores:[3,1],ply:5,winner:0,events});
 assert.equal(r.label,"★ カレーなし");
 assert.match(r.scoreLine,/3対1.*5手/);
 assert.match(r.comment,/壁1個ルール/);
 assert.doesNotMatch(r.comment,/カレーパワー|カレー効果|壁2個/);
 assert.equal(r.stats.length,2);
 assert.deepEqual(r.totals[0],{stars:3,curry:0,doubleWalls:0,shiftedWalls:2,noWall:1});
 assert.deepEqual(r.totals[1],{stars:1,curry:0,doubleWalls:0,shiftedWalls:1,noWall:1});
 assert.ok(r.stats.every(x=>!x.includes("カレー")));
});
test("curry finish reports exactly observed curry pickups and double-wall uses",()=>{
 const events=[
  event(0,{curry:true,walls:0}),
  event(1,{star:true,walls:1}),
  event(0,{star:true,walls:2}),
  event(1,{star:true,walls:0}),
  event(0,{star:true,walls:1}),
  event(1,{curry:true,walls:0}),
  event(0,{star:true,walls:1}),
 ];
 const r=matchRecap({curryEnabled:true,scores:[3,2],ply:7,winner:0,events});
 assert.equal(r.label,"🍛 カレーあり");
 assert.match(r.comment,/壁を2個動かす手を1回/);
 assert.ok(r.stats.some(x=>/プレイヤー1 1回.*プレイヤー2 1回/.test(x)));
 assert.ok(r.stats.some(x=>/プレイヤー1 1回.*プレイヤー2 0回/.test(x)));
});
test("winning by stars after opponent's double-wall turn is attributed to opponent",()=>{
 const events=[
  event(0,{star:true}),event(1,{curry:true}),
  event(0,{star:true}),event(1,{star:true,walls:2}),
  event(0,{star:true}),
 ];
 const r=matchRecap({curryEnabled:true,scores:[3,1],ply:5,winner:0,events});
 assert.match(r.comment,/相手が壁2個移動を1回/);
});
test("curry mode without an actual pickup does not invent power effects",()=>{
 const events=[
  event(0,{star:true}),event(1),
  event(0,{star:true}),event(1,{star:true}),
  event(0,{star:true}),
 ];
 const r=matchRecap({curryEnabled:true,scores:[3,1],ply:5,winner:0,events});
 assert.match(r.comment,/両者ともカレーを取らず/);
 assert.deepEqual(r.totals.map(x=>x.doubleWalls),[0,0]);
});
test("recap recognizes score comeback from recorded star chronology",()=>{
 const events=[
  event(0),event(1,{star:true}),
  event(0),event(1,{star:true}),
  event(0,{star:true}),event(1),
  event(0,{star:true}),event(1),
  event(0,{star:true}),
 ];
 const r=matchRecap({curryEnabled:false,scores:[3,2],ply:9,winner:0,events});
 assert.equal(r.comeback,true);
 assert.match(r.comment,/逆転/);
});
test("recap rejects mismatched score/history or curry use in classic mode",()=>{
 assert.throws(()=>matchRecap({curryEnabled:false,scores:[3,0],ply:1,winner:0,
  events:[event(0,{star:true})]}),/星の得点/);
 assert.throws(()=>matchRecap({curryEnabled:false,scores:[3,0],ply:2,winner:0,
  events:[event(0,{star:true})]}),/手数/);
 assert.throws(()=>matchRecap({curryEnabled:false,scores:[1,0],ply:1,winner:0,
  events:[event(0,{star:true,curry:true})]}),/カレーなし/);
 assert.throws(()=>matchRecap({curryEnabled:true,scores:[0,0],ply:0,winner:null,
  events:[]}),/未決着/);
});
