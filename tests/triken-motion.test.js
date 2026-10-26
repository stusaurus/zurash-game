import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("four-color Triken atlas is a 320×80 WebP image", () => {
  const atlas = readFileSync(new URL("../assets/triken-four-colors.webp", import.meta.url));
  assert.equal(atlas.toString("ascii", 0, 4), "RIFF");
  assert.equal(atlas.toString("ascii", 8, 12), "WEBP");
  assert.equal(atlas.toString("ascii", 12, 16), "VP8X");
  assert.equal(atlas.readUIntLE(24, 3) + 1, 320);
  assert.equal(atlas.readUIntLE(27, 3) + 1, 80);
});
test("visual states include all palettes and reduced-motion support", () => {
  const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
  for (let i = 1; i <= 4; i++) assert.match(css, new RegExp(`\\.token\\.p${i}\\s*\\{`));
  for (const pose of ["idle", "slide", "stop", "collect"]) {
    assert.ok(css.includes(`data-pose="${pose}"`));
  }
  assert.ok(css.includes("prefers-reduced-motion: reduce"));
});
