import {DIRS} from "../src/engine.js";
import {seeded} from "../src/ai.js";
import {turnSeed} from "../src/cpu-seed.js";
import {stateKeyCurry} from "./curry-power.js";
import {initialTwoWall,successorsTwoWall,matchesShift} from "./curry-two-wall.js";
import {chooseTwoWall} from "./curry-two-wall-ai.js";
const el=id=>document.getElementById(id);
const PAIR={0:[7,41],1:[7,41],2:[21,27]};
let state,phase="first",selectedWall=null,firstWall=null,secondWall=null,seen=new Map(),history=[],
    moveLog=[],mode="cpu",layout=2,starter=0,curryEnabled=true,worker=null,epoch=0,waiting=false,seed=37;
const copy=s=>structuredClone(s);
const successors=()=>successorsTwoWall(state);
const boosted=()=>state.powers[state.turn]===1;
function shiftedWalls(){
  const walls=[...state.walls];
  if(firstWall)walls[firstWall.wall]=firstWall.to;
  if(secondWall)walls[secondWall.wall]=secondWall.to;
  return walls;
}
function dirSymbol(from,to){
  if(from%7===to%7)return to<from?"↑":"↓";
  return to<from?"←":"→";
}
function render(){
  const moves=successors(),power=boosted();
  const cpuTurn=mode==="cpu"&&state.turn===1&&state.winner===null;
  const locked=waiting||cpuTurn||state.winner!==null;
  const choiceStage=phase==="first"||phase==="second";
  const walls=shiftedWalls();
  const candidateMoves=!locked&&choiceStage?moves.filter(x=>phase==="first"?
    x.a.wall!==null:matchesShift(x.a.wall,firstWall)&&x.a.secondWall!==null):[];
  const wallOf=x=>phase==="first"?x.a.wall:x.a.secondWall;
  const allowedWalls=new Set(candidateMoves.map(x=>wallOf(x).wall));
  const allowedTargets=new Map(candidateMoves.filter(x=>wallOf(x).wall===selectedWall).map(x=>[wallOf(x).to,wallOf(x)]));
  const slides=!locked&&phase==="slide"?moves.filter(x=>
    matchesShift(x.a.wall,firstWall)&&matchesShift(x.a.secondWall,secondWall)):[];
  const stops=new Map(slides.map(x=>[x.n.players[state.turn],x]));
  const board=el("board");board.replaceChildren();
  if(power)board.classList.add("power-enabled");else board.classList.remove("power-enabled");
  for(let i=0;i<49;i++){
    const wi=walls.indexOf(i),p=state.players.indexOf(i);
    const target=allowedTargets.get(i),stop=stops.get(i);
    const btn=document.createElement("button");
    btn.className="cell";btn.dataset.cell=String(i);
    if(wi!==-1)btn.classList.add("wall");
    if(wi!==-1&&allowedWalls.has(wi))btn.classList.add("available");
    if(wi===selectedWall&&choiceStage)btn.classList.add("selected");
    if(target)btn.classList.add("target");
    if(stop)btn.classList.add("stop");
    const item=p!==-1?"プレイヤー"+(p+1):wi!==-1?"壁":state.stars.includes(i)?"星":state.curries.includes(i)?"カレー":"氷";
    btn.setAttribute("aria-label",(Math.floor(i/7)+1)+"行"+(i%7+1)+"列："+item+(target?" 壁移動先":"")+(stop?" 滑走先":""));
    btn.disabled=locked||!(target||stop||(wi>=0&&allowedWalls.has(wi)));
    if(target)btn.textContent=dirSymbol(walls[target.wall],target.to);
    else if(p!==-1)btn.textContent=p===0?"🟠":"🔵";
    else if(wi!==-1)btn.textContent="▣";
    else if(state.stars.includes(i))btn.innerHTML='<span class="star">★</span>';
    else if(state.curries.includes(i))btn.innerHTML='<span class="curry">🍛</span>';
    btn.onclick=()=>{
      if(stop)complete(stop);
      else if(target){
        if(phase==="first"){
          firstWall=target;secondWall=null;
          phase=power?"second":"slide";
        }else{
          secondWall=target;phase="slide";
        }
        selectedWall=null;render();
      }else if(wi>=0&&allowedWalls.has(wi)){
        selectedWall=wi;render();
      }
    };
    board.append(btn);
  }
  el("scores").innerHTML=[0,1].map(p=>'<div class="score '+(state.turn===p?"current":"")+'">'+
   '<strong>'+(p===0?(mode==="cpu"?"あなた":"プレイヤー1"):(mode==="cpu"?"CPU（実験）":"プレイヤー2"))+'</strong>'+
   '<div class="stars">'+("★".repeat(state.scores[p]))+("☆".repeat(3-state.scores[p]))+'</div>'+
   '<span class="power">'+(state.powers[p]?"🍛 次の自分の番に壁を2個まで":"通常は壁1個")+'</span></div>').join("");
  el("status").textContent=state.winner!==null?"勝負あり！":locked?"CPUが考えています…":
    phase==="first"?"① 壁を1個選ぼう"+(power?" 🍛パワー発動中！":""):
    phase==="second"?(selectedWall===null?"② もう1個、違う壁を動かせるよ（省略OK）":"② 2個目の壁の移動先を選ぼう"):
    "③ 滑る方向を選ぼう";
  const directions=el("directions");directions.replaceChildren();
  DIRS.forEach((d,dir)=>{
    const btn=document.createElement("button");btn.textContent=d.icon;
    btn.setAttribute("aria-label",d.name+"へ滑る");
    const move=slides.find(x=>x.a.dir===dir);
    btn.disabled=locked||!move;
    btn.onclick=()=>{if(move)complete(move)};
    directions.append(btn);
  });
  const skip=el("skip");
  skip.disabled=locked||!choiceStage;
  skip.textContent=phase==="second"?"2個目は動かさず滑る →":"壁は動かさず滑る →";
  el("undo").disabled=waiting||(history.length===0&&phase==="first");
  el("last").textContent=moveLog.at(-1)||"";
}
function remember(){
  const k=stateKeyCurry(state);seen.set(k,(seen.get(k)||0)+1);
}
function complete(entry){
  if(waiting||state.winner!==null)return;
  const found=successors().find(x=>JSON.stringify(x.a)===JSON.stringify(entry.a));
  if(!found)return;
  const p=state.turn;
  history.push(copy(state));
  const previous=state;
  state=copy(found.n);
  const count=Number(found.a.wall!==null)+Number(found.a.secondWall!==null);
  moveLog.push("プレイヤー"+(p+1)+"：壁を"+count+"個移動 → "+
     DIRS[found.a.dir].name+"に滑走"+(found.picked?" 🍛ゲット！":"")+
     (count===2?" 🍛壁2個！":"")+
     (state.scores[p]>previous.scores[p]?" ★ゲット！":""));
  phase="first";selectedWall=null;firstWall=null;secondWall=null;remember();render();
  if(state.winner!==null){
    el("resultTitle").textContent=(mode==="cpu"?(state.winner===0?"あなた":"CPU"):"プレイヤー"+(state.winner+1))+"の勝ち！";
    el("resultText").textContent=state.scores.join("対")+"、"+state.ply+"手。カレー効果は次の自分の番だけ！";
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
  const action=chooseTwoWall(state,{level:"greedy",rng:seeded(turnSeed(seed,state.ply)),seen});
  accept(action,id);
 };
 try{
  if(!worker)worker=new Worker(new URL("./curry-two-wall-worker.js",import.meta.url),{type:"module"});
  worker.onmessage=({data})=>{
    if(id!==epoch||!data||data.id!==id)return;
    if(data.error)fallback();else accept(data.action,id);
  };
  worker.onerror=()=>{if(id===epoch){worker?.terminate();worker=null;fallback();}};
  worker.postMessage({id,state:copy(state),history:[...seen],seed,level:"search"});
  setTimeout(()=>{if(id===epoch&&waiting){worker?.terminate();worker=null;fallback();}},6000);
 }catch{worker?.terminate();worker=null;fallback();}
}
function accept(a,id){
 if(id!==epoch)return;
 waiting=false;
 const possible=successors();
 const match=possible.find(x=>JSON.stringify(x.a)===JSON.stringify(a))||possible[0];
 if(match)complete(match);else render();
}
function reset(){
 stopCPU();
 mode=el("mode").value;
 layout=Number(el("layout").value);
 starter=Number(el("starter").value);
 curryEnabled=el("curryMode").value==="on";
 seed=globalThis.crypto?.getRandomValues?
  crypto.getRandomValues(new Uint32Array(1))[0]:Math.floor(Math.random()*4294967296);
 el("curryPair").disabled=!curryEnabled||layout!==2;
 el("curryPairLabel").hidden=!curryEnabled||layout!==2;
 const pair=layout===2?el("curryPair").value.split(",").map(Number):PAIR[layout];
 state=initialTwoWall(layout,starter,{curryEnabled,pair});
 el("legendCurry").hidden=!curryEnabled;
 el("modeDescription").textContent=curryEnabled?
  "🍛 カレーあり：取った次の自分の番だけ違う壁を2個まで、それぞれ1マス動かせる。先に星3個で勝利。":
  "カレーなし：カレーは出現しません。毎ターン壁を0〜1個、1マス動かしてから滑るシンプルな勝負です。先に星3個で勝利。";
 el("how").textContent=curryEnabled?
  "① 動かしたい壁をタップ → ② 光る移動先をタップ → ③ 滑る方向を選ぶ。ふだんは壁1個を1マス。カレーの次の自分の番だけ壁を2個まで、それぞれ1マスずつ動かせます。2個目は省略してOK。":
  "① 動かしたい壁をタップ → ② 光る移動先をタップ → ③ 滑る方向を選ぶ。壁は毎ターン1個だけ1マス移動。壁を動かさずに滑ってもOK。";
 seen=new Map();history=[];moveLog=[];
 phase="first";selectedWall=null;firstWall=null;secondWall=null;
 if(el("result").open)el("result").close();
 remember();render();
 if(mode==="cpu"&&state.turn===1)runCPU();
}
el("skip").onclick=()=>{
 if(waiting||state.winner!==null)return;
 if(phase==="first"){
  firstWall=null;secondWall=null;phase="slide";
 }else if(phase==="second"){
  secondWall=null;phase="slide";
 }
 selectedWall=null;render();
};
el("undo").onclick=()=>{
 if(waiting)return;
 if(phase==="slide"){
  if(firstWall!==null&&boosted()){
   phase="second";secondWall=null;
  }else{
   phase="first";firstWall=null;secondWall=null;
  }
  selectedWall=null;render();return;
 }
 if(phase==="second"){
  phase="first";firstWall=null;selectedWall=null;render();return;
 }
 if(!history.length)return;
 stopCPU();
 state=history.pop();moveLog.pop();
 if(mode==="cpu")while(state.turn!==0&&history.length){
  state=history.pop();moveLog.pop();
 }
 seen=new Map();
 history.forEach(s=>{
   const k=stateKeyCurry(s);seen.set(k,(seen.get(k)||0)+1);
 });
 remember();phase="first";firstWall=null;secondWall=null;selectedWall=null;
 if(el("result").open)el("result").close();
 render();
 if(mode==="cpu"&&state.turn===1)runCPU();
};
el("layout").addEventListener("change",()=>{
 const showFood=el("curryMode").value==="on"&&Number(el("layout").value)===2;
 el("curryPair").disabled=!showFood;
 el("curryPairLabel").hidden=!showFood;
});
el("curryMode").addEventListener("change",reset);
el("new").onclick=reset;
el("replay").onclick=reset;
el("closeResult").onclick=()=>el("result").close();
reset();
