import { choose, seeded } from "./ai.js";
import {turnSeed} from "./cpu-seed.js";
self.onmessage = ({ data }) => {
  const { id, state, history, seed, level = "search", opponentModel = null } = data;
  try {
    self.postMessage({
      id,
      action: choose(state, {
        level,
        opponentModel,
        rng: seeded(Number.isInteger(seed) ? turnSeed(seed,state.ply) : state.ply + 137),
        seen: new Map(history),
      }),
    });
  } catch (e) {
    self.postMessage({ id, error: String(e) });
  }
};
