import {openLearning,learningContext,learningFeature} from './learning.js';
import {widthOf,heightOf,isPlayable} from "./geometry.js";
import {mountLab} from "./lab-ui.js";
import {
  initial,
  ALL_LAYOUTS as LAYOUTS,
  clone,
  DIRS,
  movableWalls,
  moveWall,
  slideOptions,
  finishSlide,
  key,
  actions,
} from "./engine.js";
import { choose } from "./ai.js";
const $ = (id) => document.getElementById(id);
let state = initial(),
  turnStart = clone(state),
  phase = "wall",
  selected = null,
  mode = "cpu",
  history = [],
  moveLog = [],
  resultSeen = false,
  seen = new Map(),
  busy = false,
  epoch = 0,
  worker = null,
  cpuTimer = null,
  activeSettings = { layout: 0, starter: 0, level: "strong" },
  matchSeed = 0,
  customBoard = null,
  customName = "研究盤面";
for (let i = 4; i < LAYOUTS.length; i++) {
  const option = document.createElement('option'); option.value = i;
  const l = LAYOUTS[i]; option.textContent = `${l.name} · 星${l.stars.length}／壁${l.walls.length}／${l.target}個先取`;
  $("layout").append(option);
}
// Research recording is loaded only through an explicit research URL and starts on consent.
const playtest = new URLSearchParams(location.search).get('playtest') === '1'
  ? (await import('./playtest-record.js')).mountPlaytest(() => ({
      mode: !customBoard && activeSettings.layout >= 4 ? LAYOUTS[activeSettings.layout].id : null,
      opponent: mode, difficulty: mode === "cpu" ? activeSettings.level : null, state,
    })) : null;
