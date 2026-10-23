// Legacy states remain byte-for-byte replayable. New states use width/height,
// never size. All engine and CPU geometry passes through this boundary.
export const MAX_SIDE = 16;
export const widthOf = s => s.width ?? s.size ?? 7;
export const heightOf = s => s.height ?? s.size ?? 7;
export const cellCount = s => widthOf(s) * heightOf(s);
export function isPlayable(s, cell) {
  return Number.isInteger(cell) && cell >= 0 && cell < cellCount(s) &&
    (!s.playableCells || s.playableCells.includes(cell));
}
export function geometryKey(s) {
  if (s.width === undefined && s.height === undefined && !s.playableCells) return s.size ?? 7;
  return [widthOf(s), heightOf(s), s.playableCells ? [...s.playableCells].sort((a,b)=>a-b) : null];
}
export function dimensions(s) {
  if (s.size !== undefined && (s.width !== undefined || s.height !== undefined || s.playableCells !== undefined)) throw Error('旧sizeと新形式を混在できません');
  const width=widthOf(s), height=heightOf(s);
  if (![width,height].every(v=>Number.isInteger(v)&&v>=2&&v<=MAX_SIDE)) throw Error('幅・高さは2〜16');
  return {width,height};
}
export function toBoardState(input) {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw Error('盤面オブジェクトが必要です');
  const {width,height}=dimensions(input);
  const playableCells=input.playableCells===undefined?Array.from({length:width*height},(_,i)=>i):input.playableCells;
  if (!Array.isArray(playableCells)||playableCells.length>width*height||playableCells.some(i=>!Number.isInteger(i)||i<0||i>=width*height)||new Set(playableCells).size!==playableCells.length) throw Error('有効マスマスクが不正です');
  for (const field of ['walls','stars','players']) if (!Array.isArray(input[field])||input[field].length>width*height) throw Error(field+'が不正です');
  return {width,height,playableCells:[...playableCells].sort((a,b)=>a-b),target:input.target??3,walls:[...input.walls],stars:[...input.stars],players:[...input.players],scores:[0,0],turn:0,ply:0,winner:null};
}
