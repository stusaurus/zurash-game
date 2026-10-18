import test from "node:test";
import assert from "node:assert/strict";
import { initial, actions, apply, key, LAYOUTS } from "../src/engine.js";
import { seeded } from "../src/ai.js";

const flip = (square) => 48 - square;
const rotateAndSwap = (s) => ({
  ...s,
  walls: s.walls.map(flip),
  stars: s.stars.map(flip),
  players: [flip(s.players[1]), flip(s.players[0])],
  scores: [s.scores[1], s.scores[0]],
  turn: 1 - s.turn,
  winner: s.winner === null ? null : 1 - s.winner,
});
const rotateAction = (a) => ({
  wall: a.wall === null ? null : { wall: a.wall.wall, to: flip(a.wall.to) },
  dir: (a.dir + 2) % 4,
});
const normalizedActions = (list) =>
  list.map((a) => JSON.stringify([a.wall?.wall ?? null, a.wall?.to ?? null, a.dir])).sort();

test("layouts are rotationally symmetric, including stars and player start squares", () => {
  for (let layout = 0; layout < LAYOUTS.length; layout++) {
    for (let starter = 0; starter <= 1; starter++) {
      const s = initial(layout, starter);
      assert.equal(key(rotateAndSwap(rotateAndSwap(s))), key(s));
      assert.deepEqual([...s.walls].sort((a, b) => a - b),
        s.walls.map(flip).sort((a, b) => a - b));
      assert.deepEqual([...s.stars].sort((a, b) => a - b),
        s.stars.map(flip).sort((a, b) => a - b));
    }
  }
});

test("legal moves and their results are 180-degree / player-swap equivariant", () => {
  for (let layout = 0; layout < LAYOUTS.length; layout++)
    for (let starter = 0; starter <= 1; starter++) {
      let s = initial(layout, starter);
      const rng = seeded(133 + layout * 19 + starter);
      for (let ply = 0; ply < 24 && s.winner === null; ply++) {
        const rotated = rotateAndSwap(s);
        const moves = actions(s);
        assert.deepEqual(normalizedActions(moves.map(rotateAction)),
          normalizedActions(actions(rotated)),
          "layout " + layout + " ply " + ply + ": rotated legal moves differ");
        const move = moves[Math.floor(rng() * moves.length)];
        assert.ok(move, "legal options should exist");
        const next = apply(s, move);
        assert.deepEqual(apply(rotated, rotateAction(move)),
          rotateAndSwap(next),
          "layout " + layout + " ply " + ply + ": rotated outcome differs");
        s = next;
      }
    }
});
