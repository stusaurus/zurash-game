# ズラッシュ！ゲームワールド v2 比較

基点: PR #44 `f708cb39e87aa8412fa5b18eecb8627dc0c620a6`。Chromium・reduced motionで取得。実機iPhoneではない。盤面選択E・壁選択・滑走先・結果は同じ操作と保存棋譜で撮影した。

| 画面 | 変更前 | 変更後 |
| --- | --- | --- |
| 390px 初回 | [前](before/mobile-first.png) | [後](after/mobile-first.png) |
| 390px 盤面と操作 | [前](before/mobile-board.png) | [後](after/mobile-board.png) |
| デスクトップ全体 1440px | [前](before/desktop.png) | [後](after/desktop.png) |
| E 11×11 | [前](before/mode-e.png) | [後](after/mode-e.png) |
| 壁選択中 | [前](before/wall-selected.png) | [後](after/wall-selected.png) |
| 滑走先選択中 | [前](before/slide-selected.png) | [後](after/slide-selected.png) |
| 対戦結果 | [前](before/result.png) | [後](after/result.png) |

Eの盤面はタップ可能な寸法を維持するため、狭い画面では盤面内部を横スクロールする。初回スクリーンショットは横スクロール前の位置。オリジナルのトリケン画像を再利用し、背景・ロゴ・盤の奥行きはCSSによる表現。専用の描き下ろし背景・ロゴ素材は制作していない。
