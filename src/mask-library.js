// Reproducible legality-checked examples, not fairness-certified.
export const MASK_LIBRARY = [
  {
    "id": "z-e9a4598e",
    "name": "長方形・1",
    "generatorVersion": "mask-lab-2",
    "seed": 1,
    "algorithm": "seeded-constraint",
    "status": "合法性確認済み",
    "metrics": null,
    "games": 0,
    "unresolvedRate": null,
    "shape": "rectangle",
    "parameters": {
      "width": 9,
      "height": 7,
      "shape": "rectangle",
      "corridor": 3,
      "stars": 5,
      "walls": 6,
      "target": 3,
      "seed": 1,
      "symmetry": "none",
      "starBias": "random",
      "wallBias": "random",
      "holes": 0
    },
    "board": {
      "width": 9,
      "height": 7,
      "playableCells": [
        0,
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        19,
        20,
        21,
        22,
        23,
        24,
        25,
        26,
        27,
        28,
        29,
        30,
        31,
        32,
        33,
        34,
        35,
        36,
        37,
        38,
        39,
        40,
        41,
        42,
        43,
        44,
        45,
        46,
        47,
        48,
        49,
        50,
        51,
        52,
        53,
        54,
        55,
        56,
        57,
        58,
        59,
        60,
        61,
        62
      ],
      "target": 3,
      "walls": [
        23,
        42,
        8,
        29,
        59,
        39
      ],
      "stars": [
        2,
        51,
        54,
        21,
        49
      ],
      "players": [
        0,
        62
      ],
      "scores": [
        0,
        0
      ],
      "turn": 0,
      "ply": 0,
      "winner": null
    },
    "diagnostics": {
      "openingActions": [
        42,
        42
      ],
      "fixedWallReachable": [
        [
          51,
          54
        ],
        [
          51,
          54
        ]
      ],
      "terrainConnected": true,
      "reachability": "固定壁の参考値。壁操作を含む取得可能性・決着は未証明"
    }
  },
  {
    "id": "z-734a432e",
    "name": "正方形・1",
    "generatorVersion": "mask-lab-2",
    "seed": 1,
    "algorithm": "seeded-constraint",
    "status": "合法性確認済み",
    "metrics": null,
    "games": 0,
    "unresolvedRate": null,
    "shape": "square",
    "parameters": {
      "width": 7,
      "height": 7,
      "shape": "square",
      "corridor": 3,
      "stars": 5,
      "walls": 6,
      "target": 3,
      "seed": 1,
      "symmetry": "none",
      "starBias": "random",
      "wallBias": "random",
      "holes": 0
    },
    "board": {
      "width": 7,
      "height": 7,
      "playableCells": [
        0,
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        19,
        20,
        21,
        22,
        23,
        24,
        25,
        26,
        27,
        28,
        29,
        30,
        31,
        32,
        33,
        34,
        35,
        36,
        37,
        38,
        39,
        40,
        41,
        42,
        43,
        44,
        45,
        46,
        47,
        48
      ],
      "target": 3,
      "walls": [
        19,
        23,
        9,
        5,
        4,
        46
      ],
      "stars": [
        2,
        18,
        20,
        38,
        21
      ],
      "players": [
        0,
        48
      ],
      "scores": [
        0,
        0
      ],
      "turn": 0,
      "ply": 0,
      "winner": null
    },
    "diagnostics": {
      "openingActions": [
        34,
        33
      ],
      "fixedWallReachable": [
        [],
        []
      ],
      "terrainConnected": true,
      "reachability": "固定壁の参考値。壁操作を含む取得可能性・決着は未証明"
    }
  },
  {
    "id": "z-aebc2906",
    "name": "L字・2",
    "generatorVersion": "mask-lab-2",
    "seed": 2,
    "algorithm": "seeded-constraint",
    "status": "合法性確認済み",
    "metrics": null,
    "games": 0,
    "unresolvedRate": null,
    "shape": "L",
    "parameters": {
      "width": 9,
      "height": 7,
      "shape": "L",
      "corridor": 3,
      "stars": 5,
      "walls": 6,
      "target": 3,
      "seed": 2,
      "symmetry": "none",
      "starBias": "random",
      "wallBias": "random",
      "holes": 0
    },
    "board": {
      "width": 9,
      "height": 7,
      "playableCells": [
        0,
        1,
        2,
        9,
        10,
        11,
        18,
        19,
        20,
        27,
        28,
        29,
        36,
        37,
        38,
        39,
        40,
        41,
        42,
        43,
        44,
        45,
        46,
        47,
        48,
        49,
        50,
        51,
        52,
        53,
        54,
        55,
        56,
        57,
        58,
        59,
        60,
        61,
        62
      ],
      "target": 3,
      "walls": [
        40,
        36,
        37,
        53,
        55,
        57
      ],
      "stars": [
        49,
        2,
        51,
        18,
        59
      ],
      "players": [
        0,
        62
      ],
      "scores": [
        0,
        0
      ],
      "turn": 0,
      "ply": 0,
      "winner": null
    },
    "diagnostics": {
      "openingActions": [
        32,
        18
      ],
      "fixedWallReachable": [
        [
          2
        ],
        [
          49,
          59
        ]
      ],
      "terrainConnected": true,
      "reachability": "固定壁の参考値。壁操作を含む取得可能性・決着は未証明"
    }
  },
  {
    "id": "z-53d73895",
    "name": "T字・1",
    "generatorVersion": "mask-lab-2",
    "seed": 1,
    "algorithm": "seeded-constraint",
    "status": "合法性確認済み",
    "metrics": null,
    "games": 0,
    "unresolvedRate": null,
    "shape": "T",
    "parameters": {
      "width": 9,
      "height": 7,
      "shape": "T",
      "corridor": 3,
      "stars": 5,
      "walls": 6,
      "target": 3,
      "seed": 1,
      "symmetry": "none",
      "starBias": "random",
      "wallBias": "random",
      "holes": 0
    },
    "board": {
      "width": 9,
      "height": 7,
      "playableCells": [
        0,
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        19,
        20,
        21,
        22,
        23,
        24,
        25,
        26,
        30,
        31,
        32,
        39,
        40,
        41,
        48,
        49,
        50,
        57,
        58,
        59
      ],
      "target": 3,
      "walls": [
        32,
        15,
        6,
        21,
        24,
        58
      ],
      "stars": [
        2,
        31,
        26,
        4,
        50
      ],
      "players": [
        0,
        59
      ],
      "scores": [
        0,
        0
      ],
      "turn": 0,
      "ply": 0,
      "winner": null
    },
    "diagnostics": {
      "openingActions": [
        30,
        17
      ],
      "fixedWallReachable": [
        [
          2,
          31,
          4,
          50
        ],
        [
          2,
          31,
          4,
          50
        ]
      ],
      "terrainConnected": true,
      "reachability": "固定壁の参考値。壁操作を含む取得可能性・決着は未証明"
    }
  },
  {
    "id": "z-ee5d9bfd",
    "name": "十字・1",
    "generatorVersion": "mask-lab-2",
    "seed": 1,
    "algorithm": "seeded-constraint",
    "status": "合法性確認済み",
    "metrics": null,
    "games": 0,
    "unresolvedRate": null,
    "shape": "cross",
    "parameters": {
      "width": 9,
      "height": 7,
      "shape": "cross",
      "corridor": 3,
      "stars": 5,
      "walls": 6,
      "target": 3,
      "seed": 1,
      "symmetry": "none",
      "starBias": "random",
      "wallBias": "random",
      "holes": 0
    },
    "board": {
      "width": 9,
      "height": 7,
      "playableCells": [
        3,
        4,
        5,
        12,
        13,
        14,
        18,
        19,
        20,
        21,
        22,
        23,
        24,
        25,
        26,
        27,
        28,
        29,
        30,
        31,
        32,
        33,
        34,
        35,
        36,
        37,
        38,
        39,
        40,
        41,
        42,
        43,
        44,
        48,
        49,
        50,
        57,
        58,
        59
      ],
      "target": 3,
      "walls": [
        41,
        27,
        18,
        33,
        36,
        59
      ],
      "stars": [
        5,
        40,
        38,
        13,
        57
      ],
      "players": [
        3,
        44
      ],
      "scores": [
        0,
        0
      ],
      "turn": 0,
      "ply": 0,
      "winner": null
    },
    "diagnostics": {
      "openingActions": [
        26,
        26
      ],
      "fixedWallReachable": [
        [
          5,
          40,
          57
        ],
        [
          5,
          40,
          57
        ]
      ],
      "terrainConnected": true,
      "reachability": "固定壁の参考値。壁操作を含む取得可能性・決着は未証明"
    }
  },
  {
    "id": "z-1a31856d",
    "name": "H字・1",
    "generatorVersion": "mask-lab-2",
    "seed": 1,
    "algorithm": "seeded-constraint",
    "status": "合法性確認済み",
    "metrics": null,
    "games": 0,
    "unresolvedRate": null,
    "shape": "H",
    "parameters": {
      "width": 9,
      "height": 7,
      "shape": "H",
      "corridor": 3,
      "stars": 5,
      "walls": 6,
      "target": 3,
      "seed": 1,
      "symmetry": "none",
      "starBias": "random",
      "wallBias": "random",
      "holes": 0
    },
    "board": {
      "width": 9,
      "height": 7,
      "playableCells": [
        0,
        1,
        2,
        6,
        7,
        8,
        9,
        10,
        11,
        15,
        16,
        17,
        18,
        19,
        20,
        21,
        22,
        23,
        24,
        25,
        26,
        27,
        28,
        29,
        30,
        31,
        32,
        33,
        34,
        35,
        36,
        37,
        38,
        39,
        40,
        41,
        42,
        43,
        44,
        45,
        46,
        47,
        51,
        52,
        53,
        54,
        55,
        56,
        60,
        61,
        62
      ],
      "target": 3,
      "walls": [
        61,
        10,
        42,
        37,
        16,
        51
      ],
      "stars": [
        2,
        22,
        21,
        38,
        17
      ],
      "players": [
        0,
        62
      ],
      "scores": [
        0,
        0
      ],
      "turn": 0,
      "ply": 0,
      "winner": null
    },
    "diagnostics": {
      "openingActions": [
        34,
        20
      ],
      "fixedWallReachable": [
        [
          2
        ],
        [
          2
        ]
      ],
      "terrainConnected": true,
      "reachability": "固定壁の参考値。壁操作を含む取得可能性・決着は未証明"
    }
  },
  {
    "id": "z-64c0eabb",
    "name": "U字・1",
    "generatorVersion": "mask-lab-2",
    "seed": 1,
    "algorithm": "seeded-constraint",
    "status": "合法性確認済み",
    "metrics": null,
    "games": 0,
    "unresolvedRate": null,
    "shape": "U",
    "parameters": {
      "width": 9,
      "height": 7,
      "shape": "U",
      "corridor": 3,
      "stars": 5,
      "walls": 6,
      "target": 3,
      "seed": 1,
      "symmetry": "none",
      "starBias": "random",
      "wallBias": "random",
      "holes": 0
    },
    "board": {
      "width": 9,
      "height": 7,
      "playableCells": [
        0,
        1,
        2,
        6,
        7,
        8,
        9,
        10,
        11,
        15,
        16,
        17,
        18,
        19,
        20,
        24,
        25,
        26,
        27,
        28,
        29,
        33,
        34,
        35,
        36,
        37,
        38,
        39,
        40,
        41,
        42,
        43,
        44,
        45,
        46,
        47,
        48,
        49,
        50,
        51,
        52,
        53,
        54,
        55,
        56,
        57,
        58,
        59,
        60,
        61,
        62
      ],
      "target": 3,
      "walls": [
        61,
        10,
        48,
        43,
        16,
        54
      ],
      "stars": [
        2,
        25,
        24,
        44,
        17
      ],
      "players": [
        0,
        62
      ],
      "scores": [
        0,
        0
      ],
      "turn": 0,
      "ply": 0,
      "winner": null
    },
    "diagnostics": {
      "openingActions": [
        34,
        20
      ],
      "fixedWallReachable": [
        [
          2
        ],
        [
          2
        ]
      ],
      "terrainConnected": true,
      "reachability": "固定壁の参考値。壁操作を含む取得可能性・決着は未証明"
    }
  },
  {
    "id": "z-1e680e2e",
    "name": "中央に穴・1",
    "generatorVersion": "mask-lab-2",
    "seed": 1,
    "algorithm": "seeded-constraint",
    "status": "合法性確認済み",
    "metrics": null,
    "games": 0,
    "unresolvedRate": null,
    "shape": "ring",
    "parameters": {
      "width": 9,
      "height": 7,
      "shape": "ring",
      "corridor": 3,
      "stars": 5,
      "walls": 6,
      "target": 3,
      "seed": 1,
      "symmetry": "none",
      "starBias": "random",
      "wallBias": "random",
      "holes": 0
    },
    "board": {
      "width": 9,
      "height": 7,
      "playableCells": [
        0,
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        19,
        20,
        21,
        22,
        23,
        24,
        25,
        26,
        27,
        28,
        29,
        33,
        34,
        35,
        36,
        37,
        38,
        39,
        40,
        41,
        42,
        43,
        44,
        45,
        46,
        47,
        48,
        49,
        50,
        51,
        52,
        53,
        54,
        55,
        56,
        57,
        58,
        59,
        60,
        61,
        62
      ],
      "target": 3,
      "walls": [
        7,
        22,
        8,
        59,
        38,
        36
      ],
      "stars": [
        2,
        57,
        54,
        3,
        60
      ],
      "players": [
        0,
        62
      ],
      "scores": [
        0,
        0
      ],
      "turn": 0,
      "ply": 0,
      "winner": null
    },
    "diagnostics": {
      "openingActions": [
        32,
        32
      ],
      "fixedWallReachable": [
        [
          2,
          57,
          54,
          60
        ],
        [
          2,
          57,
          54,
          60
        ]
      ],
      "terrainConnected": true,
      "reachability": "固定壁の参考値。壁操作を含む取得可能性・決着は未証明"
    }
  },
  {
    "id": "z-e2dc6643",
    "name": "くびれ・1",
    "generatorVersion": "mask-lab-2",
    "seed": 1,
    "algorithm": "seeded-constraint",
    "status": "合法性確認済み",
    "metrics": null,
    "games": 0,
    "unresolvedRate": null,
    "shape": "waist",
    "parameters": {
      "width": 9,
      "height": 7,
      "shape": "waist",
      "corridor": 3,
      "stars": 5,
      "walls": 6,
      "target": 3,
      "seed": 1,
      "symmetry": "none",
      "starBias": "random",
      "wallBias": "random",
      "holes": 0
    },
    "board": {
      "width": 9,
      "height": 7,
      "playableCells": [
        0,
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        19,
        20,
        21,
        22,
        23,
        24,
        25,
        26,
        30,
        31,
        32,
        39,
        40,
        41,
        45,
        46,
        47,
        48,
        49,
        50,
        51,
        52,
        53,
        54,
        55,
        56,
        57,
        58,
        59,
        60,
        61,
        62
      ],
      "target": 3,
      "walls": [
        61,
        7,
        48,
        40,
        10,
        54
      ],
      "stars": [
        2,
        16,
        15,
        41,
        11
      ],
      "players": [
        0,
        62
      ],
      "scores": [
        0,
        0
      ],
      "turn": 0,
      "ply": 0,
      "winner": null
    },
    "diagnostics": {
      "openingActions": [
        32,
        19
      ],
      "fixedWallReachable": [
        [],
        []
      ],
      "terrainConnected": true,
      "reachability": "固定壁の参考値。壁操作を含む取得可能性・決着は未証明"
    }
  },
  {
    "id": "z-8eab89f5",
    "name": "段差・1",
    "generatorVersion": "mask-lab-2",
    "seed": 1,
    "algorithm": "seeded-constraint",
    "status": "合法性確認済み",
    "metrics": null,
    "games": 0,
    "unresolvedRate": null,
    "shape": "stairs",
    "parameters": {
      "width": 9,
      "height": 7,
      "shape": "stairs",
      "corridor": 3,
      "stars": 5,
      "walls": 6,
      "target": 3,
      "seed": 1,
      "symmetry": "none",
      "starBias": "random",
      "wallBias": "random",
      "holes": 0
    },
    "board": {
      "width": 9,
      "height": 7,
      "playableCells": [
        0,
        1,
        2,
        3,
        9,
        10,
        11,
        12,
        13,
        18,
        19,
        20,
        21,
        22,
        23,
        27,
        28,
        29,
        30,
        31,
        32,
        33,
        36,
        37,
        38,
        39,
        40,
        41,
        42,
        43,
        44,
        45,
        46,
        47,
        48,
        49,
        50,
        51,
        52,
        53,
        54,
        55,
        56,
        57,
        58,
        59,
        60,
        61,
        62
      ],
      "target": 3,
      "walls": [
        31,
        37,
        18,
        10,
        9,
        60
      ],
      "stars": [
        2,
        30,
        32,
        52,
        33
      ],
      "players": [
        0,
        62
      ],
      "scores": [
        0,
        0
      ],
      "turn": 0,
      "ply": 0,
      "winner": null
    },
    "diagnostics": {
      "openingActions": [
        14,
        27
      ],
      "fixedWallReachable": [
        [
          30
        ],
        [
          2,
          30
        ]
      ],
      "terrainConnected": true,
      "reachability": "固定壁の参考値。壁操作を含む取得可能性・決着は未証明"
    }
  },
  {
    "id": "z-1a31856d",
    "name": "部屋と通路・1",
    "generatorVersion": "mask-lab-2",
    "seed": 1,
    "algorithm": "seeded-constraint",
    "status": "合法性確認済み",
    "metrics": null,
    "games": 0,
    "unresolvedRate": null,
    "shape": "rooms",
    "parameters": {
      "width": 9,
      "height": 7,
      "shape": "rooms",
      "corridor": 3,
      "stars": 5,
      "walls": 6,
      "target": 3,
      "seed": 1,
      "symmetry": "none",
      "starBias": "random",
      "wallBias": "random",
      "holes": 0
    },
    "board": {
      "width": 9,
      "height": 7,
      "playableCells": [
        0,
        1,
        2,
        6,
        7,
        8,
        9,
        10,
        11,
        15,
        16,
        17,
        18,
        19,
        20,
        21,
        22,
        23,
        24,
        25,
        26,
        27,
        28,
        29,
        30,
        31,
        32,
        33,
        34,
        35,
        36,
        37,
        38,
        39,
        40,
        41,
        42,
        43,
        44,
        45,
        46,
        47,
        51,
        52,
        53,
        54,
        55,
        56,
        60,
        61,
        62
      ],
      "target": 3,
      "walls": [
        61,
        10,
        42,
        37,
        16,
        51
      ],
      "stars": [
        2,
        22,
        21,
        38,
        17
      ],
      "players": [
        0,
        62
      ],
      "scores": [
        0,
        0
      ],
      "turn": 0,
      "ply": 0,
      "winner": null
    },
    "diagnostics": {
      "openingActions": [
        34,
        20
      ],
      "fixedWallReachable": [
        [
          2
        ],
        [
          2
        ]
      ],
      "terrainConnected": true,
      "reachability": "固定壁の参考値。壁操作を含む取得可能性・決着は未証明"
    }
  }
];
