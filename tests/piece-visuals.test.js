import test from "node:test";
import assert from "node:assert/strict";
import { PIECE_COLORS, IMAGE_URL, nextFacing, facingFromMoves } from "../src/piece-visuals.js";
test("four reserved colors", () => {
  assert.deepEqual(PIECE_COLORS.map(x => x.name), ["オレンジ", "水色", "黄緑", "紫"]);
  assert.ok(IMAGE_URL.endsWith("/assets/triken-anime-orange.webp"));
});
test("only horizontal slides change facing", () => {
  assert.equal(nextFacing(1, 3), -1);
  assert.equal(nextFacing(-1, 1), 1);
  assert.equal(nextFacing(-1, 0), -1);
  assert.equal(nextFacing(1, 2), 1);
});
test("undo reconstructs facing from completed moves", () => {
  assert.deepEqual(facingFromMoves([]).slice(0, 2), [1, -1]);
  assert.deepEqual(facingFromMoves([{player:0,dir:3},{player:1,dir:1}]).slice(0,2),[-1,1]);
});