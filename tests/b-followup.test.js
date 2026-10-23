import test from 'node:test';
import assert from 'node:assert/strict';
import {positionChildren,auditCooperativeLine,chooseFamilies,threePlyCertificate,forkWithFirstAction,orderingDiagnostic} from '../scripts/b-followup.js';
import {candidates} from '../scripts/b-settlement-study.js';
import {definitionKey,validateBoard} from '../src/board-lab.js';
import {referenceChildren} from '../scripts/stall-research.js';
import {selectStarCandidate} from '../scripts/b-star-check.js';
import {newGame} from '../scripts/tactics-completion.js';
test('position mutations are legal reproducible children and leave stars, walls and target fixed',()=>{
 const p=candidates().parent,before=structuredClone(p),rs=positionChildren(p);assert.deepEqual(rs,positionChildren(p));assert.deepEqual(p,before);assert.equal(new Set(rs.map(r=>definitionKey(r.board))).size,4);
 for(const r of rs){assert.ok(validateBoard(r.board).ok);assert.equal(r.parent,p.id);for(const k of ['stars','walls','target','playableCells'])assert.deepEqual(r.board[k],p.board[k]);}
});
test('frozen families do not select target reduction or duplicate a single mutation family',()=>{
 const rows=[{id:'t',change:{kind:'target'}},{id:'w',change:{kind:'walls'}},{id:'p',change:{kind:'players'}},{id:'w2',change:{kind:'walls'}}],m=new Map(rows.map(r=>[r.id,{unresolvedRate:r.id==='w2'?.5:0,firstBias:0,positionBias:0}]));assert.deepEqual(chooseFamilies(rows,m),['w','p']);assert.throws(()=>chooseFamilies(rows.filter(r=>r.id!=='p'),m));
});
test('supplementary star hypothesis uses training only and excludes other mutation kinds',()=>{
 const rows=[{id:'wall',change:{kind:'walls'}},{id:'star-a',change:{kind:'stars'}},{id:'star-b',change:{kind:'stars'}}],training=rows.map(r=>({id:r.id,metrics:{unresolvedRate:r.id==='star-b'?.5:0,firstBias:0,positionBias:0}}));assert.equal(selectStarCandidate(rows,training).id,'star-a');assert.equal(selectStarCandidate(rows.filter(r=>r.change.kind==='walls'),training),undefined);
});
test('fixed-line response audit distinguishes cooperative victory from a forced three-ply win',()=>{
 const s={width:4,height:4,playableCells:Array.from({length:16},(_,i)=>i),players:[12,3],stars:[0],walls:[5,10],target:1,scores:[0,0],turn:0,ply:0,winner:null};
 let checked=0;
 for(const a of referenceChildren(s).filter(c=>c.n.winner===null))for(const b of referenceChildren(a.n).filter(c=>c.n.winner===null)){
  const win=referenceChildren(b.n).find(c=>c.n.winner===0);if(!win)continue;
  const r=auditCooperativeLine(s,[a.a,b.a,win.a]);const replies=referenceChildren(a.n),allow=replies.filter(c=>referenceChildren(c.n).some(n=>n.n.winner===0)).length;
  assert.equal(r.replies,replies.length);assert.equal(r.allowImmediateRootWin,allow);assert.equal(r.preventImmediateRootWin,replies.length-allow);assert.equal(r.forcedWithinThreeAfterThisAction,allow===replies.length&&replies.length>0);
  checked++;if(checked>=8)break;
 }
 assert.ok(checked>0);assert.throws(()=>auditCooperativeLine(s,[]));
});
const late={width:9,height:9,playableCells:Array.from({length:81},(_,i)=>i),players:[53,10],walls:[41,40,62,55,74,67,43,1,61,20],stars:[12],target:3,scores:[2,2],turn:1,ply:101,winner:null};
test('B double-stopper certificate covers all 64 opponent replies independently',()=>{
 const c=threePlyCertificate(late);assert.equal(c.status,'independent-forced-three');assert.deepEqual(c.certificate.firstAction,{wall:{wall:7,to:2},dir:1});assert.equal(c.certificate.replies,64);assert.equal(c.certificate.preventImmediateRootWin,0);
 const o=orderingDiagnostic(late,99,[],c.certificate.firstAction);assert.equal(o.rootActions,96);assert.deepEqual(o.uniqueOrderingValues,[0]);
});
test('one-move intervention keeps source unchanged and consumes the same first-turn RNG',()=>{
 const c=threePlyCertificate(late),source=newGame(late,{starter:1,policies:['search','route'],seed:43});source.research={policyByActor:['search','route']};const before=structuredClone(source);
 const control=forkWithFirstAction(source,null,{extraPlies:1,timeBudgetMs:10000}),changed=forkWithFirstAction(source,c.certificate.firstAction,{extraPlies:1,timeBudgetMs:10000});assert.deepEqual(source,before);assert.deepEqual(control.rngStates,changed.rngStates);
 const finish=forkWithFirstAction(source,c.certificate.firstAction,{extraPlies:3,timeBudgetMs:10000});assert.equal(finish.state.winner,1);assert.ok(finish.state.ply<=104);assert.equal(finish.reason,'win');
});
