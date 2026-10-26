import {
  initial,
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
const STAR_HTML = '<span class="star" aria-hidden="true"><span class="star-depth"></span><span class="star-face"></span><span class="star-facet"></span></span>';
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
  movingWall = null,
  activeSettings = { layout: 0, starter: 0, level: "strong" },
  matchSeed = 0;
// Four approved palettes are stored in a shared atlas; the rules still support two players.
const facing = ["right", "right"];
const poseTimers = [null, null];
const tokenEls = [0, 1].map((p) => {
  const el = document.createElement("div");
  el.className = `token p${p + 1}`;
  el.dataset.facing = facing[p];
  el.dataset.pose = "idle";
  el.innerHTML = `<div class="coin"><span class="pawn-frame"><img class="pawn-image" src="assets/triken-${['orange', 'aqua', 'lime', 'purple'][p]}-80.png" alt="" draggable="false" decoding="async"></span></div><b>${p + 1}</b>`;
  $("tokens").append(el);
  return el;
});


function setPose(p, pose, duration = 0) {
  clearTimeout(poseTimers[p]);
  tokenEls[p].dataset.pose = pose;
  poseTimers[p] = duration
    ? setTimeout(() => {
        tokenEls[p].dataset.pose = "idle";
        poseTimers[p] = null;
      }, duration)
    : null;
}
function resetMotion() {
  facing.fill("right");
  tokenEls.forEach((el, p) => {
    clearTimeout(poseTimers[p]);
    poseTimers[p] = null;
    el.dataset.pose = "idle";
    el.dataset.facing = facing[p];
    el.style.removeProperty("--triken-glide-ms");
  });
}
function restoreFacing() {
  facing.fill("right");
  for (const action of moveLog) {
    if (action.dir === 1) facing[action.player] = "right";
    if (action.dir === 3) facing[action.player] = "left";
  }
  tokenEls.forEach((el, p) => { el.dataset.facing = facing[p]; });
}
function shiftArrow(from, to) {
  return ({ [-7]: "↑", [1]: "→", [7]: "↓", [-1]: "←" })[to - from] || "";
}
function cancelMovingWall() {
  const flight = movingWall;
  movingWall = null;
  if (!flight) return;
  flight.animation?.cancel();
  flight.element.remove();
}
// Animate a validated one-cell wall move, then commit the original engine state.
// The floating piece uses the exact same CSS visual as every static wall.
async function shiftWallAnimated(move, expectedEpoch = epoch) {
  if (busy || phase !== "wall" || state.winner !== null) return false;
  let next;
  try { next = moveWall(state, move); } catch { return false; }
  const from = state.walls[move.wall];
  const board = $("board");
  const origin = board.querySelector(`[data-cell="${from}"]`);
  const target = board.querySelector(`[data-cell="${move.to}"]`);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!origin || !target || reduce || typeof origin.animate !== "function") {
    if (expectedEpoch !== epoch) return false;
    state = next;
    selected = null;
    phase = "slide";
    render();
    return true;
  }
  const start = origin.getBoundingClientRect();
  const destination = target.getBoundingClientRect();
  const wrapper = board.parentElement;
  const frame = wrapper.getBoundingClientRect();
  busy = true;
  selected = null;
  render(); // Disable input while preserving the old wall position.
  board.querySelector(`[data-cell="${from}"]`)?.classList.add("wall-in-flight");
  const ghost = document.createElement("div");
  ghost.className = "cell wall wall-flight";
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.left = `${start.left - frame.left - wrapper.clientLeft}px`;
  ghost.style.top = `${start.top - frame.top - wrapper.clientTop}px`;
  ghost.style.width = `${start.width}px`;
  ghost.style.height = `${start.height}px`;
  wrapper.append(ghost);
  const dx = destination.left - start.left;
  const dy = destination.top - start.top;
  try {
    const animation = ghost.animate(
      [{ transform: "translate(0px, 0px)" },
       { transform: `translate(${dx}px, ${dy}px)` }],
      { duration: 260, easing: "cubic-bezier(.23,.72,.22,1)", fill: "forwards" }
    );
    movingWall = { element: ghost, animation };
    await animation.finished;
  } catch {
    // Web Animations may be cancelled by a new game, or unsupported by a browser.
    // If still the same game, finish the already-validated move without animation.
  } finally {
    if (movingWall?.element === ghost) cancelMovingWall();
    else ghost.remove();
  }
  if (expectedEpoch !== epoch) return false;
  state = next;
  busy = false;
  phase = "slide";
  render();
  return true;
}
function cpuTurn() {
  return mode === "cpu" && state.turn === 1 && state.winner === null;
}
function remember() {
  const k = key(state);
  seen.set(k, (seen.get(k) || 0) + 1);
}
function render() {
  const locked = busy || cpuTurn() || state.winner !== null,
    moves = phase === "wall" ? movableWalls(state) : [],
    stops = phase === "slide" ? slideOptions(state) : [];
  $("board").replaceChildren();
  for (let i = 0; i < 49; i++) {
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
      `${Math.floor(i / 7) + 1}行${(i % 7) + 1}列 ${item}${target ? " 移動先" : ""}${stop ? " 滑走停止位置" : ""}`,
    );
    b.disabled =
      locked ||
      !(
        target ||
        stop ||
        (phase === "wall" && moves.some((m) => m.wall === wall))
      );
    if (state.stars.includes(i)) b.innerHTML = STAR_HTML;
    if (target) b.textContent = shiftArrow(state.walls[target.wall], target.to);
    b.onclick = () => {
      if (target) {
        void shiftWallAnimated(target);
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
    el.style.transform = `translate(${(at % 7) * 100}%,${Math.floor(at / 7) * 100}%)`;
    el.dataset.facing = facing[p];
  });
  $("scores").innerHTML = [0, 1]
    .map(
      (p) =>
        `<div class="score p${p + 1} ${state.turn === p ? "current" : ""} ${state.scores[p] === 2 && state.winner === null ? "match-point" : ""}"><span class="stars">${"★".repeat(state.scores[p])}${"☆".repeat(3 - state.scores[p])}</span><strong>${p === 0 ? (mode === "cpu" ? "あなた" : "プレイヤー1") : mode === "cpu" ? `CPU（${activeSettings.level === "strong" ? "つよい" : "ふつう"}）` : "プレイヤー2"}</strong><small>${p === 0 ? "オレンジ" : "みずいろ"} · ${state.scores[p]} / 3${state.scores[p] === 2 && state.winner === null ? " · あと1個で勝ち！" : ""}</small></div>`,
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
        ? (phase === "wall" ? "壁をずらしています…" : "トリケンが滑走中！")
        : cpuTurn()
          ? "CPUが考えています…"
          : `${mode === "cpu" ? "あなた" : `プレイヤー${state.turn + 1}`}：${phase === "wall" ? "壁をずらそう" : "方向を選んで滑ろう"}`;
  $("message").textContent =
    (seen.get(key(state)) || 0) >= 3
      ? "同じ配置が続いています。別の壁や方向を試そう。"
      : phase === "wall"
        ? selected === null
          ? "光る壁をタップ。動かさず進んでもOK。"
          : "矢印のマスをタップして、壁を1マス移動。"
        : "光る停止マス、または下の矢印をタップ。";
  $("turnCount").textContent = `${state.winner === null ? state.ply + 1 : state.ply}手目`;
  $("skip").disabled = locked || phase !== "wall";
  $("skip").textContent =
    phase === "wall" ? "壁を動かさずに滑る →" : "停止マスか矢印を選ぼう";
  $("undo").disabled = busy || (!history.length && phase === "wall");
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
function clearStarFlash() {
  const el = $("celebration");
  el.classList.remove("pop");
  el.replaceChildren();
}
function flash(at) {
  // The star disappears from game state on collection; show its reward effect
  // over the actual landing tile without introducing another board item.
  const el = $("celebration");
  el.classList.remove("pop");
  const spark = document.createElement("span");
  spark.className = "spark-star";
  spark.setAttribute("aria-hidden", "true");
  spark.textContent = "★";
  spark.style.left = `${((at % 7) + 0.5) / 7 * 100}%`;
  spark.style.top = `${(Math.floor(at / 7) + 0.5) / 7 * 100}%`;
  el.replaceChildren(spark);
  void el.offsetWidth;
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
  history.push(clone(turnStart));
  moveLog.push(lastAction);
  if (dir === 1) facing[player] = "right";
  if (dir === 3) facing[player] = "left";
  // A short anticipation makes the figure feel like it is pushing off the ice.
  // Only change the actual player position when the travel animation begins.
  const startAt = state.players[player];
  const endAt = next.players[player];
  const distance = Math.abs(endAt % 7 - startAt % 7) +
    Math.abs(Math.floor(endAt / 7) - Math.floor(startAt / 7));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // The same pacing is shared by local and CPU turns: longer slides stay legible.
  const travelMs = Math.min(380, 230 + 24 * distance);
  tokenEls[player].style.setProperty("--triken-glide-ms", `${travelMs}ms`);
  busy = true;
  selected = null;
  if (!reducedMotion) {
    setPose(player, "windup");
    render();
    await new Promise((resolve) => setTimeout(resolve, 85));
    if (myEpoch !== epoch) return;
  }
  setPose(player, "slide");
  state = next;
  render();
  if (!reducedMotion) {
    await new Promise((resolve) => setTimeout(resolve, travelMs + 12));
    if (myEpoch !== epoch) return;
  }
  busy = false;
  const scored = state.scores.reduce((a, b) => a + b, 0) > oldScore;
  setPose(player, reducedMotion ? "idle" : scored ? "collect" : "stop",
    reducedMotion ? 0 : scored ? 560 : 220);
  if (scored) flash(state.players[player]);
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
    worker.postMessage({ id, state: clone(state), history: [...seen], seed: matchSeed, level: activeSettings.level });
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
async function acceptCPU(action, id) {
  if (id !== epoch || !cpuTurn() || phase !== "wall" || busy) return;
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
  if (action.wall) {
    if (!(await shiftWallAnimated(action.wall, id)) || id !== epoch) return;
  } else {
    phase = "slide";
    render();
  }
  setTimeout(() => {
    if (id === epoch && phase === "slide") playSlide(action.dir);
  }, 200);
}
function reset() {
  epoch++;
  matchSeed = globalThis.crypto?.getRandomValues
    ? crypto.getRandomValues(new Uint32Array(1))[0]
    : Math.floor(Math.random() * 4294967296);
  stopCPU();
  cancelMovingWall();
  resetMotion();
  clearStarFlash();
  if ($("result").open) $("result").close();
  resultSeen = false;
  busy = false;
  state = initial(activeSettings.layout, activeSettings.starter);
  phase = "wall";
  selected = null;
  history = [];
  moveLog = [];
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
  epoch++;
  stopCPU();
  cancelMovingWall();
  resetMotion();
  clearStarFlash();
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
  moveLog.length = history.length;
  restoreFacing();
  turnStart = clone(state);
  seen = new Map();
  history.forEach((s) => seen.set(key(s), (seen.get(key(s)) || 0) + 1));
  remember();
  render();
  if (cpuTurn()) runCPU();
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
