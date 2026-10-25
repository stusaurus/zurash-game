// Research-only fixed-horizon follow-up; original archives remain immutable.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {load,play,protocol,blockEstimate} from './d-walk-study.js';
import {sha} from './stall-research.js';
import {checkpointFingerprint} from './trajectory-followup.js';
import {measure} from './b-performance-study.js';
export const dir='reports/d-walk-horizon-2026-10-24';
export const sources=()=>['self','panel'].flatMap(kind=>Array.from({length:kind==='self'?12:8},(_,i)=>load(`${kind}-${i}`).map(r=>({kind,...r}))).flat());
const save=(n,v)=>{mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/${n}.json.gz.tmp`,gzipSync(JSON.stringify(v)));renameSync(`${dir}/${n}.json.gz.tmp`,`${dir}/${n}.json.gz`);};
const get=n=>JSON.parse(gunzipSync(readFileSync(`${dir}/${n}.json.gz`)));
export function plan(){return JSON.parse(readFileSync(`${dir}-plan.json`,'utf8'));}
export function run(part){const p=plan(),all=sources(),lock={planSHA256:sha(p),sources:all.map(r=>({id:r.game.id,sha:sha(r)}))};if(existsSync(`${dir}/lock.json.gz`))assert.deepEqual(get('lock'),lock);else save('lock',lock);
 const out=existsSync(`${dir}/part-${part}.json.gz`)?get(`part-${part}`):[];
 for(const [i,r] of all.entries()){if(i%p.parts!==part||out.some(x=>x.id===r.game.id)||r.game.state.winner!==null||r.game.state.ply>=p.horizon)continue;
 const stats=[],game=play(r.game,{ms:p.maxMs,plies:p.horizon-r.game.state.ply,stats});out.push({id:r.game.id,kind:r.kind,sourceSHA256:sha(r),checkpointSHA256:checkpointFingerprint(r.game),game,stats});save(`part-${part}`,out);console.log('horizon',part,out.length,game.state.ply,game.reason);}
 return out;}
export function replay(part){const out=[];for(const r of get(`part-${part}`)){const src=sources().find(s=>s.game.id===r.id);assert.equal(sha(src),r.sourceSHA256);const game=play(src.game,{ms:3600000,plies:r.game.state.ply-src.game.state.ply,replayStats:r.stats});for(const k of ['state','history','rngStates','visits','metrics','repetitionCount','lastLead'])assert.deepEqual(game[k],r.game[k]);out.push({id:r.id,sha:sha(r),matched:true});save(`replay-${part}`,out);}return out;}
export function verify(){const p=plan(),all=sources(),extensions=Array.from({length:p.parts},(_,i)=>get(`part-${i}`)).flat(),replays=Array.from({length:p.parts},(_,i)=>get(`replay-${i}`)).flat();assert.equal(new Set(extensions.map(r=>r.id)).size,extensions.length);assert.equal(replays.length,extensions.length);assert.deepEqual(get('lock'),{planSHA256:sha(p),sources:all.map(r=>({id:r.game.id,sha:sha(r)}))});
 const rows=all.map(src=>{const needed=src.game.state.winner===null&&src.game.state.ply<p.horizon,r=extensions.find(r=>r.id===src.game.id);assert.equal(!!r,needed);if(r){assert.equal(r.sourceSHA256,sha(src));assert.equal(r.checkpointSHA256,checkpointFingerprint(src.game));assert.deepEqual(r.game.history.slice(0,src.game.history.length),src.game.history);assert.equal(r.stats.length,r.game.history.length-src.game.history.length);assert.ok(replays.some(v=>v.id===r.id&&v.matched&&v.sha===sha(r)));measure(r.game,r.stats);}
 const g=r?.game??src.game,win=g.state.winner!==null&&g.state.ply<=p.horizon,covered=win||g.state.ply>=p.horizon;return {kind:src.kind,game:g,id:g.id,covered,win,winner:win?g.state.winner:null,atHorizonUnresolved:covered&&!win,sourcePly:src.game.state.ply,added:r?r.stats.length:0};});
 const group=rs=>({n:rs.length,covered:rs.filter(r=>r.covered).length,settled:rs.filter(r=>r.win).length,unresolvedAt512:rs.filter(r=>r.atHorizonUnresolved).length,budgetIncomplete:rs.filter(r=>!r.covered).length,firstWins:rs.filter(r=>r.win&&r.winner===r.game.starter).length,secondWins:rs.filter(r=>r.win&&r.winner!==r.game.starter).length});
 const self=Object.fromEntries(protocol().selfPairs.map(pair=>[pair.join('/'),group(rows.filter(r=>r.kind==='self'&&JSON.stringify(r.game.research.labels)===JSON.stringify(pair)))]));
 const same=rows.filter(r=>r.kind==='self'&&r.game.research.labels[0]===r.game.research.labels[1]);const effects=same.every(r=>r.covered)?blockEstimate(same,r=>Number(r.win)*(r.game.research.labels[0]==='D-walk'?2:-2),protocol().selfSeeds):null;
 const panel={};for(const opp of protocol().panelOpponents){panel[opp]={};for(const a of protocol().panelTargets)panel[opp][a]=group(rows.filter(r=>r.kind==='panel'&&r.game.research.labels[0]===a&&r.game.research.labels[1]===opp));}
 const summary={planSHA256:sha(p),newInitialGames:0,originalGames:all.length,continuations:extensions.length,addedPlies:rows.reduce((s,r)=>s+r.added,0),replayTasks:replays.length,horizon:p.horizon,self,effects,panel,rows:rows.map(({game,...r})=>({...r,labels:game.research.labels}))};save('summary',summary);console.log(JSON.stringify({...summary,rows:undefined}));return summary;}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [flag,index]=process.argv.slice(2);if(flag==='--run')run(Number(index));else if(flag==='--replay')replay(Number(index));else if(flag==='--verify')verify();else throw Error('Specify stage');}