let learningTurns=[], learningCounted=false;
const learningStore=openLearning({getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v),removeItem:k=>localStorage.removeItem(k)});
function renderLearning(){
 const m=learningStore.model, text=`あなたの学習対戦：${m.wins}勝 ${m.losses}敗 ${m.draws}引き分け・未決着 / 計${m.total}局 · ${m.samples}手を学習。${learningStore.warning}`;
 $('learningStats').textContent=text;$('learningStatus').textContent=text;
 $('learningStatus').hidden=!(mode==='cpu'&&activeSettings.level==='learning');
 $('learningUnresolved').hidden=!(mode==='cpu'&&activeSettings.level==='learning'&&state?.winner===null&&!learningCounted);
 $('learningOptions').hidden=$('cpuLevel').value!=='learning';
}
$('cpuLevel').addEventListener('change',renderLearning);
$('learningUnresolved').onclick=()=>{$('learningUnresolvedConfirm').hidden=false;};
$('learningUnresolvedNo').onclick=()=>{$('learningUnresolvedConfirm').hidden=true;};
$('learningUnresolvedYes').onclick=()=>{if(mode!=='cpu'||activeSettings.level!=='learning'||learningCounted||state.winner!==null)return;learningCounted=true;learningStore.finish(learningTurns,null);reset();};
$('learningReset').onclick=()=>{$('learningResetConfirm').hidden=false;};
$('learningResetNo').onclick=()=>{$('learningResetConfirm').hidden=true;};
$('learningResetYes').onclick=()=>{const cleared=learningStore.reset();$('learningResetConfirm').hidden=true;if(cleared&&mode==='cpu'&&activeSettings.level==='learning')reset();renderLearning();};
const tokenEls = [0, 1].map((p) => {
  const el = document.createElement("div");
  el.className = `token p${p + 1}`;
  el.innerHTML = `<div class="coin"></div><b>${p + 1}</b>`;
  $("tokens").append(el);
  return el;
});
function shiftArrow(from, to) {
  return ({ [-widthOf(state)]: "↑", [1]: "→", [widthOf(state)]: "↓", [-1]: "←" })[to - from] || "";
}
function cpuTurn() {
  return mode === "cpu" && state.turn === 1 && state.winner === null;
}
function remember() {
  const k = key(state);
  seen.set(k, (seen.get(k) || 0) + 1);
}
function render() {
  renderLearning();
  $("undo").hidden=mode === "cpu" && activeSettings.level === "learning";
  const locked = busy || cpuTurn() || state.winner !== null,
    moves = phase === "wall" ? movableWalls(state) : [],
    stops = phase === "slide" ? slideOptions(state) : [];
  $("board").replaceChildren();
  const width=widthOf(state),height=heightOf(state),wrap=$("board").parentElement;
  wrap.style.setProperty('--size',width);
  wrap.style.setProperty('--width',width);
  wrap.style.setProperty('--height',height);
  $("board").setAttribute('aria-label', `${width}×${height}のゲーム盤`);
  $("boardSpec").hidden = !customBoard && activeSettings.layout < 4;
  $("boardZoom").hidden = Math.max(width,height) <= 7;
  if (Math.max(width,height) <= 7) $("board").parentElement.classList.remove("zoomed");
  $("boardSpec").textContent = `${customBoard ? customName+"【研究用・未認定】" : LAYOUTS[activeSettings.layout].name} · 星${state.stars.length + state.scores[0] + state.scores[1]}個・壁${state.walls.length}個 · ${state.target}個先取`;
  $("helpVictory").textContent = `${state.target}個の星を先に取った人の勝ち。`;
  for (let i = 0; i < width * height; i++) {
    if (!isPlayable(state,i)) {
      const gap=document.createElement('span');gap.className='terrain-gap';gap.setAttribute('aria-hidden','true');$("board").append(gap);continue;
    }
    const wall = state.walls.indexOf(i),
      target = moves.find((m) => m.wall === selected && m.to === i),
      stop = stops.find((m) => m.to === i);
    const b = document.createElement("button");
    b.className =
      "cell" +
      (wall >= 0 ? " wall" : "") +
      (moves.some((m) => m.wall === wall) ? " available" : "") +
      (wall >= 0 && wall === selected ? " selected" : "") +
      (target ? " target" : "") +
      (stop ? " stop" : "");
    b.dataset.cell = i;
    const item = state.players.includes(i)
      ? `プレイヤー${state.players.indexOf(i) + 1}`
      : wall >= 0
        ? "壁"
        : state.stars.includes(i)
          ? "星"
          : "氷";
    b.setAttribute(
      "aria-label",
      `${Math.floor(i / width) + 1}行${(i % width) + 1}列 ${item}${target ? " 移動先" : ""}${stop ? " 滑走停止位置" : ""}${stop && state.stars.includes(i) ? " 星を獲得" : ""}`,
    );
    b.disabled =
      locked ||
      !(
        target ||
        stop ||
        (phase === "wall" && moves.some((m) => m.wall === wall))
      );
    if (state.stars.includes(i)) b.innerHTML = '<span class="star">★</span>';
    if (target) b.textContent = shiftArrow(state.walls[target.wall], target.to);
    b.onclick = () => {
      if (target) {
        state = moveWall(state, target);
        phase = "slide";
        selected = null;
        render();
      } else if (stop) playSlide(stop.dir);
      else {
        selected = wall;
        render();
      }
    };
    $("board").append(b);
  }
  tokenEls.forEach((el, p) => {
    const at = state.players[p];
    el.style.transform = `translate(${(at % width) * 100}%,${Math.floor(at / width) * 100}%)`;
  });
  $("scores").innerHTML = [0, 1]
    .map(
      (p) =>
        `<div class="score p${p + 1} ${state.turn === p ? "current" : ""} ${state.scores[p] === state.target - 1 && state.winner === null ? "match-point" : ""}"><span class="stars">${"★".repeat(state.scores[p])}${"☆".repeat(state.target - state.scores[p])}</span><strong>${p === 0 ? (mode === "cpu" ? "あなた" : "プレイヤー1") : mode === "cpu" ? `CPU（${({random: "やさしい", greedy: "ふつう", search: "つよい", strong: "恐つよ", learning: "学習"})[activeSettings.level]}）` : "プレイヤー2"}</strong><small>${p === 0 ? "オレンジ" : "みずいろ"} · ${state.scores[p]} / ${state.target}${state.scores[p] === state.target - 1 && state.winner === null ? " · あと1個で勝ち！" : ""}</small></div>`,
    )
    .join("");
  const last = moveLog.at(-1);
  const recap = $("lastMove");
  recap.hidden = !last;
  recap.classList.toggle("scored", Boolean(last?.scored));
  if (last) {
    const player = mode === "cpu"
      ? (last.player === 0 ? "あなた" : "CPU")
      : `プレイヤー${last.player + 1}`;
    recap.textContent =
      `${player}：${last.wallDirection ? `壁を${last.wallDirection}に移動` : "壁はそのまま"} → ${DIRS[last.dir].name}に滑走${last.scored ? " → ★ゲット！" : ""}`;
  }
  $("phaseBadge").textContent = phase === "wall" ? "1" : "2";
  $("phaseTitle").textContent =
    state.winner !== null
      ? "勝負あり！"
      : busy
        ? "トリケンが滑走中！"
        : cpuTurn()
          ? "CPUが考えています…"
          : `${mode === "cpu" ? "あなた" : `プレイヤー${state.turn + 1}`}：${phase === "wall" ? "壁をずらそう" : "方向を選んで滑ろう"}`;
  $("message").textContent =
    state.winner !== null
      ? "対戦終了。最後の盤面を見ながら、結果をもう一度確認できます。"
      : busy
        ? "滑走中です。動きが止まったら次の手番です。"
        : cpuTurn()
          ? "CPUが考えています。次のあなたの手番まで待ってね。"
          : (seen.get(key(state)) || 0) >= 3
      ? "同じ配置が続いています。別の壁や方向を試そう。"
      : phase === "wall"
        ? selected === null
          ? "光る壁をタップ。動かさず進んでもOK。"
          : "矢印のマスをタップして、壁を1マス移動。"
        : "光る停止マス、または下の矢印をタップ。";
  if (!locked && phase === "wall" && !actions(state).length) $("message").textContent = "合法手がありません。戻るか、新しい対戦を選んでください。";
  $("turnCount").textContent = `${state.winner === null ? state.ply + 1 : state.ply}手目`;
  $("skip").disabled = locked || phase !== "wall" || !slideOptions(state).length;
  $("skip").textContent =
    phase === "wall" ? "壁を動かさずに滑る →" : "停止マスか矢印を選ぼう";
  $("undo").disabled = busy || (!history.length && phase === "wall");
  $("undo").textContent = phase === "slide" && !busy && !cpuTurn()
    ? "↶ 選び直す" : "↶ 戻る";
  $("undo").setAttribute("aria-label", phase === "slide" && !busy && !cpuTurn()
    ? "この手番の壁と滑走方向を選び直す" : mode === "cpu" ? "あなたの前の手番まで戻る" : "前の手番に戻る");
  $("showResult").hidden = state.winner === null;
  $("showResult").disabled = busy;
  $("directions").replaceChildren();
  DIRS.forEach((d, dir) => {
    const b = document.createElement("button");
    b.textContent = d.icon;
    b.setAttribute("aria-label", d.name + "へ滑る");
    b.disabled =
      locked || phase !== "slide" || !stops.some((m) => m.dir === dir);
    b.onclick = () => playSlide(dir);
    $("directions").append(b);
  });
  $("cpuMode").classList.toggle("active", mode === "cpu");
  $("localMode").classList.toggle("active", mode === "local");
  $("cpuMode").setAttribute("aria-pressed", mode === "cpu");
  $("localMode").setAttribute("aria-pressed", mode === "local");
  if (state.winner !== null) {
    $("resultTitle").textContent =
      `${mode === "cpu" ? (state.winner === 0 ? "あなた" : "CPU") : `プレイヤー${state.winner + 1}`}の勝ち！`;
    $("resultText").textContent =
      `最終スコア ${state.scores[0]}対${state.scores[1]}。${state.ply}手目、${last?.wallDirection ? `壁を${last.wallDirection}へずらし` : "壁を動かさずに"}${DIRS[last?.dir ?? 0].name}へ滑走し、決勝の星をゲット！`;
    $("result").classList.toggle("defeat", mode === "cpu" && state.winner === 1);
    if (!busy && !resultSeen) {
      resultSeen = true;
      const token = epoch;
      setTimeout(() => {
        if (epoch === token && state.winner !== null && !$("result").open) {
          $("result").showModal();
          $("rematch").focus();
        }
      }, 420);
    }
  }
}
function flash() {
  const el = $("celebration");
  el.classList.remove("pop");
  void el.offsetWidth;
  el.innerHTML = "<span>★</span>";
  el.classList.add("pop");
}
async function playSlide(dir) {
  if (busy || state.winner !== null) return;
  const myEpoch = epoch,
    oldScore = state.scores.reduce((a, b) => a + b, 0);
  let next;
  try {
    next = finishSlide(state, dir);
  } catch {
    return;
  }
  const player = state.turn;
  const wallIndex = state.walls.findIndex((v, i) => v !== turnStart.walls[i]);
  const lastAction = {
    player, dir,
    wallDirection: wallIndex === -1
      ? null : shiftArrow(turnStart.walls[wallIndex], state.walls[wallIndex]),
    scored: next.scores[player] > state.scores[player],
  };
  learningTurns.push(mode==='cpu'&&activeSettings.level==='learning'&&player===0
    ? {context:learningContext(turnStart),feature:learningFeature(turnStart,{wall:wallIndex===-1?null:{wall:wallIndex},dir},next)} : null);
  history.push(clone(turnStart));
  moveLog.push(lastAction);
  playtest?.turn(turnStart, next);
  state = next;
  busy = true;
  selected = null;
  render();
  await new Promise((r) => setTimeout(r, 280));
  if (myEpoch !== epoch) return;
  busy = false;
  if(mode==='cpu'&&activeSettings.level==='learning'&&state.winner!==null&&!learningCounted){
    learningCounted=true;learningStore.finish(learningTurns,state.winner);
  }
  if (state.scores.reduce((a, b) => a + b, 0) > oldScore) flash();
  phase = "wall";
  turnStart = clone(state);
  remember();
  render();
  if (cpuTurn()) runCPU();
}
function stopCPU() {
  clearTimeout(cpuTimer);
  if (worker) {
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
    worker = null;
  }
}
function runCPU() {
  const id = ++epoch;
  clearTimeout(cpuTimer);
  cpuTimer = setTimeout(() => {
    if (id !== epoch || !cpuTurn() || phase !== "wall") return;
    stopCPU();
    fallback(id);
  }, 6000);
  render();
  if (!worker) {
    try {
      worker = new Worker(new URL("./cpu-worker.js", import.meta.url), {
        type: "module",
      });
      worker.onmessage = ({ data }) => {
        if (!data || data.id !== epoch || phase !== "wall") return;
        clearTimeout(cpuTimer);
        if (data.error) {
          fallback(data.id);
          return;
        }
        acceptCPU(data.action, data.id);
      };
      const currentWorker = worker;
      worker.onerror = () => {
        if (worker !== currentWorker) return;
        stopCPU();
        fallback(epoch);
      };
    } catch {
      stopCPU();
      fallback(id);
      return;
    }
  }
  try {
    worker.postMessage({ id, state: clone(state), history: [...seen], seed: matchSeed, level: activeSettings.level, opponentModel: activeSettings.level === "learning" ? learningStore.model : null });
  } catch {
    stopCPU();
    fallback(id);
  }
}
function fallback(id) {
  setTimeout(() => {
    if (id !== epoch || !cpuTurn()) return;
    acceptCPU(choose(state, { level: "greedy", seen }), id);
  }, 30);
}
function acceptCPU(action, id) {
  if (id !== epoch || !cpuTurn() || phase !== "wall") return;
  clearTimeout(cpuTimer);
  const valid = action && actions(state).some((a) =>
    a.dir === action.dir && (a.wall === null ? action.wall === null :
      a.wall.wall === action.wall?.wall && a.wall.to === action.wall?.to));
  if (!valid) {
    const legal = actions(state);
    if (legal.length) {
      stopCPU();
      fallback(id);
      return;
    }
    $("message").textContent =
      "合法手がありません。戻るか、新しい対戦を選んでください。";
    return;
  }
  if (action.wall) state = moveWall(state, action.wall);
  phase = "slide";
  render();
  setTimeout(() => {
    if (id === epoch) playSlide(action.dir);
  }, 200);
}
function clearCelebration() {
  $("celebration").classList.remove("pop");
  $("celebration").replaceChildren();
}
function reset() {
  $("learningUnresolvedConfirm").hidden=true;
  playtest?.reset();
  clearCelebration();
  epoch++;
  matchSeed = globalThis.crypto?.getRandomValues
    ? crypto.getRandomValues(new Uint32Array(1))[0]
    : Math.floor(Math.random() * 4294967296);
  stopCPU();
  if ($("result").open) $("result").close();
  resultSeen = false;
  busy = false;
  state = initial(customBoard ?? activeSettings.layout, activeSettings.starter);
  phase = "wall";
  selected = null;
  history = [];
  moveLog = [];
  learningTurns=[];learningCounted=false;
  seen = new Map();
  remember();
  turnStart = clone(state);
  render();
  if (cpuTurn()) runCPU();
}
$("skip").onclick = () => {
  phase = "slide";
  selected = null;
  render();
};
$("undo").onclick = () => {
  if(mode === "cpu" && activeSettings.level === "learning")return;
  const studyReselect = phase === "slide" && !cpuTurn();
  clearCelebration();
  epoch++;
  stopCPU();
  busy = false;
  if (phase === "slide" && !cpuTurn()) {
    state = clone(turnStart);
  } else {
    let previous = history.pop();
    if (mode === "cpu")
      while (previous && previous.turn !== 0 && history.length)
        previous = history.pop();
    if (previous) state = previous;
  }
  phase = "wall";
  selected = null;
  resultSeen = false;
  playtest?.undo(studyReselect, state);
  learningTurns.length = history.length;
  moveLog.length = history.length;
  turnStart = clone(state);
  seen = new Map();
  history.forEach((s) => seen.set(key(s), (seen.get(key(s)) || 0) + 1));
  remember();
  render();
  if (cpuTurn()) runCPU();
};
$("boardZoom").onclick = () => {
  const wrap = $("board").parentElement;
  const zoomed = wrap.classList.toggle('zoomed');
  $("boardZoom").setAttribute('aria-pressed', String(zoomed));
  $("boardZoom").textContent = zoomed ? '盤面を全体表示' : '盤面を拡大';
};
$("help").onclick = () => $("helpDialog").showModal();
function openSetup(nextMode) {
  $("layout").value = String(activeSettings.layout);
  $("starter").value = String(activeSettings.starter);
  $("cpuLevel").value = activeSettings.level;
  $("cpuLevelRow").hidden = nextMode !== "cpu";
  $("starter").options[0].textContent =
    nextMode === "cpu" ? "プレイヤー1（あなた）" : "プレイヤー1";
  $("starter").options[1].textContent =
    nextMode === "cpu" ? "プレイヤー2（CPU）" : "プレイヤー2";
  $("setupDialog").showModal();
}
$("settings").onclick = () => openSetup(mode);
$("rematch").onclick = reset;
$("reviewFinal").onclick = () => $("result").close();
$("result").addEventListener("close", () => {
  if (state.winner !== null && !busy) $("showResult").focus();
});
$("showResult").onclick = () => {
  if (state.winner !== null && !busy && !$("result").open) $("result").showModal();
};
// Mode changes are staged in the new-match dialog; cancellation leaves the active match intact.
let pendingMode = null;
for (const [id, m] of [
  ["cpuMode", "cpu"],
  ["localMode", "local"],
])
  $(id).onclick = () => {
    if (m === mode) return;
    pendingMode = m;
    openSetup(m);
  };
$("setupDialog").addEventListener("close", () => {
  pendingMode = null;
});
$("start").onclick = () => {
  customBoard = null;
  activeSettings = { layout: Number($("layout").value), starter: Number($("starter").value), level: $("cpuLevel").value };
  if (pendingMode) mode = pendingMode;
  pendingMode = null;
  $("setupDialog").close();
  reset();
};
document
  .querySelectorAll("[data-close]")
  .forEach((b) => (b.onclick = () => $(b.dataset.close).close()));
reset();

mountLab((record)=>{
  customBoard=clone(record.board);customName=record.name;
  if(pendingMode) mode=pendingMode;
  activeSettings.starter=Number($("starter").value);
  activeSettings.level=$("cpuLevel").value;
  pendingMode=null;$("setupDialog").close();reset();
});
