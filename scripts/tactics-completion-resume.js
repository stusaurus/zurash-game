// Usage: node scripts/tactics-completion-resume.js checkpoint.json output.json
// Optional MAX_PLIES / RESUME_MS increase research budgets; policies and RNG are retained.
import fs from 'node:fs';import {advanceGame,verifyGame} from './tactics-completion.js';
const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Pass checkpoint.json and output.json');
const g=advanceGame(JSON.parse(fs.readFileSync(input)),{maxPlies:Number(process.env.MAX_PLIES??16384),timeBudgetMs:Number(process.env.RESUME_MS??10000),onCheckpoint:g=>fs.writeFileSync(output,JSON.stringify(g))});
verifyGame(g);fs.writeFileSync(output,JSON.stringify(g,null,2)+'\n');console.log(JSON.stringify({reason:g.reason,winner:g.state.winner,ply:g.state.ply}));
