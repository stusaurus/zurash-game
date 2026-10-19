import {DIRECTIONS,MODES,initialDuration,successorsDuration,stateKeyDuration}
 from "./duration-engine.js";
import {chooseDuration} from "./duration-ai.js";
const el=id=>document.getElementById(id);
const copy=s=>structuredClone(s);
let state,selectedWall=null,firstWall=null,secondWall=null,phase="first";
let modeId="quick7",opponent="cpu",curryEnabled=true,starter=0;
let seen=new Map(),history=[],turnHistory=[],worker=null,epoch=0,waiting=false;
let startMs=Date.now(),endMs=null,seed=2007,cacheKey="",cacheActions=[];
const sameWall=(a,b)=>a===null?b===null:(b!==null&&a.wall===b.wall&&a.to===b.to);
const keyAction=a=>JSON.stringify(a);
const currentActions=()=>{
 const key=stateKeyDuration(state)+":"+state.ply;
 if(key!==cacheKey){cacheKey=key;cacheActions=successorsDuration(state);}
 return cacheActions;
};
const isPower=()=>state.powers[state.turn]===1;
const durationSeconds=()=>Math.floor(((endMs??Date.now())-startMs)/1000);
const formatTime=seconds=>{
 const m=Math.floor(seconds/60),s=seconds%60;
 return String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
};
function updateClock(){
 if(!state)return;
 el("clock").textContent=formatTime(durationSeconds());
 el("turnCount").textContent=state.ply+"手";
}
function shiftedWalls(){
 const walls=state.walls.slice();
 if(firstWall)walls[firstWall.wall]=firstWall.to;
 if(secondWall)walls[secondWall.wall]=secondWall.to;
 return walls;
}
function arrow(from,to){
 if(from%state.size===to%state.size)return to<from?"↑":"↓";
 return to<from?"←":"→";
}
function render(){
 if(!state)return;
 const moves=currentActions(),power=isPower();
 const cpuTurn=opponent==="cpu"&&state.turn===1&&state.winner===null;
 const locked=waiting||cpuTurn||state.winner!==null;
 const walls=shiftedWalls(),selecting=phase==="first"||phase==="second";
 const shifts=!locked&&selecting?moves.filter(x=>
  phase==="first"?x.a.wall!==null:
   sameWall(x.a.wall,firstWall)&&x.a.secondWall!==null):[];
 const shiftOf=a=>phase==="first"?a.wall:a.secondWall;
 const wallIds=new Set(shifts.map(x=>shiftOf(x.a).wall));
 const destinations=new Map(shifts.filter(x=>shiftOf(x.a).wall===selectedWall)
  .map(x=>[shiftOf(x.a).to,shiftOf(x.a)]));
 const slides=!locked&&phase==="slide"?moves.filter(x=>
  sameWall(x.a.wall,firstWall)&&sameWall(x.a.secondWall,secondWall)):[];
 const possibleStops=new Map(slides.map(x=>[x.n.players[state.turn],x]));
 const board=el("board");board.replaceChildren();
 board.dataset.size=String(state.size);
 board.style.setProperty("--board-size",String(state.size));
 const count=state.size*state.size;
 for(let i=0;i<count;i++){
  const wi=walls.indexOf(i),player=state.players.indexOf(i);
  const target=destinations.get(i),stop=possibleStops.get(i);
  const btn=document.createElement("button");btn.className="cell";
  btn.dataset.cell=String(i);
  if(wi!==-1){btn.classList.add("wall");if(wallIds.has(wi))btn.classList.add("available");}
  if(selectedWall===wi&&selecting)btn.classList.add("selected");
  if(target)btn.classList.add("target");
  if(stop)btn.classList.add("stop");
  btn.disabled=locked||!(target||stop||(wi!==-1&&wallIds.has(wi)));
  let thing="氷";
  if(target){btn.textContent=arrow(walls[target.wall],target.to);thing="壁の移動先";}
  else if(player!==-1){btn.textContent=player===0?"🟠":"🔵";thing="プレイヤー"+(player+1);}
  else if(wi!==-1){btn.textContent="▣";thing="壁";}
  else if(state.stars.includes(i)){btn.textContent="★";btn.classList.add("star");thing="星";}
  else if(state.curries.includes(i)){btn.textContent="🍛";btn.classList.add("curry");thing="カレー";}
  btn.setAttribute("aria-label",Math.floor(i/state.size)+1+"行"+(i%state.size+1)+"列 "+thing);
  btn.onclick=()=>{
   if(stop){complete(stop);return;}
   if(target){
    if(phase==="first"){
     firstWall=target;secondWall=null;phase=power?"second":"slide";
    }else{secondWall=target;phase="slide";}
    selectedWall=null;render();return;
   }
   if(wi!==-1&&wallIds.has(wi)){selectedWall=wi;render();}
  };
  board.append(btn);
 }
 el("scores").innerHTML=[0,1].map(p=>'<div class="score '+(state.turn===p?"current":"")+'"><strong>'+
   (p===0?(opponent==="cpu"?"あなた":"プレイヤー1"):
      opponent==="cpu"?"CPU（実験用）":"プレイヤー2")+
   '</strong><div class="stars">'+("★".repeat(state.scores[p]))+
   ("☆".repeat(state.target-state.scores[p]))+
   '</div><span class="power">'+(state.powers[p]?"🍛 次の自分の番に壁を2個まで":
     "壁1個まで")+"</span></div>").join("");
 el("status").textContent=state.winner!==null?"勝負あり！":
  locked?"CPUが考えています…":phase==="first"?
  "① 壁を選ぼう"+(power?" 🍛パワー発動中！":""):
  phase==="second"?"② もう1個の壁を動かせるよ（省略OK）":"③ 滑る方向を選ぼう";
 const directions=el("directions");directions.replaceChildren();
 for(let dir=0;dir<4;dir++){
  const btn=document.createElement("button");btn.textContent=DIRECTIONS[dir].symbol;
  btn.setAttribute("aria-label",DIRECTIONS[dir].label+"へ滑る");
  const item=slides.find(x=>x.a.dir===dir);
  btn.disabled=locked||!item;btn.onclick=()=>item&&complete(item);
  directions.append(btn);
 }
 el("skip").disabled=locked||!selecting;
 el("skip").textContent=phase==="second"?"2個目は動かさず滑る →":"壁は動かさず滑る →";
 el("undo").disabled=waiting||(history.length===0&&phase==="first");
 el("last").textContent=turnHistory.at(-1)?.message||"";
 updateClock();
}
function remember(){
 const k=stateKeyDuration(state);seen.set(k,(seen.get(k)||0)+1);
}
function recap(){
 const sums=[0,1].map(p=>turnHistory.filter(t=>t.player===p));
 const winner=state.winner,win=winner===0?"プレイヤー1":"プレイヤー2";
 const stats=sums.map(turns=>({
  food:turns.filter(t=>t.curry).length,
  double:turns.filter(t=>t.walls===2).length,
  stars:turns.filter(t=>t.star).length,
  moves:turns.length,
 }));
 el("resultMode").textContent=MODES[modeId].english+" · "+MODES[modeId].name+
  (curryEnabled?" ／ 🍛 カレーあり":" ／ カレーなし");
 el("resultTitle").textContent=(opponent==="cpu"?(winner===0?"あなた":"CPU"):win)+"の勝ち！";
 el("resultText").textContent="星 "+state.scores[0]+"対"+state.scores[1]+"・"+
  formatTime(durationSeconds())+"で決着（"+state.ply+"手）。"+
  (curryEnabled?
    (stats[0].double+stats[1].double?
      "壁2個移動が"+(stats[0].double+stats[1].double)+"回使われました。":
      "壁2個移動は使われませんでした。"):
   "壁1個のシンプルなルールで決着しました。");
 const entries=[
  "星の獲得：プレイヤー1 "+stats[0].stars+"個 ／ プレイヤー2 "+stats[1].stars+"個",
  curryEnabled?
   "カレー獲得：プレイヤー1 "+stats[0].food+"回 ／ プレイヤー2 "+stats[1].food+"回":
   "行動回数：プレイヤー1 "+stats[0].moves+"手 ／ プレイヤー2 "+stats[1].moves+"手",
 ];
 const list=el("resultStats");list.replaceChildren();
 for(const str of entries){const li=document.createElement("li");li.textContent=str;list.append(li);}
 if(!el("result").open)el("result").showModal();
}
function complete(item){
 if(waiting||state.winner!==null)return;
 const legal=currentActions().find(x=>keyAction(x.a)===keyAction(item.a));
 if(!legal)return;
 const actor=state.turn;
 history.push(copy(state));
 const n=legal.n;
 const walls=Number(legal.a.wall!==null)+Number(legal.a.secondWall!==null);
 turnHistory.push({
  player:actor,star:legal.gotStar,curry:legal.pickedCurry,walls,
  message:"プレイヤー"+(actor+1)+"：壁"+walls+"個 → "+
   DIRECTIONS[legal.a.dir].label+"へ滑る"+
   (legal.gotStar?" ★星ゲット！":"")+
   (legal.pickedCurry?" 🍛カレーゲット！":"")+
   (walls===2?" 🍛壁2個！":""),
 });
 state=n;cacheKey="";
 firstWall=null;secondWall=null;phase="first";selectedWall=null;
 remember();
 if(state.winner!==null)endMs=Date.now();
 render();
 if(state.winner!==null)recap();
 else if(opponent==="cpu"&&state.turn===1)runCPU();
}
function stopCPU(){
 epoch++;waiting=false;
 if(worker){worker.terminate();worker=null;}
}
function acceptCPU(action,id){
 if(id!==epoch||state.turn!==1||state.winner!==null)return;
 waiting=false;
 const options=currentActions();
 const found=options.find(x=>keyAction(x.a)===keyAction(action))||
   options.find(x=>x.n.winner===1)||
   options.find(x=>x.gotStar)||
   options[0];
 if(found)complete(found);else render();
}
function runCPU(){
 if(opponent!=="cpu"||state.turn!==1||state.winner!==null)return;
 const id=++epoch;waiting=true;render();
 const fallback=()=>{if(id!==epoch)return;
  worker?.terminate();worker=null;acceptCPU(null,id);};
 try{
  if(!worker)worker=new Worker(new URL("./duration-worker.js",import.meta.url),{type:"module"});
  worker.onmessage=({data})=>{
   if(id!==epoch||data?.id!==id)return;
   if(data.error)fallback();else acceptCPU(data.action,id);
  };
  worker.onerror=fallback;
  worker.postMessage({id,state:copy(state),seen:[...seen],seed});
  setTimeout(()=>{if(id===epoch&&waiting)fallback();},8000);
 }catch{fallback();}
}
function reset(){
 stopCPU();
 modeId=el("durationMode").value;opponent=el("opponent").value;
 curryEnabled=el("curryMode").value==="on";
 starter=Number(el("starter").value);
 state=initialDuration(modeId,curryEnabled,starter);
 history=[];turnHistory=[];seen=new Map();cacheKey="";
 selectedWall=null;firstWall=null;secondWall=null;phase="first";
 startMs=Date.now();endMs=null;
 seed=globalThis.crypto?.getRandomValues?
  crypto.getRandomValues(new Uint32Array(1))[0]:Math.floor(Math.random()*10000000);
 const p=MODES[modeId];
 el("modeEnglish").textContent=p.english;
 el("modeTitle").textContent=p.name;
 el("modeTagline").textContent=p.subtitle;
 el("modeSpec").textContent=p.size+"×"+p.size+" ／ 星"+p.target+
  "個先取 ／ 約"+p.targetMinutes+"分目標（未検証）";
 el("sizeChip").textContent=p.size+"×"+p.size;
 el("goalChip").textContent="星"+p.target+"個先取";
 el("modeInfo").textContent=p.name+"："+
  p.subtitle+"。目標時間は約"+p.targetMinutes+
  "分（未検証）。考える速さで前後します。カレー"+
  (curryEnabled?"あり：次の自分の番だけ壁2個移動が可能。":
    "なし：毎回、壁1個まで。");
 el("legendCurry").hidden=!curryEnabled;
 if(el("result").open)el("result").close();
 remember();render();
 if(opponent==="cpu"&&state.turn===1)runCPU();
}
el("new").onclick=reset;
el("replay").onclick=reset;
el("closeResult").onclick=()=>el("result").close();
for(const id of ["durationMode","curryMode"])
 el(id).addEventListener("change",reset);
el("skip").onclick=()=>{
 if(waiting||state.winner!==null)return;
 if(phase==="first"){firstWall=null;secondWall=null;phase="slide";}
 else if(phase==="second"){secondWall=null;phase="slide";}
 selectedWall=null;render();
};
el("undo").onclick=()=>{
 if(waiting)return;
 if(phase==="second"){
  firstWall=null;selectedWall=null;phase="first";render();return;
 }
 if(phase==="slide"){
  if(firstWall!==null&&isPower()){phase="second";secondWall=null;}
  else{phase="first";firstWall=null;secondWall=null;}
  selectedWall=null;render();return;
 }
 if(!history.length)return;
 stopCPU();endMs=null;
 state=history.pop();turnHistory.pop();
 if(opponent==="cpu"){
  while(state.turn!==0&&history.length){state=history.pop();turnHistory.pop();}
 }
 seen=new Map();for(const old of history){
  const k=stateKeyDuration(old);seen.set(k,(seen.get(k)||0)+1);
 }
 cacheKey="";remember();
 phase="first";firstWall=null;secondWall=null;selectedWall=null;
 if(el("result").open)el("result").close();
 render();
 if(opponent==="cpu"&&state.turn===1)runCPU();
};
setInterval(updateClock,1000);
reset();
