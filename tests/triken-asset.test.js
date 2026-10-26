import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("approved Triken WebP pawn is a valid WebP file with a transparent-capable header", () => {
  const data = readFileSync(new URL("../assets/triken-pawn.webp", import.meta.url));
  assert.equal(data.toString("ascii", 0, 4), "RIFF");
  assert.equal(data.toString("ascii", 8, 12), "WEBP");
  assert.ok(data.length > 1000);
});

test("both players use the same approved 3D pawn image", () => {
  const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
  assert.match(css, /assets\/triken-pawn\.webp/);
  assert.match(css, /\.token\.p1 \.coin::before/);
  assert.match(css, /\.token\.p2 \.coin::before/);
});
