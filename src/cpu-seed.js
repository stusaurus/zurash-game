// One seed per match; undo keeps it, rematch replaces it. Rules stay deterministic.
export function turnSeed(matchSeed, ply) {
  return (matchSeed + ply * 104729 + 137) >>> 0;
}
