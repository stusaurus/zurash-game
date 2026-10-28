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

## 正式採用画像の導入条件

このブランチではテキストのみを安全に実装し、次のWebPを追加するまでは
`src/mobile-world.js` がモバイルCSSを**読み込まない**ため、元のPR #48が動作する。

- `assets/ice-world-mobile.webp`（正式採用した縦長背景の右側）
- `assets/zurash-approved-logo.webp`（正式採用ロゴ、トリケン含む）

両ファイルは会話内で出力済みの `zurash-mobile-ui-integration.zip` にある。
**GitHubへ画像ファイルを反映するまでは見た目の完成・公開と判定しない。**
`assets/ice-world-desktop.webp` は別工程で、今回のPC版表示はそのまま。

## 品質ゲート

- `npm test` と `npm run check`
- `npx playwright test tests/browser/mobile-system-linked.spec.js`
- 320/390pxで縦スクロールのみ。Eの盤面は内部横スクロール。
- 壁8、星5、コマ2の実エンジン配置、壁選択→1マス移動→滑走→スコア→Undo。
- 5段階CPU、学習CPUの戻る禁止を維持。
- 実機iPhoneの滑走中間フレーム問題はPR #45/#46で未解決。今回のCSS統合で改善したと主張しない。

画像が揃った後、390/320pxのスクリーンショットを撮り、ユーザー承認後に親PRへ統合する。
