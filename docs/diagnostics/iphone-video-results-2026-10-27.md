# iPhone相当WebKitの映像とフレーム記録

判定 **C：区別できず、実機確認が必要**。起点はPR #45 `694f74e32b68a0fcda8284e5b68f2af477ff800d`。同PRの最新CIはrules・browsers・glide・iphone-webkitがすべて成功していた。

## 方法と制約

Linux x86_64、Node 24.19.0、Playwright 1.56.1のiPhone相当WebKit。元の `motion-toggle.spec.js` の対象ケースを各条件3回、同じテスト・video/trace有効で `--repeat-each=3` により実行した。1 workerでは3件を順番に、2 workersでは最大2件を並行した。2 workerでは同じテストの別ブラウザ・動画エンコーダが同時に動く。CPU使用率・CPU affinity・OS負荷は固定しておらず、CIの全スイートの負荷も再現していない。各3例から統計的な失敗率や因果関係は判定できない。

PR #45の操作前からのrAF・座標・transitionイベント記録と同時に、PlaywrightのVP8 WebM動画（390×844、可変タイムスタンプ）を収録した。テスト限定で左上に20ビットの白黒マーカーを表示し、直近rAFの `performance.now()` の整数ミリ秒を記録する。追加のcanvas更新・動画・traceそのものが負荷と描画に影響しうる。ゲーム本体は変更していない。

動画のPTSは動画先頭からの相対時刻、マーカーは最後に実行されたrAFのページ内時刻であり、同じ時計ではない。rAFが停止するとマーカーも古い値のまま残るため、画面の駒座標とマーカー時刻を厳密な同時刻として扱えない。例えばw1-1では動画フレーム107の駒は終点だが、同フレームのマーカーは最後のrAF `4267ms`・始点座標を示していた。映像取得・コンポジタ・canvasの更新が非同期になり得るため、この記録はフレーム提示時刻の正確な証明にならない。

## 結果

各行のサンプルはPR #45の従来計測。動画の列は目視で確認した、駒が始点にある最後の動画フレームと、終点に現れる次の動画フレーム（0始まりのフレーム番号とPTS）。2点の間に別の動画フレームはない。座標はpx。

| 条件・回 | テスト | rAF座標 | 最後の始点→最初の終点の動画フレーム |
| --- | --- | --- | --- |
| 1 worker・1 | 成功 | 28, 301.04, 314 | 106 @ 4250ms → 107 @ 4273ms |
| 1 worker・2 | 成功 | 28, 294.36, 314, 314 | 104 @ 4093ms → 105 @ 4150ms |
| 1 worker・3 | 失敗 | 28, 314 | 123 @ 4858ms → 124 @ 4895ms |
| 2 workers・1 | 失敗 | 28, 312.35, 314 | 182 @ 7248ms → 183 @ 7296ms |
| 2 workers・2 | 失敗 | 28, 314, 314 | 186 @ 7429ms → 187 @ 7478ms |
| 2 workers・3 | 成功 | 28, 296.76, 314 | 130 @ 5194ms → 131 @ 5252ms |

始点28px・終点314px。既存アサーションは最低3サンプルに加え、始点・終点から5pxを超える中間座標を要求する。6回とも動画には途中位置が残っていない一方、3回はrAFで中間座標を得た。したがって**動画に途中がないこと自体は、rAFで途中座標が観測された局面でも起こる**。録画のサンプリング・タイミングは途中を捉えるのに不十分な可能性があるが、実際の描画が画面に提示されたかは証明できず、実機の描画欠落も否定できない。

動画および各フレームのPTS・マーカー・座標推定・rAF・transitionデータは [iphone-video](iphone-video/) に保存した。`orange_window_x` は色閾値と固定領域からの推定であり、人手による画像確認を補助するもの。マーカーと一致するrAFがない動画フレームはnullとする。フレームは動画の初めからすべて列挙し、途中描画の不在をアサーション成功に使っていない。

再解析は `python3 scripts/analyze-motion-video.py docs/diagnostics/iphone-video/w1-1.webm docs/diagnostics/iphone-video/w1-1.json`。ffmpeg・ffprobe・Python numpyが必要。再実行は `MOTION_VIDEO_CLOCK=1 MOTION_VIDEO_OUTPUT=/tmp/iphone-motion-video npx playwright test tests/browser/motion-toggle.spec.js --config=playwright.video.config.js --project=iphone-webkit --repeat-each=3 --workers=1 --grep 'iPhone reduced-motion fallback'`（2 workersでは値のみ変更）。

実機iPhoneは未確認。次は固定負荷で外部カメラや独立した画面録画を用い、ゲームが表示するフレームと記録系の欠落を比較する。中間フレーム検証、ゲーム側のアニメーション時間、CPU・盤面・キャラクター画像は変更していない。
