import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("all four approved Triken colors are separate 80x80 PNGs", () => {
  for (const color of ["orange", "aqua", "lime", "purple"]) {
    const bytes = readFileSync(new URL(`../assets/triken-${color}-80.png`, import.meta.url));
    assert.deepEqual([...bytes.subarray(0,8)], [137,80,78,71,13,10,26,10]);
    assert.equal(bytes.readUInt32BE(16), 80);
    assert.equal(bytes.readUInt32BE(20), 80);
    assert.ok(bytes.length > 1500);
  }
});

test("mobile pawn images never rely on data URLs or runtime canvas cropping", () => {
  const app = readFileSync(new URL("../src/app.js", import.meta.url),"utf8");
  const css = readFileSync(new URL("../style.css", import.meta.url),"utf8");
  assert.ok(app.includes("triken-"));
  assert.ok(app.includes("-80.png"));
  assert.ok(!app.includes("installTrikenSprites"));
  assert.ok(!app.includes("toDataURL("));
  assert.match(css, /\.token \.pawn-image\s*\{/);
});
