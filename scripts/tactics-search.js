// Enumerate every legal turn and evaluate the opponent's best response.
// This is a bounded search, not a claim of solving the whole game.
import { successors, key } from "../src/engine.js";
import { evaluate } from "../src/ai.js";

export function examine(state, depth = 2, budget = 10000) {
  const root = state.turn;
  const cache = new Map();
  let nodes = 0, exhausted = false;
  function solve(s, left, alpha, beta) {
    if (++nodes > budget) {
      exhausted = true;
      return evaluate(s, root);
    }
    if (left === 0 || s.winner !== null) return evaluate(s, root);
    const id = key(s) + ":" + left;
    if (cache.has(id)) return cache.get(id);
    const next = successors(s);
    if (!next.length) return evaluate(s, root);
    const max = s.turn === root;
    let value = max ? -Infinity : Infinity;
    let pruned = false;
    for (const child of next) {
      const score = solve(child.n, left - 1, alpha, beta);
      value = max ? Math.max(value, score) : Math.min(value, score);
      if (max) alpha = Math.max(alpha, value);
      else beta = Math.min(beta, value);
      if (beta <= alpha) { pruned = true; break; }
      if (exhausted) break;
    }
    if (!pruned && !exhausted) cache.set(id, value);
    return value;
  }
  const moves = successors(state).map(({a,n}) => ({
    action: a, score: solve(n, depth - 1, -Infinity, Infinity)
  })).sort((a,b) => b.score - a.score);
  return { legalMoves: moves.length, depth, nodes, complete: !exhausted, moves };
}
