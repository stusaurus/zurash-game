// Lab-only match summary. Report observed moves rather than inventing strategy,
// ratings, causality or a guaranteed "best move". No change to engine rules.
export function matchRecap({curryEnabled, scores, ply, winner, events}) {
  if (winner !== 0 && winner !== 1) throw Error("対局が未決着です");
  if (!Array.isArray(events) || events.length !== ply)
    throw Error("対戦ログと手数が一致しません");
  const totals = [0, 1].map(p => {
    const own = events.filter(e => e.player === p);
    return {
      stars: own.filter(e => e.gotStar).length,
      curry: own.filter(e => e.pickedCurry).length,
      doubleWalls: own.filter(e => e.wallCount === 2).length,
      shiftedWalls: own.filter(e => e.wallCount > 0).length,
      noWall: own.filter(e => e.wallCount === 0).length,
    };
  });
  const loser = 1 - winner;
  if (totals.some((t, p) => t.stars !== scores[p]))
    throw Error("星の得点と対戦ログが一致しません");
  if (!curryEnabled && totals.some(t => t.curry || t.doubleWalls))
    throw Error("カレーなしのログにパワー行動があります");

  // The first player to 2 stars may later lose; this is an observable comeback,
  // not a claim that a particular move was objectively optimal.
  let running = [0, 0], firstTwo = null;
  for (const event of events) {
    if (event.gotStar) {
      running[event.player]++;
      if (running[event.player] === 2 && firstTwo === null)
        firstTwo = event.player;
    }
  }
  const comeback = firstTwo !== null && firstTwo !== winner;
  const label = curryEnabled ? "🍛 カレーあり" : "★ カレーなし";
  let comment;
  if (!curryEnabled) {
    comment = comeback
      ? "相手が先に星を2個集めたところから逆転！ 壁1個ルールの読み合いで決着しました。"
      : "壁1個ルールでも、星の取り合いでしっかり決着しました。";
  } else if (totals[winner].doubleWalls > 0) {
    comment = "勝者はカレーパワーで壁を2個動かす手を" +
      totals[winner].doubleWalls + "回使いました！" +
      (comeback ? " 星2個を先行した相手からの逆転勝ちです。" : "");
  } else if (totals[winner].curry > 0) {
    comment = "勝者はカレーを" + totals[winner].curry +
      "回ゲット。壁2個移動は使わず、星を3個先取しました。";
  } else if (totals[loser].doubleWalls > 0) {
    comment = "相手が壁2個移動を" + totals[loser].doubleWalls +
      "回使う中でも、勝者が星を3個先取しました。";
  } else if (totals[loser].curry > 0) {
    comment = "相手はカレーを手に入れましたが、勝者が星を先に3個集めました。";
  } else {
    comment = "両者ともカレーを取らず、星の取り合いで決着しました。";
  }
  const stats = curryEnabled
    ? [
      "カレー獲得：プレイヤー1 " + totals[0].curry + "回 ／ プレイヤー2 " + totals[1].curry + "回",
      "壁2個移動：プレイヤー1 " + totals[0].doubleWalls + "回 ／ プレイヤー2 " + totals[1].doubleWalls + "回",
    ]
    : [
      "壁を動かした手：プレイヤー1 " + totals[0].shiftedWalls + "回 ／ プレイヤー2 " + totals[1].shiftedWalls + "回",
      "壁を動かさなかった手：プレイヤー1 " + totals[0].noWall + "回 ／ プレイヤー2 " + totals[1].noWall + "回",
    ];
  return {
    label,
    scoreLine: "星 " + scores[0] + "対" + scores[1] + " ／ " + ply + "手で決着",
    comment,
    stats,
    totals,
    comeback,
  };
}
