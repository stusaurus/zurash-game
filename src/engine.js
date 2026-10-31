import {widthOf,heightOf,isPlayable,geometryKey,toBoardState} from "./geometry.js";
import {RESEARCH_LAYOUTS} from "./research-layouts.js";
import {TRIAL_LAYOUTS} from "./trial-layouts.js";
export const SIZE = 7;
export const DIRS = [
  { name: "上", dx: 0, dy: -1, icon: "↑" },
  { name: "右", dx: 1, dy: 0, icon: "→" },
  { name: "下", dx: 0, dy: 1, icon: "↓" },
  { name: "左", dx: -1, dy: 0, icon: "←" },
];
// Every setup is invariant under a 180-degree rotation, including the centre star.
export const LAYOUTS = [
  {
    name: "はじまりの氷原",
    walls: [8, 12, 16, 18, 30, 32, 36, 40],
    stars: [3, 17, 24, 31, 45],
    players: [42, 6],
  },
  {
    name: "ふたつの谷",
    walls: [9, 11, 15, 19, 29, 33, 37, 39],
    stars: [10, 21, 24, 27, 38],
    players: [42, 6],
  },
  {
    name: "こおりの回廊",
    walls: [8, 10, 12, 22, 26, 36, 38, 40],
    stars: [3, 17, 24, 31, 45],
    players: [42, 6],
  },
  {
    name: "タクティクス試遊（候補12）",
    walls: [21, 27, 2, 46, 10, 38, 18, 30],
    stars: [24, 19, 29, 5, 43],
    players: [42, 6],
  },
];
export const ALL_LAYOUTS = [...LAYOUTS, ...RESEARCH_LAYOUTS, ...TRIAL_LAYOUTS];
export const clone = (s) => structuredClone(s);
export function initial(layout = 0, starter = 0) {
  const l = typeof layout === "object" ? layout : ALL_LAYOUTS[layout];
  if (l.width !== undefined || l.playableCells !== undefined) return {...toBoardState(l),turn:starter};
  return {
    ...(l.size !== undefined ? { size: l.size } : {}),
    ...(l.target !== undefined ? { target: l.target } : {}),
    walls: [...l.walls],
    stars: [...l.stars],
    players: [...l.players],
    scores: [0, 0],
    turn: starter,
    ply: 0,
    winner: null,
  };
}
export function step(pos, dir, board = SIZE) {
  const s = typeof board === "number" ? {size:board} : board;
  if (!isPlayable(s,pos) || !DIRS[dir]) return null;
  const width=widthOf(s), height=heightOf(s);
  const x = pos % width + DIRS[dir].dx, y = Math.floor(pos / width) + DIRS[dir].dy;
  const to=y*width+x;
  return x<0 || x>=width || y<0 || y>=height || !isPlayable(s,to) ? null : to;
}
export function slide(s, p, dir) {
  let at = s.players[p],
    next;
  while (
    (next = step(at, dir, s)) !== null &&
    !s.walls.includes(next) &&
    next !== s.players[1 - p]
  )
    at = next;
  return at;
}
export function mobility(s, p) {
  return DIRS.map((_, d) => slide(s, p, d)).filter((n) => n !== s.players[p]);
}
function hasMobility(s, p) {
  return DIRS.some((_, d) => slide(s, p, d) !== s.players[p]);
}
// Share validated slide options within one enumeration; no persistent state cache.
function wallVariants(s) {
  if (s.winner !== null) return [];
  const out = [];
  for (let w = 0; w < s.walls.length; w++)
    for (let d = 0; d < 4; d++) {
      const to = step(s.walls[w], d, s);
      if (
        to === null ||
        s.walls.includes(to) ||
        s.players.includes(to) ||
        s.stars.includes(to)
      )
        continue;
      const n = { ...s, walls: s.walls.map((v, i) => (i === w ? to : v)) };
      // A selectable wall shift must admit a complete legal turn. Merely
      // checking mobility can leave only slides that trap the opponent.
      if (hasMobility(n, 0) && hasMobility(n, 1)) {
        const slides = slideOptions(n);
        if (slides.length) out.push({ wall: { wall: w, to }, n, slides });
      }
    }
  return out;
}
export function movableWalls(s) {
  return wallVariants(s).map(v => v.wall);
}
function turnVariants(s) {
  return [{ wall: null, n: s, slides: slideOptions(s) }, ...wallVariants(s)];
}
export function moveWall(s, move) {
  if (move === null) return clone(s);
  if (!movableWalls(s).some((m) => m.wall === move.wall && m.to === move.to))
    throw Error("不正な壁移動");
  const n = clone(s);
  n.walls[move.wall] = move.to;
  return n;
}
export function slideOptions(s) {
  if (s.winner !== null) return [];
  return DIRS.flatMap((_, dir) => {
    const to = slide(s, s.turn, dir);
    if (to === s.players[s.turn]) return [];
    const n = {
      ...s,
      players: s.players.map((v, i) => (i === s.turn ? to : v)),
    };
    return hasMobility(n, 0) && hasMobility(n, 1) ? [{ dir, to }] : [];
  });
}
export function finishSlide(s, dir) {
  if (!slideOptions(s).some((m) => m.dir === dir)) throw Error("不正な滑走");
  const n = clone(s),
    p = s.turn;
  n.players[p] = slide(s, p, dir);
  if (n.stars.includes(n.players[p])) {
    n.stars = n.stars.filter((v) => v !== n.players[p]);
    n.scores[p]++;
  }
  n.ply++;
  if (n.scores[p] >= (s.target ?? 3)) n.winner = p;
  else n.turn = 1 - p;
  return n;
}
export function actions(s) {
  if (s.winner !== null) return [];
  const out = [];
  for (const {wall, slides} of turnVariants(s)) {
    for (const m of slides) out.push({ wall, dir: m.dir });
  }
  return out;
}
export function apply(s, a) {
  return finishSlide(a.wall === null ? s : moveWall(s, a.wall), a.dir);
}
// Search-only enumeration: validate each wall/slide once instead of validating
// every generated action again through apply(). Results are fresh value states.
export function successors(s) {
  if (s.winner !== null) return [];
  const out = [];
  for (const {wall, n, slides} of turnVariants(s)) {
    for (const { dir, to } of slides) {
      const p = s.turn, scored = s.stars.includes(to);
      const scores = s.scores.map((v, i) => v + (i === p && scored ? 1 : 0));
      const winner = scores[p] >= (s.target ?? 3) ? p : null;
      out.push({ a: { wall, dir }, n: {
        ...s, walls: [...n.walls], stars: s.stars.filter((v) => !scored || v !== to),
        players: s.players.map((v, i) => i === p ? to : v), scores,
        ply: s.ply + 1, winner, turn: winner === null ? 1 - p : p,
      }});
    }
  }
  return out;
}
export function key(s) {
  const geometry = geometryKey(s), target = s.target ?? 3;
  return JSON.stringify([
    ...((geometry === 7 && target === 3) ? [] : [geometry, target]),
    [...s.walls].sort((a, b) => a - b),
    [...s.stars].sort((a, b) => a - b),
    s.players,
    s.scores,
    s.turn,
  ]);
}
export function distances(s, p) {
  const dist = Array(widthOf(s) * heightOf(s)).fill(Infinity),
    q = [s.players[p]];
  dist[q[0]] = 0;
  // Scratch board is local to this breadth-first traversal; caller state is untouched.
  const n = { ...s, players: [...s.players] };
  for (let i = 0; i < q.length; i++) {
    const from = q[i];
    n.players[p] = from;
    for (let d = 0; d < 4; d++) {
      const to = slide(n, p, d);
      if (dist[to] === Infinity) {
        dist[to] = dist[from] + 1;
        q.push(to);
      }
    }
  }
  return dist;
}
