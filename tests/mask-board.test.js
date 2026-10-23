import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initial,actions,apply,successors,slide,step,key,distances} from '../src/engine.js';
import {toBoardState} from '../src/geometry.js';
import {generateBoard,makeMask,validateBoard,parseBoardJSON,mutateBoard,definitionKey,captureWitness} from '../src/board-lab.js';
import {MASK_LIBRARY} from '../src/mask-library.js';
import {captureRoutes} from '../src/route-ai.js';
import {choose,seeded} from '../src/ai.js';
import {newGame,advanceGame,verifyGame} from '../scripts/tactics-completion.js';
const fixture=(extra={})=>({width:5,height:3,playableCells:Array.from({length:15},(_,i)=>i).filter(i=>i!==7),walls:[],stars:[4],players:[5,14],target:1,...extra});
test('rectangle and hole stop sliding without wrapping or crossing terrain',()=>{
 const s=toBoardState(fixture());assert.equal(slide(s,0,1),6);assert.equal(step(6,1,s),null);assert.equal(step(4,1,s),null);assert.equal(step(0,0,s),null);assert.equal(distances(s,0).length,15);
 assert.equal(step(3,2,4),7);assert.equal(step(15,2,4),null);
});
test('L corners, cross arms, narrow passage and mutable walls',()=>{
 for(const shape of ['L','cross','ring','H','rooms','waist','stairs','T','U']){
 const mask=makeMask(7,7,shape,1);const s=toBoardState({width:7,height:7,playableCells:mask,players:[mask[0],mask.at(-1)],stars:[],walls:[],target:1});
 for(const p of [0,1])for(let d=0;d<4;d++)assert.ok(mask.includes(slide(s,p,d)));
 }
 const s=initial(MASK_LIBRARY[2].board);assert.ok(actions(s).some(a=>a.wall));
 for(const {a,n} of successors(s)){assert.deepEqual(n,apply(s,a));if(a.wall)assert.ok(s.playableCells.includes(a.wall.to));}
});
test('geometry keys distinguish shape, dimensions and target, preserve old keys',()=>{
 const s=initial();assert.equal(JSON.parse(key(s))[0],7);
 const a=toBoardState(fixture()),b={...a,playableCells:[...a.playableCells,7]};assert.notEqual(key(a),key(b));assert.notEqual(key(a),key({...a,width:3,height:5}));
 assert.equal(key(a),key({...a,playableCells:[...a.playableCells].reverse()}));
 assert.throws(()=>toBoardState({...fixture(),size:5}),/混在/);
});
test('imports reject malformed, oversized, overlapping, disconnected and no-action boards',()=>{
 for(const b of [fixture({width:500}),fixture({players:[5,5]}),fixture({stars:[7]}),fixture({target:3}),fixture({walls:[4]}),fixture({playableCells:[0,14],players:[0,14],stars:[],target:1}),fixture({playableCells:[0,1,2],players:[0,2],stars:[1]})])assert.equal(validateBoard(b).ok,false);
 assert.throws(()=>parseBoardJSON('{'));assert.throws(()=>parseBoardJSON(' '.repeat(65537)));assert.throws(()=>parseBoardJSON('null'));
 assert.throws(()=>parseBoardJSON(JSON.stringify(fixture({size:5}))));
});
test('all examples pass legality, preserve masks through turns, routes match exhaustive capture',()=>{
 for(const r of MASK_LIBRARY){assert.ok(validateBoard(r.board).ok);let s=initial(r.board);
 for(let k=0;k<2;k++){
  const options=successors(s);assert.deepEqual(options.map(c=>c.a),actions(s));
  for(const p of [0,1]){const wanted=new Set(successors({...s,turn:p}).filter(c=>c.n.scores[p]>s.scores[p]).map(c=>c.n.players[p]));assert.deepEqual(new Set(captureRoutes(s,p).keys()),wanted);}
  const a=choose(s,{level:k?'strong':'greedy',rng:seeded(18)});assert.ok(options.some(c=>JSON.stringify(c.a)===JSON.stringify(a)));s=apply(s,a);assert.deepEqual(s.playableCells,r.board.playableCells);
 }
 }
});
test('seeded constraints, strict rotation, independent target and mutation provenance',()=>{
 const opts={width:7,height:7,shape:'square',stars:7,walls:6,target:3,seed:80,symmetry:'rotation'};
 const a=generateBoard(opts);assert.deepEqual(a,generateBoard(opts));assert.equal(a.board.stars.length,7);
 for(const field of ['stars','walls'])for(const i of a.board[field])assert.ok(a.board[field].includes(48-i));
 assert.throws(()=>generateBoard({...opts,width:8,height:6,shape:'rectangle',stars:5}));
 for(const kind of ['stars','walls','shape','multiple']){let m;for(let seed=1;seed<80&&!m;seed++)try{m=mutateBoard(a,{kind,seed});}catch{}assert.ok(m);assert.equal(m.parent,a.id);if(kind==='stars')assert.deepEqual(m.board.walls,a.board.walls);if(kind==='walls')assert.deepEqual(m.board.stars,a.board.stars);}
 assert.equal(definitionKey(a.board),definitionKey({...a.board,walls:a.board.walls.toReversed()}));
});
test('winning capture and bounded constructive witness distinguish unknown',()=>{
 const b=fixture({players:[0,14],stars:[4]});const s=initial(b),a=actions(s).find(a=>a.wall===null&&a.dir===1);const n=apply(s,a);assert.equal(n.winner,0);assert.equal(n.scores[0],1);
 assert.equal(captureWitness(b,0).status,'witness');assert.equal(captureWitness(b,0,{maxNodes:0}).status,'unknown-budget');
});
// Independent coordinate reference: no engine step/slide/action helper used.
function oracle(s){
 const dirs=[[0,-1],[1,0],[0,1],[-1,0]],cells=new Set(s.playableCells);
 const neighbor=(i,d)=>{const x=i%s.width+dirs[d][0],y=Math.floor(i/s.width)+dirs[d][1],to=y*s.width+x;return x<0||x>=s.width||y<0||y>=s.height||!cells.has(to)?null:to;};
 const glide=(players,walls,p,d)=>{let at=players[p];for(;;){const next=neighbor(at,d);if(next===null||walls.includes(next)||next===players[1-p])return at;at=next;}};
 const mobile=(players,walls,p)=>dirs.some((_,d)=>glide(players,walls,p,d)!==players[p]);
 const out=[];const shifts=[null];s.walls.forEach((from,wall)=>dirs.forEach((_,d)=>{const to=neighbor(from,d);if(to!==null&&![...s.walls,...s.stars,...s.players].includes(to))shifts.push({wall,to});}));
 for(const wall of shifts){const walls=s.walls.map((x,i)=>wall?.wall===i?wall.to:x);if(wall&&(!mobile(s.players,walls,0)||!mobile(s.players,walls,1)))continue;
 dirs.forEach((_,dir)=>{const to=glide(s.players,walls,s.turn,dir);if(to===s.players[s.turn])return;const players=s.players.map((x,i)=>i===s.turn?to:x);if(mobile(players,walls,0)&&mobile(players,walls,1))out.push({wall,dir});});}
 return out;
}
test('exhaustive independent reference on every 2-pawn/1-wall/1-star placement of a small mask',()=>{
 const mask=[0,1,2,3,4];let states=0;
 for(const p0 of mask)for(const p1 of mask)for(const w of mask)for(const star of mask){if(new Set([p0,p1,w,star]).size!==4)continue;
 for(const turn of [0,1]){const s={...toBoardState({width:3,height:2,playableCells:mask,players:[p0,p1],walls:[w],stars:[star],target:1}),turn};assert.deepEqual(actions(s),oracle(s));for(const c of successors(s))assert.deepEqual(c.n,apply(s,c.a));states++;}}
 assert.equal(states,240);
});

test('masked checkpoints preserve RNG and history across resume',()=>{
 const base=MASK_LIBRARY[7].board,g=newGame(base,{policies:['star','positional'],seed:7821});
 const direct=advanceGame(g,{maxPlies:30,timeBudgetMs:10000}),part=advanceGame(g,{maxPlies:8,timeBudgetMs:10000}),resumed=advanceGame(part,{maxPlies:30,timeBudgetMs:10000});
 assert.deepEqual(resumed.history,direct.history);assert.deepEqual(resumed.rngStates,direct.rngStates);assert.deepEqual(resumed.state,direct.state);assert.ok(verifyGame(resumed));
});

test('rejects an initially trapped pawn even when one wall shift can rescue it',()=>{
 const s=toBoardState({width:4,height:4,players:[0,15],walls:[1,4],stars:[3,6,12],target:2});
 assert.ok(actions(s).length>0);const v=validateBoard(s);assert.equal(v.ok,false);assert.ok(v.errors.includes('初期状態で滑走不能'));
});
