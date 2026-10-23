import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';
import {inventory,modelMove,MODELS,FACTOR_MODELS,factorMove,factorValue} from '../scripts/guard-ai.js';import {randomStream} from '../scripts/tactics-completion.js';import {immediateLossCensus} from '../scripts/trajectory-followup.js';import {auditFixedFirst} from '../scripts/b-followup.js';
const cases=JSON.parse(gunzipSync(Buffer.from(readFileSync(new URL('../reports/trajectory-followup-2026-10-23/B-cases.json.gz.b64',import.meta.url),'utf8'),'base64')));
test('all three archived unsafe cases retain a legal safe root before search',()=>{
 for(const c of cases.filter(c=>c.probes.find(p=>p.variant==='archived').loss.avoidableImmediateLoss)){
  const cp=c.checkpoint,seen=new Map(cp.visits.map(([k,v])=>[k,v.count])),inv=inventory(cp.state,'retain',cp.rngStates[c.loser],seen);assert.ok(inv.retained.length);assert.ok(inv.retained.every(r=>r.safe));
  const r=modelMove(cp.state,'retain',randomStream(cp.rngStates[c.loser]),seen,{trace:true});assert.ok(r.selectedRetained);assert.equal(immediateLossCensus(cp.state,r.action).selectedAllowsImmediateLoss,false);
 }
});
test('the research root keeper preserves a three-ply preparation certificate',()=>{
 const s={width:9,height:9,playableCells:Array.from({length:81},(_,i)=>i),players:[53,10],walls:[41,40,62,55,74,67,43,1,61,20],stars:[12],target:3,scores:[2,2],turn:1,ply:101,winner:null};
 const r=modelMove(s,'retain',randomStream(99),new Map(),{trace:true});assert.equal(r.forced,3);assert.equal(r.selectedRetained,true);assert.equal(auditFixedFirst(s,r.action).forcedWithinThreeAfterThisAction,true);
});
test('instrumentation is non-mutating, seeded, and all five model labels remain comparable',()=>{
 assert.deepEqual(MODELS,['archived','depth3','wide2','retain','routes2']);const cp=cases[1].checkpoint,before=structuredClone(cp),seen=new Map(cp.visits.map(([k,v])=>[k,v.count]));
 const a=modelMove(cp.state,'retain',randomStream(cp.rngStates[cp.state.turn]),seen),b=modelMove(cp.state,'retain',randomStream(cp.rngStates[cp.state.turn]),seen);assert.deepEqual(a.action,b.action);assert.deepEqual(cp,before);assert.ok(a.elapsedMs>=0);assert.ok(a.rssAfter>0);assert.ok(a.heapBefore>0);
});
test('local tactical choices distinguish an avoidable defeat from safe legal states',async()=>{
 const {localChoices}=await import('../scripts/guard-study.js');const cp=cases.find(c=>c.sourceID.startsWith('s-2af739')).checkpoint,r=localChoices(cp.state);assert.equal(r.legal,56);assert.equal(r.safe,6);assert.equal(r.unsafe,50);assert.equal(r.hasSafetyChoice,true);assert.ok(r.uniqueSafeNextStates>0);
});
test('depth-only comparator agrees with exhaustive third-ply leaves on a small independent tree',async()=>{
 const {referenceChildren}=await import('../scripts/stall-research.js');const {evaluate}=await import('../src/ai.js');
 const s={width:3,height:3,playableCells:Array.from({length:9},(_,i)=>i),players:[6,2],walls:[4],stars:[0,3,8],target:2,scores:[0,0],turn:0,ply:0,winner:null},rng=randomStream(71);
 const roots=referenceChildren(s).map(c=>({...c,score:evaluate(c.n,0),tie:rng()})).sort((a,b)=>b.score-a.score||a.tie-b.tie).slice(0,8);
 const values=roots.map(c=>{const rs=referenceChildren(c.n),worst=rs.length?Math.min(...rs.map(r=>{if(r.n.winner!==null)return evaluate(r.n,0);const ts=referenceChildren(r.n);return ts.length?Math.max(...ts.map(t=>evaluate(t.n,0))):evaluate(r.n,0);})):evaluate(c.n,0);return {...c,value:.88*worst+.12*c.score};});
 const expected=values.reduce((a,b)=>b.value>a.value?b:a).a,r=modelMove(s,'depth3',randomStream(71));assert.deepEqual(r.action,expected);assert.equal(r.replyBeam,'all');assert.equal(r.thirdPlyBeam,'all');assert.equal(r.complete,true);
});
test('factorial evaluators share identical root sets and RNG consumption',()=>{
 const cp=cases.find(c=>c.sourceID.startsWith('s-2af739')).checkpoint,before=structuredClone(cp),seen=new Map(cp.visits.map(([k,v])=>[k,v.count]));
 for(const keeper of ['shield','keeper']){
  const a=randomStream(cp.rngStates[cp.state.turn]),b=randomStream(cp.rngStates[cp.state.turn]);
  const x=factorMove(cp.state,keeper+'-distance',a,seen,{trace:true}),y=factorMove(cp.state,keeper+'-routes',b,seen,{trace:true});
  assert.deepEqual(x.retainedActions,y.retainedActions);assert.equal(a.state(),b.state());
  assert.equal(immediateLossCensus(cp.state,x.action).selectedAllowsImmediateLoss,false);
  assert.equal(immediateLossCensus(cp.state,y.action).selectedAllowsImmediateLoss,false);
 }
 assert.deepEqual(cp,before);
});
test('all four factorial choices agree with independent exhaustive reply minimization',async()=>{
 const {referenceChildren}=await import('../scripts/stall-research.js');
 const s={width:3,height:3,playableCells:Array.from({length:9},(_,i)=>i),players:[6,2],walls:[4],stars:[0,3,8],target:2,scores:[0,0],turn:0,ply:0,winner:null};
 for(const [model,config] of Object.entries(FACTOR_MODELS)){
  const r=factorMove(s,model,randomStream(71),new Map(),{trace:true}),all=referenceChildren(s);
  const values=r.retainedActions.map(a=>{const c=all.find(c=>JSON.stringify(c.a)===JSON.stringify(a)),rs=referenceChildren(c.n),worst=rs.length?Math.min(...rs.map(x=>factorValue(x.n,0,config.routes))):factorValue(c.n,0,config.routes);return {a,value:.88*worst+.12*factorValue(c.n,0,config.routes)};});
  const wins=all.filter(c=>c.n.winner===0);const expected=wins.length?wins.find(c=>JSON.stringify(c.a)===JSON.stringify(r.action))?.a:values.reduce((a,b)=>b.value>a.value?b:a).a;
  assert.deepEqual(r.action,expected);assert.equal(r.replyBeam,'all');assert.equal(r.complete,true);
 }
});
test('distance leaves tie distinct future threats that scoring routes distinguish',async()=>{
 const {referenceChildren}=await import('../scripts/stall-research.js');
 const critical=JSON.parse(gunzipSync(readFileSync(new URL('../reports/guard-followup-2026-10-24/critical.json.gz',import.meta.url))));
 for(const ply of [37,148]){
  const row=critical.rows.find(r=>r.factor==='evaluation'&&r.controlOutcome==='loss'&&r.ply===ply),s=row.state,cs=referenceChildren(s);
  const worst=(action,routes)=>{const n=cs.find(c=>JSON.stringify(c.a)===JSON.stringify(action)).n;return Math.min(...referenceChildren(n).map(r=>factorValue(r.n,s.turn,routes)));};
  assert.equal(worst(row.controlAction,false),worst(row.winningAction,false));
  assert.ok(worst(row.controlAction,true)<worst(row.winningAction,true));
 }
});
test('the existing keeper already solves the three-ply certificate used in ablation',()=>{
 const critical=JSON.parse(gunzipSync(readFileSync(new URL('../reports/guard-followup-2026-10-24/critical.json.gz',import.meta.url))));
 const row=critical.rows.find(r=>r.factor==='evaluation'&&r.ply===38),r=modelMove(row.state,'retain',randomStream(row.rngState));
 assert.equal(r.forced,3);assert.equal(auditFixedFirst(row.state,r.action).forcedWithinThreeAfterThisAction,true);
});
test('D has a policy-independent first-capture asymmetry in all seat/turn conditions',async()=>{
 const {openingCertificate}=await import('../scripts/guard-followup.js'),c=openingCertificate();assert.deepEqual(c.physicalSlots,[30,5]);assert.equal(c.configurations.length,4);
 for(const r of c.configurations){assert.equal(r.legalFirst,17);assert.equal(r.slot1CanScoreOnFirstOwnTurn,true);
  if(r.firstMoverSlot===0){assert.equal(r.firstCaptureActions.length,0);assert.equal(r.responses.length,17);assert.ok(r.responses.every(r=>r.slot1CaptureActions.length>0));}
  else {assert.equal(r.firstCaptureActions.length,2);assert.deepEqual([...r.firstCaptureStars].sort((a,b)=>a-b),[11,35]);}
 }
});
