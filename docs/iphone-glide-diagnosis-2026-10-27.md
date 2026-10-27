# iPhone相当WebKitの滑走検証メモ

基点: main `7ff7164eb406a74b143883e1576538f2d52a9428`。対象CI: https://github.com/stusaurus/zurash-game/actions/runs/40444323096 （browser job失敗、rules成功）。

`tests/browser/motion-toggle.spec.js` の reduced-motion fallback テストを `iphone-webkit`・1 workerで実行。最初は移動先到達と複数サンプルの確認を通過した後、中間位置が0件で失敗。2回目は同じ中間位置の条件を満たして成功。関連3テストの実行でも同テストを含め3件成功。最初の失敗と後続成功で描画・計測のどちらが原因かは確定できない。

現行テストは移動前に `MutationObserver` を登録し、slide poseを検出してから `requestAnimationFrame` で約530ms座標を取得する。CI負荷や描画フレーム間隔、監視開始とtransition開始の順序が候補だが、フレーム時刻・座標の失敗時記録と実機での描画確認が必要。OS reduced motionに対するゲーム内ON/OFF、設定維持とCSS transition時間の既存検査は後続実行で成功した。実機iPhoneは未確認。

構文チェック成功、単体28件成功。ブラウザ関連3件成功。全ブラウザスイートは未実行。実際の駒・ルール・CPU・盤面、およびアサーションは変更していない。再現性改善を証明できる修正は未確定で、安定化は未完了。

次の調査では、負荷を制御したiPhone相当WebKitで各フレームの時刻・座標・transition開始/終了を同時記録し、取り逃しと実際の描画を区別する。次工程はPR #18のA〜Eを最新mainの承認済みトリケンデザイン・アニメーション・操作性を維持して段階的に統合する。PR #20を完成計画として参照する。
