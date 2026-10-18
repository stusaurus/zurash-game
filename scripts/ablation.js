import fs from "node:fs";
import { initial, actions, apply, key, LAYOUTS } from "../src/engine.js";
import { choose, seeded, evaluate } from "../src/ai.js";
const rows = [];
for (let layout = 0; layout < 3; layout++) {
  const row = {
    layout: LAYOUTS[layout].name,
    games: 40,
    wallAllowedWins: 0,
    skipOnlyWins: 0,
    capped: 0,
    plies: [],
    initialImmediateStars: [],
    skipOnlyObservedChoices: 0,
  };
  for (let p = 0; p < 2; p++) {
    const s = initial(layout, p);
    row.initialImmediateStars.push(
      actions(s).filter((a) => apply(s, a).scores[p] > 0).length,
    );
  }
  for (let pair = 0; pair < 20; pair++)
    for (let starter = 0; starter < 2; starter++) {
      let s = initial(layout, starter);
      const rng = seeded(701 + pair * 131 + layout * 977),
        seen = new Map();
      for (let ply = 0; ply < 160 && s.winner === null; ply++) {
        const k = key(s);
        seen.set(k, (seen.get(k) || 0) + 1);
        let a;
        if (s.turn === 0) a = choose(s, { level: "greedy", rng, seen });
        else {
          const legal = actions(s).filter((a) => a.wall === null);
          row.skipOnlyObservedChoices += legal.length;
          a = legal
            .map((a) => {
              const n = apply(s, a);
              return {
                a,
                score: evaluate(n, 1) - (seen.get(key(n)) || 0) * 130,
                tie: rng(),
              };
            })
            .sort((a, b) => b.score - a.score || a.tie - b.tie)[0]?.a;
        }
        if (!a) break;
        s = apply(s, a);
      }
      row.plies.push(s.ply);
      if (s.winner === 0) row.wallAllowedWins++;
      else if (s.winner === 1) row.skipOnlyWins++;
      else row.capped++;
    }
  rows.push(row);
}
const out = {
  method:
    "Same greedy evaluation and repetition penalty. Player 0 may move walls; player 1 voluntarily skips wall movement. Each seed plays with both starters. This is a policy ablation, not a change to rules. 160-ply measurement cap.",
  rows,
};
fs.writeFileSync("reports/ablation.json", JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out));
