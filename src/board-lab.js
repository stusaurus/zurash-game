import {actions,successors,distances,key,initial,mobility} from './engine.js';
import {toBoardState,widthOf,heightOf,dimensions,MAX_SIDE} from './geometry.js';
import {seeded} from './ai.js';
export const GENERATOR_VERSION='mask-lab-2';
export const STATUSES=['未検証','合法性確認済み','AI検証中','有望候補','独立検証済み','公式認定候補'];
export const SHAPES={rectangle:'長方形',square:'正方形',L:'L字',T:'T字',cross:'十字',H:'H字',U:'U字',ring:'中央に穴',waist:'くびれ',stairs:'段差',rooms:'部屋と通路',mask:'自由マスク'};
export function makeMask(width,height,shape='rectangle',corridor=2,custom) {
  dimensions({width,height});
  if (!Object.hasOwn(SHAPES,shape)) throw Error('未知の形状');
  if (!Number.isInteger(corridor)||corridor<1||corridor>Math.min(width,height)) throw Error('通路幅が不正');
  if (shape==='square'&&width!==height) throw Error('正方形は幅と高さを揃えてください');
  if (shape==='mask') return toBoardState({width,height,playableCells:custom,walls:[],stars:[],players:[]}).playableCells;
  const cx=(width-1)/2,cy=(height-1)/2;
  return Array.from({length:width*height},(_,i)=>i).filter(i=>{
    const x=i%width,y=Math.floor(i/width),vx=Math.abs(x-cx)<corridor/2,hy=Math.abs(y-cy)<corridor/2;
    switch(shape){
      case 'L': return x<corridor||y>=height-corridor;
      case 'T': return y<corridor||vx;
      case 'cross':return vx||hy;
      case 'H':return x<corridor||x>=width-corridor||hy;
      case 'U':return x<corridor||x>=width-corridor||y>=height-corridor;
      case 'ring':return x<corridor||x>=width-corridor||y<corridor||y>=height-corridor;
      case 'waist':return y<height/3||y>=2*height/3||vx;
      case 'stairs':return x<=Math.floor(y*width/height)+corridor;
      case 'rooms':return x<width/3||x>=2*width/3||hy;
      default:return true;
    }
  });
}
function connected(s){
 const cells=new Set(s.playableCells),q=[s.playableCells[0]],seen=new Set(q);
 for(let n=0;n<q.length;n++) {const i=q[n],x=i%s.width,y=Math.floor(i/s.width);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const a=x+dx,b=y+dy,j=b*s.width+a;if(a>=0&&a<s.width&&b>=0&&b<s.height&&cells.has(j)&&!seen.has(j)){seen.add(j);q.push(j);}}}
 return seen.size===cells.size;
}
// Conservative initial safety filter. Fixed-wall reachability is diagnostic only;
// it cannot establish reachability after wall operations, or eventual termination.
export function validateBoard(input) {
 const errors=[];let s;
 try{s=toBoardState(input);}catch(e){return {ok:false,errors:[e.message],diagnostics:{}};}
 const all=[...s.walls,...s.stars,...s.players],valid=new Set(s.playableCells);
 if(s.players.length!==2||s.players[0]===s.players[1])errors.push('初期位置は異なる2マス');
 if(all.some(i=>!Number.isInteger(i)||!valid.has(i)))errors.push('有効マス外の配置');
 if(new Set(all).size!==all.length)errors.push('壁・星・駒の重複');
 if(!Number.isInteger(s.target)||s.target<1||s.target>32||s.stars.length<2*s.target-1)errors.push('星数と先取数が矛盾');
 if(!s.playableCells.length||!connected(s))errors.push('有効マスが不連続');
 if(errors.length)return {ok:false,errors,diagnostics:{}};
 if([0,1].some(p=>!mobility(s,p).length))errors.push('初期状態で滑走不能');
 const openingActions=[0,1].map(turn=>actions({...s,turn}).length);
 if(openingActions.some(n=>!n))errors.push('合法な初手なし');
 const fixedWallReachable=[0,1].map(p=>{const d=distances(s,p);return s.stars.filter(i=>Number.isFinite(d[i]));});
 return {ok:!errors.length,errors,state:s,diagnostics:{openingActions,fixedWallReachable,terrainConnected:true,reachability:'固定壁の参考値。壁操作を含む取得可能性・決着は未証明'}};
}
export function parseBoardJSON(text) {
 if(typeof text!=='string'||text.length>65536)throw Error('JSONは64KB以下');
 const data=JSON.parse(text),v=validateBoard(data.board??data.state??data);
 if(!v.ok)throw Error(v.errors.join('／'));return v.state;
}
export function boardID(s) {
 // Full canonical definition is retained as the collision-free duplicate key.
 const canonical=definitionKey(s);let hash=2166136261;
 for(const c of canonical)hash=Math.imul(hash^c.charCodeAt(0),16777619);
 return 'z-'+(hash>>>0).toString(16).padStart(8,'0');
}
export function definitionKey(s){const n=toBoardState(s);return JSON.stringify([n.width,n.height,n.playableCells,[...n.walls].sort((a,b)=>a-b),[...n.stars].sort((a,b)=>a-b),n.players,n.target]);}
export function recordBoard(board,metadata={}){
 const v=validateBoard(board);if(!v.ok)throw Error(v.errors.join('／'));
 return {id:boardID(v.state),name:'研究盤面',generatorVersion:GENERATOR_VERSION,seed:null,algorithm:'import',status:'合法性確認済み',metrics:null,games:0,unresolvedRate:null,...metadata,board:v.state,diagnostics:v.diagnostics};
}
export function generateBoard({width=7,height=7,shape='rectangle',corridor=2,stars=5,walls=8,target=3,seed=1,symmetry='none',starBias='random',wallBias='random',players,playableCells,holes=0}={}) {
 dimensions({width,height});
 if(![stars,walls,target,seed,holes].every(Number.isInteger)||stars<1||walls<0||holes<0||stars>64||walls>64||target<1||target>32)throw Error('生成条件が範囲外');
 if(!['none','rotation'].includes(symmetry)||!['random','central','dispersed'].includes(starBias)||!['random','central','outer'].includes(wallBias))throw Error('未知の配置条件');
 const rng=seeded(seed),mask=makeMask(width,height,shape,corridor,playableCells);
 for(let k=0;k<holes;k++){if(!mask.length)break;mask.splice(Math.floor(rng()*mask.length),1);}
 if(stars+walls+2>mask.length)throw Error('配置するマスが不足');
 const pair=i=>width*height-1-i;
 if(symmetry==='rotation'&&mask.some(i=>!mask.includes(pair(i))))throw Error('外形が回転対称でない');
 const distance=(i,j)=>Math.abs(i%width-j%width)+Math.abs(Math.floor(i/width)-Math.floor(j/width));
 const p=players?[...players]:[mask[0],mask.reduce((a,b)=>distance(mask[0],a)>distance(mask[0],b)?a:b)];
 if(symmetry==='rotation'&&!players)p[1]=pair(p[0]);
 if(symmetry==='rotation'&&p[1]!==pair(p[0]))throw Error('初期位置が回転対称でない');
 const used=new Set(p),center=i=>Math.abs(i%width-(width-1)/2)+Math.abs(Math.floor(i/width)-(height-1)/2);
 const take=(count,bias)=>{
   const out=[];
   while(out.length<count){
    const options=mask.filter(i=>!used.has(i)).map(i=>({i,v:rng()+(bias==='central'?center(i):bias==='outer'?-center(i):bias==='dispersed'&&out.length?-Math.min(...out.map(j=>distance(i,j))):0)})).sort((a,b)=>a.v-b.v);
    let found=false;
    for(const {i} of options){const group=symmetry==='rotation'?[...new Set([i,pair(i)])]:[i];if(group.length>count-out.length||group.some(j=>used.has(j)))continue;
     for(const j of group){out.push(j);used.add(j);}found=true;break;
    }
    if(!found)throw Error('対称性と個数が両立しない');
   }return out;
 };
 const starCells=take(stars,starBias),wallCells=take(walls,wallBias);
 return recordBoard({width,height,playableCells:mask,stars:starCells,walls:wallCells,players:p,target},{name:SHAPES[shape]+'・'+seed,seed,shape,algorithm:symmetry==='rotation'?'symmetric-constraint':'seeded-constraint',parameters:{width,height,shape,corridor,stars,walls,target,seed,symmetry,starBias,wallBias,holes}});
}
// Local search preserves all untouched components and validates every mutation.
export function mutateBoard(record,{kind='stars',seed=1}={}) {
 const s=toBoardState(record.board??record),rng=seeded(seed);
 if(!['stars','walls','shape','multiple'].includes(kind))throw Error('未知の変異');
 const change=field=>{if(!s[field].length)return;const occupied=[...s.players,...s.walls,...s.stars],free=s.playableCells.filter(i=>!occupied.includes(i));if(!free.length)throw Error('変異先なし');s[field][Math.floor(rng()*s[field].length)]=free[Math.floor(rng()*free.length)];};
 if(kind==='stars'||kind==='multiple')change('stars');
 if(kind==='walls'||kind==='multiple')change('walls');
 if(kind==='shape'||kind==='multiple'){const occupied=[...s.players,...s.walls,...s.stars],free=s.playableCells.filter(i=>!occupied.includes(i));if(!free.length)throw Error('変異先なし');s.playableCells=s.playableCells.filter(i=>i!==free[Math.floor(rng()*free.length)]);}
 return recordBoard(s,{seed,algorithm:'mutation-'+kind,parent:record.id??boardID(record.board??record),name:'変異・'+seed,shape:kind==='shape'||kind==='multiple'?'mask':record.shape});
}
// Bounded constructive witness; a miss is UNKNOWN, never unreachable proof.
export function captureWitness(board,p,{maxNodes=80}={}){
 const start=initial(board,p),q=[{s:start,path:[]}],seen=new Set([key(start)]);let nodes=0;
 for(let i=0;i<q.length&&nodes<maxNodes;i++){
  const {s,path}=q[i];nodes++;
  for(const {a,n} of successors(s)){
   if(n.scores[p]>0)return {status:'witness',nodes,path:[...path,a]};
   const k=key(n);if(!seen.has(k)&&q.length<maxNodes){seen.add(k);q.push({s:n,path:[...path,a]});}
  }
 }
 return {status:'unknown-budget',nodes};
}
export {MAX_SIDE,widthOf,heightOf};
