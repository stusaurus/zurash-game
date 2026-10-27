# iPhone相当WebKitの滑走計測（2026-10-27）

基点はmain `7ff7164eb406a74b143883e1576538f2d52a9428`。PR #44の[失敗ジョブ](https://github.com/stusaurus/zurash-game/actions/runs/40492907655/job/122151021375)は242成功・1失敗。テストの中間座標が0個だった。ブラウザテストのtraceは同runの `browser-qa` artifactにある（保管期限あり）。

## PR #44の失敗trace

`trace.zip` の `0-trace.trace` から、元のテストが読み出した座標は `[28, 313.5307922363281, 314]` px。終点から5px以上離れた中間座標はなかった。クリック開始のtrace時刻は945038ms。スクリーンキャストには945378ms付近の移動前と946320ms付近の停止後が記録されていたが、途中の駒位置は確認できなかった。画面記録の間隔も粗いため、実際の中間描画がなかったことの証明にはならない。traceにはtransitionイベントの計測がない。

## 操作前からの追加計測

`tests/browser/motion-toggle.spec.js` に、クリック前から継続する `requestAnimationFrame`、時刻・画面座標、transformの `transitionrun/start/end/cancel`、姿勢変化の記録を追加した。従来のpose検出後の計測と全アサーションは維持する。記録はテストの `glide-timing.json` 添付とログに出力する。実アプリ・演出・ルールは変更していない。

環境はLinux上のPlaywright iPhone相当WebKit、Node.js v24.19.0。実機iPhoneではない。単独実行1回は成功。生データは [iphone-motion-single.json](iphone-motion-single.json)。始点28px・終点314px。クリック7195ms、slide属性7301ms。最初の滑走中フレームは7645ms・307.70px、旧計測307.80px、transitionstartも7645ms・307.60px。次の記録フレームは7916ms・314pxで、transitionendも同時刻・314px（elapsedTime 0.49秒）。滑走前の最後のフレーム7218msから約427ms間、次のrAFは記録されなかった。

事前に開始した連続計測も、従来のpose検出後の計測も、ほぼ同じ終点近くのフレームを捉えた。この1回では観測の粗さは示されるが、旧計測開始の遅れが主因であること、あるいはブラウザが実際の中間描画を省略したことは証明できない。CSSイベントの発火やbounding boxの値だけでは実際に画面表示された全フレームを証明できない。

## 全ブラウザテスト中の比較

同じmain上で `npx playwright test` を1回実行（Chromium・WebKit・iPhone相当WebKit、102件、2 workers）。全体結果は101件成功・1件失敗（約7.4分）。失敗はiPhone相当WebKitの対象テストだった。生データは [iphone-motion-full-suite.json](iphone-motion-full-suite.json)。クリック6866ms、slide属性7180ms、stop属性7686ms。滑走前の最後のrAFは6900ms・28px、次のrAFは7725ms・314pxで、間隔825ms。旧計測は `[28, 314]` の2点で、最低3サンプルの既存条件に失敗した。transitionrun/start/endは7724〜7725msにまとめて配信され、位置はいずれも314px、endのelapsedTimeは0.49秒だった。

単独は成功、全体実行中は失敗。ただしworker数・並行処理・サンプル数が異なるため、負荷が失敗を引き起こしたと因果的に証明する比較ではない。少なくとも失敗時、遷移時間を超える間隔でしかrAFを観測できず、イベント配送も遅れていた。操作前からの連続観測にも途中位置はないので、元のMutationObserverの開始位置だけを修正すれば安定すると結論できない。ブラウザ側で実際に画面表示されたフレームやコンポジタの挙動はこのデータでは確認できず、描画省略も排除できない。記録コード自体にも観測負荷がある。

## 判定と次の調査

**B：原因未確定。** ゲームやアサーションを変更せず、診断を残す。次は独立した画面キャプチャまたは動画とフレーム・イベントを同時記録し、CPU負荷・worker数を固定して再現条件を比較する。実機iPhoneの確認は未実施。
