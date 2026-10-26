// Research-only: force 180-degree/player-swap equivariance for strong CPU.
// A rotation maps the player about to move to agent 0 before tie-breaking.
// Production chooseRoute remains unchanged pending paired holdout comparisons.
import {SIZE,key} from "../src/engine.js";
import {chooseRoute} from "../src/route-ai.js";

const flip = (square) => SIZE * SIZE - 1 - square;
export function rotateState(s) {
  return {
    ...s,
    walls: s.walls.map(flip),
    stars: s.stars.map(flip),
    players: [flip(s.players[1]), flip(s.players[0])],
    scores: [s.scores[1],s.scores[0]],
    turn: 1 - s.turn,
    winner: s.winner === null ? null : 1 - s.winner,
  };
}
export function rotateAction(a) {
  return a === null ? null : {
    wall: a.wall === null ? null : {wall:a.wall.wall, to:flip(a.wall.to)},
    dir: (a.dir + 2) % 4,
  };
}
export function rotateSeenKey(serialized) {
  const [walls,stars,players,scores,turn]=JSON.parse(serialized);
  return key({walls:walls.map(flip),stars:stars.map(flip),
    players:[flip(players[1]),flip(players[0])],
    scores:[scores[1],scores[0]],turn:1-turn});
}
export function rotateHistory(seen) {
  return new Map([...seen].map(([s,n])=>[rotateSeenKey(s),n]));
}
export function chooseSymmetricRoute(s,{rng=Math.random,seen=new Map()}={}) {
  if(s.turn === 0)return chooseRoute(s,{rng,seen});
  const rotated=rotateState(s);
  const adjustedHistory=rotateHistory(seen);
  const normalized=chooseRoute(rotated,{rng,seen:adjustedHistory});
  return rotateAction(normalized);
}
