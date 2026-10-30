# スマホ版・採用済み氷世界とゲームシステムの接続

対象: PR #48 (`design/zurash-game-world-v2`) を親にした差分。
目的: ゲーム本体を独立して作り直さず、現在のゲーム画面の見た目だけを改善する。

## 既存操作への対応

| 実UI | 動作の実装 |
|---|---|
| `#board .cell.wall.available` → `.cell.target` | `src/app.js` が `movableWalls()` と `moveWall()` に従って制御 |
| `#skip`（壁移動省略） | `src/app.js` の現行ルール |
| `#directions button` / `.cell.stop` | `slideOptions()` と `finishSlide()` |
| `#scores` / `#result` | 現行の scores/winner/target を表示 |
| `#undo` | 現行履歴。学習CPUでは無効 |
| `#layout` / `#cpuLevel` | 7×7とA〜E、CPU5段階の既存設定 |
| `.token .pawn-image` | 承認済み80pxトリケンを継続 |

`src/engine.js`、`src/app.js`、探索AI、CPU Workerは変更しない。
盤面はアート画像内に描かれた格子ではなく、実エンジンのデータを使う。

## 正式採用画像の登録状態（2026-10-28）

次の画像を既存の採用済みZIPから**バイナリを変更せず**GitHubへ登録した。

- `assets/ice-world-mobile.webp`：191,468 bytes / git blob SHA `1a8b157811b17c6bd509216cfc5c19e427044564`
- `assets/zurash-approved-logo.webp`：198,462 bytes / git blob SHA `40f4ee15620d1bc9affc6f7120cbf1469365e554`

`src/mobile-world.js` は両方の画像読み込みが成功した場合にのみ `world-mobile.css` を追加する。画像が未ロードの環境で元のPR #48を維持する安全策は継続する。

正式採用画像がGitHubに入ったが、**表示テストと実機試遊を終えるまで完成・公開と判定しない**。
`assets/ice-world-desktop.webp` は別工程で、今回のPC版表示はそのまま。

## 品質ゲート

- `npm test` と `npm run check`
- `npx playwright test tests/browser/mobile-system-linked.spec.js`
- 320/390pxで縦スクロールのみ。Eの盤面は内部横スクロール。
- 壁8、星5、コマ2の実エンジン配置、壁選択→1マス移動→滑走→スコア→Undo。
- 5段階CPU、学習CPUの戻る禁止を維持。
- 実機iPhoneの滑走中間フレーム問題はPR #45/#46で未解決。今回のCSS統合で改善したと主張しない。

画像2枚を登録済み。390/320pxのスクリーンショット・実際の操作検証を完了させ、ユーザー承認後に親PRへ統合する。

## Seamless pass：氷の世界との一体感（2026-10-28）

承認済みの背景・ロゴ・トリケン画像は変更しない。`world-mobile.css` のみに次を追加した。

- ロゴ画像の**背景端**だけをグラデーションで周囲へ馴染ませる。ロゴ本体とキャラクターのソース画像は不変。
- 大きな外枠カードを廃止し、盤面を背景の氷原に浮かぶステージとして見せる。
- 2人分のスコアをひとつの帯に統合し、現在のプレイヤーは色付きの下線で区別。
- 手番ガイド→盤面→方向ボタン→戻る／スキップを続く氷の台座として表現。
- 滑走フェーズにおける無効な「壁を動かさずに滑る」ボタンは補足テキストへ見た目を変更。
- 320pxや11×11の盤面内スクロールは維持。クリック可能領域、合法手、星数、プレイヤー座標、CPU・学習記録に変更なし。

見た目の最終採用は実ブラウザのスクリーンショットと人間試遊で判断する。
