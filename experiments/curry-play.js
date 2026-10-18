import {DIRS,clone} from "../src/engine.js";
import {seeded} from "../src/ai.js";
import {turnSeed} from "../src/cpu-seed.js";
import {initialCurry,successorsCurry,stateKeyCurry} from "./curry-power.js";
import {chooseCurry} from "./curry-ai.js";
const el=id=>document.getElementById(id);
const PAIR={0:[7,41],1:[7,41],2:[13,35]};
let state,phase="wall",selectedWall=null,pendingWall=null,seen=new Map(),history=[],
    moveLog=[],mode="cpu",layout=2,starter=0,worker=null,epoch=0,waiting=false,seed=37;
const cloneState=s=>structuredClone(s);
const actions=()=>successorsCurry(state,2);
function sameWall(a,b){
 return a===null?b===null:b!==null&&a.wall===b.wall&&a.to===b.to&&
       (a.steps||1)===(b.steps||1);
}
function wallDirs(move){
 const from=state.walls[move.wall],to=move.to;
 if(to%7===from%7)return to<from?"↑":"↓";
 return to<from?"←":"→";
}
function render(){
 const opts=actions(),cpuTurn=mode==="cpu"&&state.turn===1&&state.winner===null;
 const locked=waiting||cpuTurn||state.winner!==null;
 const canMove=phase==="wall"&&!locked;
 const movers=new Set(opts.filter(x=>x.a.wall).map(x=>x.a.wall.wall));
 const targetMoves=selectedWall===null?[]:opts.filter(x=>x.a.wall&&x.a.wall.wall===selectedWall);
 const targets=new Map(targetMoves.map(x=>[x.a.wall.to,x.a.wall]));
 const slideMoves=phase==="slide"?opts.filter(x=>sameWall(x.a.wall,pendingWall)):[];
 const stops=new Map(slideMoves.map(x=>[x.n.players[state.turn],x]));
 const board=el("board");board.replaceChildren();
 for(let i=0;i<49;i++){
  const wi=state.walls.indexOf(i),player=state.players.indexOf(i);
  const wallTarget=canMove?targets.get(i):null,stop=!locked?stops.get(i):null;
  const b=document.createElement("button");b.className="cell";
  if(wi!==-1)b.classList.add("wall");
  if(wi!==-1 && canMove && movers.has(wi))b.classList.add("available");
  if(wi===selectedWall && canMove)b.classList.add("selected");
  if(wallTarget)b.classList.add("target");
  if(stop)b.classList.add("stop");
  b.dataset.cell=String(i);
  const item=player!==-1?"プレイヤー"+(player+1):wi!==-1?"壁":state.stars.includes(i)?"星":state.curries.includes(i)?"カレー":"氷";
  b.setAttribute("aria-label",(Math.floor(i/7)+1)+"行"+(i%7+1)+"列 "+item+(wallTarget?" 壁移動先 "+(wallTarget.steps||1)+"マス":"")+(stop?" 滑走先":""));
  b.disabled=locked||!(wallTarget||stop||(canMove&&wi>=0&&movers.has(wi)));
  if(wallTarget)b.textContent=wallDirs(wallTarget)+(wallTarget.steps>1?wallTarget.steps:"");
  else if(player!==-1)b.innerHTML='<span class="pawn p'+player+'">'+(player===0?"🟠":"🔵")+'</span>';
  else if(wi!==-1)b.textContent="▣";
  else if(state.stars.includes(i))b.innerHTML='<span class="star">★</span>';
  else if(state.curries.includes(i))b.innerHTML='<span class="curry">🍛</span>';
  b.onclick=()=>{
   if(stop)complete(stop);
   else if(wallTarget){pendingWall=wallTarget;selectedWall=null;phase="slide";render();}
   else if(wi>=0){selectedWall=wi;render();}
  };
  board.append(b);
 }
 el("scores").innerHTML=[0,1].map(p=>'<div class="score '+(state.turn===p?"current":"")+'">'+
  '<strong>'+(p===0?(mode==="cpu"?"あなた":"プレイヤー1"):(mode==="cpu"?"CPU（つよい）":"プレイヤー2"))+'</strong>'+
  '<div class="stars">'+("★".repeat(state.scores[p]))+("☆".repeat(3-state.scores[p]))+'</div>'+
  '<span class="power">'+(state.powers[p]?"🍛 次の自分の番：壁＋2マス":"壁は通常1マス")+'</span></div>').join("");
 const power=state.powers[state.turn]===1;
 el("status").textContent=state.winner!==null?"勝負あり！":waiting||cpuTurn?"CPUが考えています…":
   phase==="slide"?"③ 止まる方向を選ぼう":
   selectedWall!==null?"② 壁の移動先を選ぼう"+(power?"（最大3マス）":"（1マス）"):
   "① 壁を選ぼう"+(power?" 🍛 カレーパワー！最大3マス":"");
 el("directions").replaceChildren();
 DIRS.forEach((d,direction)=>{
  const btn=document.createElement("button");btn.textContent=d.icon;
  btn.setAttribute("aria-label",d.name+"へ滑る");
  const entry=slideMoves.find(x=>x.a.dir===direction);
  btn.disabled=locked||!entry;
  btn.onclick=()=>{if(entry)complete(entry);};
  el("directions").append(btn);
 });
 el("skip").disabled=!canMove;
 el("undo").disabled=waiting||(history.length===0&&phase==="wall");
 el("last").textContent=moveLog.at(-1)||"";
}
function remember(){
 const id=stateKeyCurry(state);seen.set(id,(seen.get(id)||0)+1);
}
function complete(move){
 if(waiting||state.winner!==null)return;
 // Only full, engine-validated actions are accepted.
 if(!actions().some(x=>JSON.stringify(x.a)===JSON.stringify(move.a)))return;
 const actor=state.turn;
 history.push(cloneState(state));
 state=cloneState(move.n);
 moveLog.push((actor===0?"プレイヤー1":"プレイヤー2")+
  "："+(move.a.wall?"壁を"+(move.a.wall.steps||1)+"マス移動":"壁はそのまま")+
  " → "+DIRS[move.a.dir].name+"に滑走"+
  (move.picked?" 🍛ゲット！":"")+(move.boostUsed?" パワー使用！":"")+
  (state.scores[actor]>history.at(-1).scores[actor]?" ★ゲット！":""));
 phase="wall";selectedWall=null;pendingWall=null;remember();render();
 if(state.winner!==null){
  el("resultTitle").textContent=(mode==="cpu"?(state.winner===0?"あなた":"CPU"):"プレイヤー"+(state.winner+1))+"の勝ち！";
  el("resultText").textContent=state.scores.join("対")+"、"+state.ply+"手。カレーのパワーは次の自分の手番だけ！";
  if(!el("result").open)el("result").showModal();
 }else if(mode==="cpu"&&state.turn===1)runCPU();
}
function stopCPU(){
 epoch++;waiting=false;
 if(worker){worker.terminate();worker=null;}
}
function runCPU(){
 if(state.winner!==null||state.turn!==1||mode!=="cpu")return;
 const id=++epoch;waiting=true;render();
 const fallback=()=>{
  if(id!==epoch)return;
  const choice=chooseCurry(state,{level:"greedy",rng:seeded(turnSeed(seed,state.ply)),seen});
  accept(choice,id);
 };
 try{
  if(!worker)worker=new Worker(new URL("./curry-worker.js",import.meta.url),{type:"module"});
  worker.onmessage=({data})=>{
   if(id!==epoch||!data||data.id!==id)return;
   if(data.error)fallback();else accept(data.action,id);
  };
  worker.onerror=()=>{if(id===epoch){worker?.terminate();worker=null;fallback();}};
  worker.postMessage({id,state:cloneState(state),history:[...seen],seed,level:"strong"});
  setTimeout(()=>{if(id===epoch&&waiting){worker?.terminate();worker=null;fallback();}},6000);
 }catch{worker?.terminate();worker=null;fallback();}
}
function accept(a,id){
 if(id!==epoch)return;
 const entry=actions().find(x=>JSON.stringify(x.a)===JSON.stringify(a));
 if(!entry){
  const backup=actions()[0];
  if(!backup){waiting=false;render();return;}
  a=backup.a;
 }
 waiting=false;
 complete(actions().find(x=>JSON.stringify(x.a)===JSON.stringify(a)));
}
function reset(){
 stopCPU();mode=el("mode").value;layout=Number(el("layout").value);
 starter=Number(el("starter").value);seed=globalThis.crypto?.getRandomValues?
   crypto.getRandomValues(new Uint32Array(1))[0]:Math.floor(Math.random()*4294967296);
 state=initialCurry(layout,starter,PAIR[layout]);
 history=[];moveLog=[];seen=new Map();phase="wall";selectedWall=null;pendingWall=null;
 if(el("result").open)el("result").close();
 remember();render();
 if(mode==="cpu"&&state.turn===1)runCPU();
}
el("skip").onclick=()=>{if(waiting||state.winner!==null)return;phase="slide";pendingWall=null;selectedWall=null;render();};
el("undo").onclick=()=>{
 if(waiting)return;
 if(phase==="slide"){phase="wall";selectedWall=null;pendingWall=null;render();return;}
 if(!history.length)return;
 stopCPU();
 state=history.pop();moveLog.pop();
 if(mode==="cpu"){
  while(state.turn!==0&&history.length){state=history.pop();moveLog.pop();}
 }
 seen=new Map();
 history.forEach(s=>{const k=stateKeyCurry(s);seen.set(k,(seen.get(k)||0)+1);});
 remember();phase="wall";selectedWall=null;pendingWall=null;
 if(el("result").open)el("result").close();
 render();
 if(mode==="cpu"&&state.turn===1)runCPU();
};
el("new").onclick=reset;
el("replay").onclick=reset;
el("closeResult").onclick=()=>el("result").close();
reset();
