// Unapproved candidate prompted by human feedback: 7×7 feels too short
// and offers too few meaningful placement choices; stars feel scarce.
// Kept separate from the generated A–E research fixtures and the official
// beginner board so it can be compared without changing any live default.
export const TRIAL_LAYOUTS = [
  {
    id: "standard-9x9-seven-stars-v1",
    name: "【試遊】新スタンダード 9×9（星7・先取4）",
    size: 9,
    target: 4,
    walls: [1, 9, 12, 28, 30, 50, 52, 68, 71, 79],
    stars: [6, 29, 34, 40, 46, 51, 74],
    players: [72, 8],
    // Every wall/star has a 180-degree counterpart (center star=40).
    // Structural symmetry is NOT proof of strategic fairness.
  },
];
