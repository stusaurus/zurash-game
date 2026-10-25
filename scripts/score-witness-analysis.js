// Verify discovered reference-tree witnesses using the production engine instead.
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {successors} from '../src/engine.js';
import {actionID} from './defense-path-ai.js';
const dir='reports/defense-path-2026-10-26',archive=JSON.parse(gunzipSync(readFileSync(dir+'/positions.json.gz'))),rows=[];
function fixed(s,a){const p=s.turn,n=successors(s).find(c=>actionID(c.a)===actionID(a))?.n;assert.ok(n);if(n.scores[p]>s.scores[p])return {forced:true,plies:1};const rs=successors(n);if(!rs.length)return {forced:false,replyCount:0};for(const r of rs)if(r.n.winner===1-p||!successors(r.n).some(c=>c.n.scores[p]>s.scores[p]))return {forced:false,counterexampleReply:r.a,replyCount:rs.length};return {forced:true,plies:3,replyCount:rs.length};}
for(const c of archive.deeper){for(const witness of c.result.witnesses)assert.equal(fixed(c.state,witness.action).forced,true);const saved=archive.cases.find(x=>x.mode===c.mode&&JSON.stringify(x.source)===JSON.stringify(c.source));rows.push({mode:c.mode,source:c.source,witnesses:c.result.witnesses,selected:Object.fromEntries(Object.entries(saved.selected).map(([v,r])=>[v,{action:r.action,...fixed(c.state,r.action)}])),archivedChoice:fixed(c.state,c.source.archivedAction),limitedReferenceCensus:c.result.complete});}
writeFileSync(dir+'/score-witnesses.json',JSON.stringify(rows,null,2));console.log(rows.filter(r=>r.witnesses.length));
