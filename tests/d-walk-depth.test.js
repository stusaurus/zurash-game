import test from 'node:test';
import assert from 'node:assert/strict';
import {cooperative} from '../scripts/d-walk-depth.js';
import {forceCapture} from '../scripts/b-performance-study.js';
const s=(id,turn,score=0)=>({width:5,height:1,players:[id,4],walls:[],stars:[3],scores:[score,0],target:2,turn,winner:null});
test('cooperative witness does not imply forced scoring against all replies',()=>{const tree=new Map([[0,[s(1,1)]],[1,[s(2,0),s(3,0)]],[2,[s(2,1,1)]]]),children=n=>(tree.get(n.players[0])??[]).map((n,i)=>({a:{i},n}));const c=cooperative(s(0,0),0,{children,horizon:3});assert.equal(c.result,true);assert.equal(c.path.length,3);assert.equal(forceCapture(s(0,0),0,{children,horizon:3}).result,false);});
test('cooperative resource cutoff remains unknown and terminal loss cannot prepare scoring',()=>{assert.equal(cooperative(s(0,0),0,{maxNodes:0}).result,null);assert.equal(cooperative({...s(0,0),winner:1},0).result,false);assert.equal(cooperative(s(0,0),0,{horizon:0}).result,false);});
