import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {validateBoard,definitionKey} from '../src/board-lab.js';
import {verifyGame} from './tactics-completion.js';
const dir=process.env.MASK_REPORT??'reports/mask-lab-2026-10-22';
const read=name=>JSON.parse(readFileSync(`${dir}/${name}`)),unpack=name=>JSON.parse(gunzipSync(readFileSync(`${dir}/${name}.gz`)));
const corpus=unpack('corpus.json'),keys=new Set(),ids=new Map();
for(const r of corpus.accepted){const v=validateBoard(r.board);if(!v.ok)throw Error('Invalid saved board '+r.id);const key=definitionKey(r.board);if(keys.has(key))throw Error('Duplicate board');if(ids.has(r.id)&&ids.get(r.id)!==key)throw Error('Board ID collision');keys.add(key);ids.set(r.id,key);}
const games=unpack('games.json'),archive=existsSync(`${dir}/exploratory-games.json.gz`)?unpack('exploratory-games.json'):[],unique=new Map();let recordPlies=0;
for(const g of [...archive,...games]){
 verifyGame(g);recordPlies+=g.history.length;
 const old=unique.get(g.id);
 if(old){if(JSON.stringify(old.initial)!==JSON.stringify(g.initial)||JSON.stringify(old.policies)!==JSON.stringify(g.policies)||old.seed!==g.seed)throw Error('Game ID collision');const shorter=old.history.length<g.history.length?old:g,longer=shorter===old?g:old;for(let i=0;i<shorter.history.length;i++)if(JSON.stringify(shorter.history[i].a)!==JSON.stringify(longer.history[i].a))throw Error('Continuation prefix mismatch');}
 unique.set(g.id,g);
}
const report=read('summary.json');if(report.totalUniqueNewGames!==unique.size)throw Error('Game count mismatch');
const first=[...unique.values()].filter(g=>g.state.winner===g.starter).length,second=[...unique.values()].filter(g=>g.state.winner!==null&&g.state.winner!==g.starter).length;
if(first!==report.combinedUnique.first||second!==report.combinedUnique.second||unique.size-first-second!==report.combinedUnique.unresolved)throw Error('Outcome count mismatch');
const hashes=Object.fromEntries(['corpus.json.gz','corpus-v1.json.gz','initial-trap-audit.json','games.json.gz','exploratory-games.json.gz','library.json','summary.json'].filter(name=>existsSync(`${dir}/${name}`)).map(name=>[name,createHash('sha256').update(readFileSync(`${dir}/${name}`)).digest('hex')]));
const result={legalBoards:keys.size,recordsVerified:archive.length+games.length,uniqueGames:unique.size,duplicatesExcluded:archive.length+games.length-unique.size,recordPlies,uniquePlies:[...unique.values()].reduce((a,g)=>a+g.history.length,0),first,second,unresolved:unique.size-first-second,hashes};writeFileSync(`${dir}/verification.json`,JSON.stringify(result,null,2)+'\n');console.log(result);
