import test from "node:test";
import assert from "node:assert/strict";
import { initial, successors } from "../src/engine.js";
import { examine } from "../scripts/tactics-search.js";

test("enumerates every legal opening without sampling", () => {
  const state = initial(0);
  const result = examine(state, 1, 100000);
  assert.equal(result.legalMoves, successors(state).length);
  assert.equal(result.moves.length, result.legalMoves);
  assert.equal(result.complete, true);
  assert.ok(result.moves.every(x => Number.isFinite(x.score)));
});

test("marks a budget-limited search as incomplete", () => {
  const result = examine(initial(0), 2, 1);
  assert.equal(result.complete, false);
  assert.ok(result.legalMoves > 0);
});

test("prefers an immediately winning legal action", () => {
  const s = initial(0);
  const win = successors(s).find(x => x.n.scores[0] > s.scores[0]);
  if (!win) return;
  const near = {...s, scores: [s.target - 1, 0]};
  const result = examine(near, 1, 100000);
  assert.equal(result.complete, true);
  assert.ok(result.moves.some(x => x.score === 100000));
  assert.equal(result.moves[0].score, 100000);
});
