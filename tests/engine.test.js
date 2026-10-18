import test from "node:test";
import assert from "node:assert/strict";
import {
  initial,
  LAYOUTS,
  slide,
  movableWalls,
  moveWall,
  slideOptions,
  finishSlide,
  actions,
  apply,
  mobility,
  key,
  clone,
} from "../src/engine.js";
import { choose, seeded } from "../src/ai.js";
const fixture = () => ({
  walls: [],
  stars: [3, 17, 24, 31, 45],
  players: [0, 48],
  scores: [0, 0],
  turn: 0,
  ply: 0,
  winner: null,
});
test("all layouts are 180-degree symmetric, valid, and have five stars", () => {
  for (let i = 0; i < LAYOUTS.length; i++) {
    const s = initial(i);
    for (const list of [s.walls, s.stars, s.players])
      assert.deepEqual(
        [...list].sort((a, b) => a - b),
        list.map((n) => 48 - n).sort((a, b) => a - b),
      );
    assert.equal(
      new Set([...s.walls, ...s.stars, ...s.players]).size,
      s.walls.length + 7,
    );
    assert.ok(actions(s).length > 0);
  }
});
test("sliding stops at edge, wall, opponent in all four directions", () => {
  const s = fixture();
  s.players = [24, 48];
  assert.deepEqual(
    [0, 1, 2, 3].map((d) => slide(s, 0, d)),
    [3, 27, 45, 21],
  );
  s.walls = [10];
  assert.equal(slide(s, 0, 0), 17);
  s.players[1] = 26;
  assert.equal(slide(s, 0, 1), 25);
});
test("stars only collected at stopping point, victory at three", () => {
  let s = fixture();
  s.stars = [1, 6, 24, 31, 45];
  let n = finishSlide(s, 1);
  assert.equal(n.scores[0], 1);
  assert.ok(n.stars.includes(1));
  s.stars = [1, 24, 31, 40, 45];
  n = finishSlide(s, 1);
  assert.equal(n.scores[0], 0);
  s.stars = [6];
  s.scores = [2, 2];
  n = finishSlide(s, 1);
  assert.equal(n.winner, 0);
  assert.equal(actions(n).length, 0);
});
test("wall cannot move outside, onto star, player, or another wall", () => {
  const s = fixture();
  s.walls = [1, 2];
  s.stars = [8];
  assert.deepEqual(
    movableWalls(s).filter((m) => m.wall === 0),
    [],
  );
  assert.throws(() => moveWall(s, { wall: 0, to: 0 }));
  assert.throws(() => moveWall(s, { wall: 0, to: 8 }));
});
test("wall shifts and slides cannot fully trap either player", () => {
  const s = fixture();
  s.players = [0, 48];
  s.walls = [1, 14];
  assert.ok(!movableWalls(s).some((m) => m.wall === 1 && m.to === 7));
  const n = fixture();
  n.players = [0, 6];
  n.walls = [13];
  assert.ok(!slideOptions(n).some((m) => m.to === 5));
});
test("skip leaves walls unchanged and input states remain immutable", () => {
  const s = initial(),
    before = key(s);
  const a = actions(s).find((a) => a.wall === null);
  assert.ok(a);
  const n = apply(s, a);
  assert.deepEqual(n.walls, s.walls);
  assert.equal(key(s), before);
  assert.equal(n.turn, 1);
  assert.equal(n.ply, 1);
});
test("all policies take an immediate winning star", () => {
  const s = fixture();
  s.scores = [2, 0];
  s.stars = [6, 17, 24];
  for (const level of ["greedy", "search"])
    assert.equal(apply(s, choose(s, { level, rng: seeded(5) })).winner, 0);
});
test("seeded legal-play invariant fuzzing: no overlapping objects, scoring conserved, no trapping", () => {
  for (let game = 0; game < 12; game++) {
    const rng = seeded(game + 1);
    let s = initial(game % 3, game % 2);
    for (let i = 0; i < 120 && s.winner === null; i++) {
      const all = actions(s);
      assert.ok(all.length);
      s = apply(s, all[Math.floor(rng() * all.length)]);
      assert.equal(
        new Set([...s.walls, ...s.stars, ...s.players]).size,
        s.walls.length + s.stars.length + 2,
      );
      assert.equal(s.stars.length + s.scores[0] + s.scores[1], 5);
      assert.ok(mobility(s, 0).length && mobility(s, 1).length);
    }
  }
});

test("repetition identity ignores interchangeable wall ordering", () => {
  const s = initial();
  const n = clone(s);
  n.walls.reverse();
  n.stars.reverse();
  assert.equal(key(n), key(s));
});

test("challenge CPU avoids a preventable immediate defeat at 2–2", () => {
  // Reached by legal play. Six safe choices exist, but a narrow beam can discard them.
  const s = {
    walls: [7, 12, 2, 18, 38, 32, 36, 40],
    stars: [24],
    players: [45, 31],
    scores: [2, 2],
    turn: 0, ply: 7, winner: null,
  };
  const avoidsDefeat = (a) => {
    const n = apply(s, a);
    return !actions(n).some((reply) => apply(n, reply).winner === 1);
  };
  const safe = actions(s).filter(avoidsDefeat);
  assert.equal(safe.length, 6);
  for (const seed of [1, 5, 17, 73]) {
    const move = choose(s, { level: "strong", rng: seeded(seed) });
    assert.ok(avoidsDefeat(move), `seed ${seed} conceded an avoidable win`);
  }
});
test('wall phase cannot offer a shift with no legal slide continuation', () => {
  // Reachable after one legal turn: wall 12 -> 13, then player 0 slides up.
  const s = apply(initial(), {wall:{wall:1,to:13},dir:0});
  assert.deepEqual(s.players,[0,6]);
  // 8 -> 7 leaves physical mobility, but player 1's only stop (1)
  // would completely trap player 0. There is no legal completed turn.
  assert.ok(!movableWalls(s).some(w=>w.wall===0&&w.to===7));
  assert.throws(()=>moveWall(s,{wall:0,to:7}));
  for(const w of movableWalls(s))assert.ok(slideOptions(moveWall(s,w)).length);
});
