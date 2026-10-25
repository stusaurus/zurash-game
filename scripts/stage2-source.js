// Latest existing initial-game IDs; continuations replace prefixes, never add games.
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {currentSource} from './guard-followup.js';
import {mergeContinuation} from './stall-research.js';
export const readPacked=p=>JSON.parse(gunzipSync(readFileSync(p)));
export function stage2Source(){
 const d='reports/guard-followup-2026-10-24/';
 return [...mergeContinuation(currentSource(),readPacked(d+'continuations.json.gz').map(r=>r.game)).games,...readPacked(d+'new-D.json.gz').map(r=>r.game)];
}
