import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
const dir=process.env.B_SETTLEMENT_REPORT??'reports/b-settlement-2026-10-23',read=n=>JSON.parse(gunzipSync(readFileSync(`${dir}/${n}.json.gz`)));
const s=read('summary'),roster=read('roster'),frozen=read('frozen'),source=read('source-diagnosis'),witnesses=read('capture-witnesses'),games=read('games'),names=new Map(roster.rows.map(r=>[r.id,r.name]));
const pct=x=>x===null?'未算出':(100*x).toFixed(1)+'%',ci=x=>x?x.map(pct).join('〜'):'標本不足',rows=rs=>rs.map(r=>{const m=r.metrics;return `|${r.name??names.get(r.id)}|${m.games}|${m.first}/${m.second}/${m.unresolved}|${m.positionWins.join('/')}|${pct(1-m.unresolvedRate)}|${m.medianDecidedPlies??'—'}|${m.openingDiversity}|${m.nearVictoryReversals}|`;}).join('\n');
const table=rs=>`|盤面|局数|先攻/後攻/未解決|位置P1/P2勝|決着率|決着手数中央値|初手種類|勝利目前からの逆転局数|\n|---|---:|---|---|---:|---:|---:|---:|\n${rows(rs)}`;
const oldU=source.filter(r=>r.reason!=='win'),selectedExamples=[...oldU].sort((a,b)=>b.quiet-a.quiet).slice(0,3),found=witnesses.filter(r=>r.witnesses.some(w=>w.actions));
const policyRows=s.policyDiagnostics.flatMap(r=>Object.entries(r.byPair).map(([pair,m])=>`|${names.get(r.id)}|${pair}|${m.first}/${m.second}/${m.unresolved}|${m.positionWins.join('/')}|${m.medianDecidedPlies??'—'}|`)).join('\n');
const strategy=s.holdout.map(r=>{const a=r.decisionAudit;return `- ${r.name}: ${a.sampledPositions}局面標本、星争奪${a.contestedStarPositions}、壁が必須の即得点${a.wallOnlyCapturePositions}、深さ1/2で手の相違${a.lookaheadDisagreements}。これは方策の比較で、思考が強さへ結び付く因果的証明ではない。`;}).join('\n');
const report=`# B決着改善と全モード独立比較（2026-10-23）

## 現状と保存

開始点4b3f6adeb044b0e2039d03eea6c3801f8f744a1a。PR #15はdraft・未マージ。本番未公開。Sprint・A〜Eの配置、基本ルール、正式CPUは不変。候補を正式採用しない。

既存CI Game quality #309、proof #111、B/D #36はいずれも成功。B/D #36（run39900773777、job120241595224）のB現行は14/3/15、候補1は7/2/23、候補2は7/1/24。現行の未解決15局は全てbudget-time、12〜26手、反復0。これらは保存棋譜のない過去CI集計として区別し、今回のユニーク局数へ加算しない。

今回${s.newUniqueGames}局をID・棋譜・RNG・席/AI割当付きで永続保存。訓練${games.filter(g=>g.experiment.stage==='B-settlement-train').length}、独立比較${games.filter(g=>g.experiment.stage==='B-settlement-holdout').length}、異方策診断${games.filter(g=>g.experiment.stage==='B-policy-diagnostic').length}、全モード独立${games.filter(g=>g.experiment.stage==='all-mode-independent').length}。過去の5,008局・1,696局・218局継続とは合算しない。全予算・シードはprotocol.json。再実行は既存IDを再生成せず、部分保存から再開。

## Bの原因：確認済みと未証明

継続後の既存B64局を全手再生。未解決${oldU.length}局中、真の局面反復${oldU.filter(g=>g.duplicateStates).length}局。全て最終局面に即得点手0だが合法手は${Math.min(...oldU.map(g=>g.snapshots.at(-1).legal))}〜${Math.max(...oldU.map(g=>g.snapshots.at(-1).legal))}通り。連続無得点は最大${Math.max(...oldU.map(g=>g.quiet))}手。壁/駒の往復回数は別に記録し、同一局面反復と混同しない。

分類D（計算予算不足）は直接観測。分類B（残った星と壁に対して得点準備が必要）は局面から支持されるが、分類A（構造的な永久取得不能）・E（合理的妨害による強制非終局）は未証明。C（評価関数）とDを切り分ける異方策結果は下記。深い方策も有限・beam制限付きで最善手ではない。

${selectedExamples.map(g=>`- ${g.id}: ${g.policies.join('/')}、${g.plies}手、得点${g.scores.join(':')}、無得点${g.quiet}手、合法${g.snapshots.at(-1).legal}手、即得点0。初期・中間・最終の盤面と末尾12手をsource-diagnosis.json.gzに保存。`).join('\n')}

3手以内の協力的得点経路を探索し、${found.length}/${oldU.length}局で少なくとも一方の得点経路を発見。他は5,000状態/500msでunknown。相手が協力する経路なので強制得点・相手が拒めない経路ではない。全状態探索ではなく永久封鎖とも断言しない。capture-witnesses.json.gzの成功経路は独立ルールで再生検証。

## 原因対応候補と選抜

${s.generated}合法候補、棄却${s.rejected.length}件。初期配置を上書きせずparentとchangeを保存。先取数、壁削減、星の分散、星/壁同時変更、サイズ7/8/9と再配置を試した。静的合法性・取得距離は絞り込みの参考にのみ使用。訓練2seed×手番/位置/AI交換16局（160ms/512手）から決着率、最大手番/位置偏り、初手種類、ID順で2面を固定。短い予算が高速決着を過大選抜する危険があるため、選別成績で採用しない。

${table(frozen.training.map(r=>({...r,name:names.get(r.id)})))}

## 独立比較

未使用8seed、各64局、search/production route、700ms/2,048手（soft budget）。条件内で手番・物理的位置・AI担当を全交換。人間の所要時間ではない。無得点や反復を終局条件にしない。

${table(s.holdout)}

${s.holdout.map(r=>`- ${r.name} (${r.id}): 全未解決の帰結を含む先攻率可能域${ci(r.metrics.firstFinalPossible)}。決着局限定Wilson95% ${ci(r.metrics.wilsonFirst95Descriptive)}、seed対応bootstrap95% ${ci(r.metrics.bootstrapFirst95)}。前者は独立局近似で記述的、後者は8seedと打切り選択の限界あり。conservative統計もsummaryに保存。停止理由${JSON.stringify(r.reasons)}。`).join('\n')}

${s.comparisons.map(c=>`- ${names.get(c.id)}: 現行との対応${c.matchedGames}局、決着率差${pct(c.settlementGain)}、seed符号反転片側p=${c.oneSidedSeedSignFlipP}、2候補Holm p=${c.holmP}。交換可能性を仮定する研究上の参考値。`).join('\n')}

正式採用0。先取2は決着率改善と手番の偏りを別に評価する。8×8案も決着率改善が確認できなければ不採用。都合のよい方策結果だけを選ばず全条件を保持。

## 異なるAI・戦略性

別2seed、各方策組16局、700ms/2,048手。低標本の診断であり独立公平性認定ではない。同一局面からの方策差ではなく、同一初期盤面・交換条件の比較。深さ増加で決着が増えても悪手で決着する可能性を除外できない。

|盤面|方策組|先攻/後攻/未解決|物理位置P1/P2勝|決着手数中央値|
|---|---|---|---|---:|
${policyRows}

${strategy}

初手種類は席・手番条件も含む観測値で、複数の最善手がある証明ではない。壁操作頻度は壁の重要性そのものを証明しない。逆転は保存棋譜の定義に依存。人間の楽しさ、初心者の理解、5分/10分は未測定。

## 全モード

新しい4seed、star/searchの各32局、300ms/1,024手。同一予算内の比較だが重い方策ほど手数が少なくなる。前回の継続成績と混ぜない。

${table(s.modes)}

- Sprint：短期決着と初手多様性を継続確認。人間の入門しやすさはプレイテストが必要。
- A：星7/先取4の理解・得点準備を調査。初心者向けと認定しない。
- B：計算打切りと長期無得点を分離。先取2の単純化だけでは偏り改善を保証しない。
- C：多様性と得点進行を保存。未解決は無条件に膠着と呼ばない。
- D：現行を維持。既往の候補23/40/1、50/14/0を採用しない。今回の別方策も64局の公平性証明ではない。
- E：大盤面の探索負荷を区別。今回の方策・予算下の結果と前回28終局の証拠を併記し、廃止しない。

## 実装・再現・残課題

盤面ラボにB比較の読込ボタンを追加。現行と2候補を研究用・未認定として表示し、既存のCPU/2人対戦・編集・JSON・Undo・再戦を再利用。正式設定と分離。重い既存B/D研究を手動ワークフローへ変更し通常CIの負荷を抑制。

実行：node --max-old-space-size=768 scripts/b-settlement-study.js → 同 --verify → node scripts/b-settlement-report.js。保存済みの同じIDは再対局しない。独立検証は全手をreferenceChildrenで照合、棋譜と統計・割当・ID集合・協力的得点経路を確認。通常CIでは研究対局を再実行しない。

ローカル品質：単体116件成功、構文チェック成功、Chromium29件成功（320px・既存5盤面・研究候補・CPU回復・Undo・再戦・JSON）。初回ブラウザ試行はバイナリ未導入で起動前に失敗し、導入後に全29件を実行。独立再生12,537手成功。WebKit/iPhoneは更新後GitHub CIで確認し、未確認の実行を成功と記さない。CI実行結果はPRに記録。人間の実機操作・理解度テストは未実施。

次はB残星への強制得点/妨害の限定探索、壁削減のより長い訓練予算、初期位置と星を同時調整する未使用seed比較。深さと強さの因果比較、全モードの人間テストと所要時間測定は未完了。数学的な公平性・面白さを認定しない。
`;
writeFileSync(`${dir}.md`,report);
const svg=b=>{const z=34;return `<svg viewBox="0 0 ${b.width*z} ${b.height*z}" role="img" aria-label="盤面。青P1、赤P2、黄丸は星、灰は動く壁">${b.playableCells.map(i=>{const x=i%b.width*z,y=Math.floor(i/b.width)*z,p=b.players.indexOf(i),star=b.stars.includes(i),wall=b.walls.includes(i);return `<rect x="${x}" y="${y}" width="${z}" height="${z}" fill="${wall?'#667085':'#fff7e5'}" stroke="#b8a78e"/>${star?`<circle cx="${x+17}" cy="${y+17}" r="9" fill="#c88600"/>`:''}${p>=0?`<circle cx="${x+17}" cy="${y+17}" r="13" fill="${p?'#c23d4f':'#1d5eaf'}"/><text x="${x+17}" y="${y+21}" text-anchor="middle" fill="white" font-size="12">P${p+1}</text>`:''}`;}).join('')}</svg>`;};
writeFileSync(`${dir}/boards.html`,`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Bの得点停滞：保存棋譜</title><style>body{font:16px system-ui;margin:20px;background:#f4f1e8;color:#202028}main{max-width:1000px;margin:auto}section{background:white;padding:16px;margin:16px 0;border-radius:12px}.states{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;max-width:280px;flex:1 1 250px}svg{width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><main><h1>Bの得点停滞・代表棋譜</h1><p>研究用・未認定。同一局面反復なしでも長い無得点を観測。星＝黄丸、壁＝灰色。経路の永久封鎖・最善手の非終局は未証明。</p>${selectedExamples.map(g=>`<section><h2>${g.id}</h2><p>${g.policies.join('/')} ／ 得点${g.scores.join(':')} ／ 無得点${g.quiet}手</p><div class="states">${g.snapshots.map(x=>`<figure>${svg(x.state)}<figcaption>${x.ply}手目／得点${x.state.scores.join(':')}／合法${x.legal}／即得点${x.scoringActions}</figcaption></figure>`).join('')}</div><h3>末尾12手（セル番号は0始まり行優先、dirは上右下左=0,1,2,3）</h3><pre>${JSON.stringify(g.tail.map(h=>({action:h.a,from:h.from,wallFrom:h.wallFrom,gain:h.gain,legal:h.legal})),null,2)}</pre></section>`).join('')}</main></html>`);
console.log('Wrote',`${dir}.md`,`${dir}/boards.html`);
