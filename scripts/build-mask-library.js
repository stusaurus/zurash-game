import {writeFileSync} from 'node:fs';
import {generateBoard,SHAPES} from '../src/board-lab.js';
const records=[];
for(const shape of Object.keys(SHAPES).filter(x=>x!=='mask')){
 let found;
 for(let seed=1;seed<=500&&!found;seed++)try{found=generateBoard({width:shape==='square'?7:9,height:7,shape,corridor:3,stars:5,walls:6,target:3,seed});}catch{}
 if(!found)throw Error('No sample '+shape);records.push(found);
}
writeFileSync('src/mask-library.js','// Reproducible legality-checked examples, not fairness-certified.\nexport const MASK_LIBRARY = '+JSON.stringify(records,null,2)+';\n');
console.log(records.map(r=>[r.shape,r.seed,r.board.playableCells.length]));
