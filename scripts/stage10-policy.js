// Research-only calibration. Production strong is called without modification.
import {choose} from '../src/ai.js';
import {researchDecision} from './defense-path-ai.js';
export function stage10Decision(s,{variant,rng,seen}) {
 if(!['control','win-guard','path','strong'].includes(variant))throw Error('Unknown stage ten policy');
 return variant==='strong'?{action:choose(s,{level:'strong',rng,seen}),stats:null}:researchDecision(s,{variant,rng,seen});
}
