// Human-playtest-led, unapproved options. These are deliberately separate
// from the generated A–E research fixtures and the preserved 7×7 beginner game.
// Same 9×9 walls and players allow a controlled 9-star vs 7-star comparison.
const walls = [1, 9, 12, 28, 30, 50, 52, 68, 71, 79];
const players = [72, 8];

export const TRIAL_LAYOUTS = [
  {
    id: "standard-9x9-nine-stars-v2",
    name: "【試遊】新スタンダード 9×9（星9・先取5）",
    size: 9,
    target: 5,
    walls: [...walls],
    stars: [6, 13, 29, 34, 40, 46, 51, 67, 74],
    players: [...players],
  },
  {
    id: "standard-9x9-seven-stars-control-v1",
    name: "【比較】9×9（星7・先取4）",
    size: 9,
    target: 4,
    walls: [...walls],
    stars: [6, 29, 34, 40, 46, 51, 74],
    players: [...players],
  },
];
// Both boards use 180°-rotation-symmetric objects, but geometric symmetry
// never establishes fairness or human enjoyment.
