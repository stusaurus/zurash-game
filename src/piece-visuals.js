// Cosmetic character assets only. Rules and number of players remain unchanged.
export const PIECE_COLORS = Object.freeze([
  { name: "オレンジ", label: "orange", targetHue: null },
  { name: "水色", label: "aqua", targetHue: 0.52 },
  { name: "黄緑", label: "lime", targetHue: 0.27 },
  { name: "紫", label: "purple", targetHue: 0.74 },
]);
export const DEFAULT_FACING = Object.freeze([1, -1, 1, -1]);
export const IMAGE_URL = new URL("../assets/triken-anime-orange.webp", import.meta.url).href;
export function nextFacing(previous, direction) {
  if (direction === 1) return 1;
  if (direction === 3) return -1;
  return previous;
}
export function facingFromMoves(moves) {
  const facing = [...DEFAULT_FACING];
  for (const move of moves) {
    if (move?.player >= 0 && move.player < facing.length)
      facing[move.player] = nextFacing(facing[move.player], move.dir);
  }
  return facing;
}
// Single approved silhouette, recolored for four slots. Ivory horns/cheeks/eyes stay intact.
export function loadPieceImages() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const images = [IMAGE_URL];
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw Error("Canvas unavailable");
        ctx.drawImage(img, 0, 0);
        const source = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (const color of PIECE_COLORS.slice(1)) {
          const frame = new ImageData(new Uint8ClampedArray(source.data), canvas.width, canvas.height);
          const pixels = frame.data;
          for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i + 3] < 16) continue;
            const r = pixels[i] / 255, g = pixels[i + 1] / 255, b = pixels[i + 2] / 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b), diff = max - min;
            if (diff === 0 || max === 0 || r <= g || g <= b) continue;
            const hue = ((g - b) / diff) / 6;
            const saturation = diff / max;
            if (!(hue > 8 / 360 && hue < 37 / 360 && saturation > .23 &&
              (r - g) > 30 / 255 && (g - b) > 10 / 255)) continue;
            const fade = Math.min(1, (r - g - 30 / 255) / (24 / 255)) *
              Math.min(1, (saturation - .23) / .1);
            if (fade <= 0) continue;
            const targetH = color.targetHue + (hue - 24 / 360) * .08;
            const targetS = Math.min(.68, Math.max(.31, saturation * .91));
            const targetV = Math.min(1, max * (color.label === "purple" ? .97 : 1));
            const chroma = targetV * targetS, h6 = targetH * 6;
            const x = chroma * (1 - Math.abs((h6 % 2) - 1)), m = targetV - chroma;
            const rgb = h6 < 1 ? [chroma, x, 0] : h6 < 2 ? [x, chroma, 0] :
              h6 < 3 ? [0, chroma, x] : h6 < 4 ? [0, x, chroma] :
              h6 < 5 ? [x, 0, chroma] : [chroma, 0, x];
            for (let c = 0; c < 3; c++)
              pixels[i + c] = Math.round((1 - fade) * pixels[i + c] + fade * (rgb[c] + m) * 255);
          }
          ctx.putImageData(frame, 0, 0);
          images.push(canvas.toDataURL("image/png"));
        }
      } catch {
        return resolve(PIECE_COLORS.map(() => IMAGE_URL));
      }
      resolve(images);
    };
    img.onerror = () => resolve(PIECE_COLORS.map(() => IMAGE_URL));
    img.src = IMAGE_URL;
  });
}