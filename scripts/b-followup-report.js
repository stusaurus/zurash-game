import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {holm} from './stall-research.js';
const dir=process.env.B_FOLLOWUP_REPORT??'reports/b-followup-2026-10-23',read=n=>JSON.parse(gunzipSync(readFileSync(`${dir}/${n}.json.gz`))),s=read('summary'),stars=read('star-summary'),starPolicies=read('star-policy-summary'),forced=read('forced-certificates'),frozen=read('frozen'),roster=read('roster'),tactics=read('tactics'),games=read('games'),names=new Map(roster.map(r=>[r.id,r.name]));
const pct=x=>x===null?'未算出':(100*x).toFixed(1)+'%',interval=x=>x?x.map(pct).join('〜'):'未算出',brief=r=>{const m=r.metrics;return `|${r.name??names.get(r.id)}|${m.first}/${m.second}/${m.unresolved}|${m.positionWins.join('/')}|${pct(1-m.unresolvedRate)}|${m.medianDecidedPlies??'—'}|${m.openingDiversity}|${m.nearVictoryReversals}|`;},table=rows=>`|盤面|先攻/後攻/未解決|位置P1/P2勝|決着率|決着手数中央値|初手種類|勝利目前からの逆転局数|\n|---|---|---|---:|---:|---:|---:|\n${rows.map(brief).join('\n')}`;
const comparisons=[...s.comparisons.map(c=>({...c,experiment:'主比較'})),{id:stars.rows[1].id,experiment:'追加星配置比較',...stars.comparison}],adjusted=holm(comparisons.map(c=>c.oneSidedSeedSignFlipP??1));comparisons.forEach((c,i)=>c.taskHolmP=adjusted[i]);
const policyTable=s.policy.flatMap(r=>Object.entries(r.byPair).map(([pair,m])=>`|${r.name}|${pair}|${m.first}/${m.second}/${m.unresolved}|${m.positionWins.join('/')}|`)).join('\n');
const independentRows=[...s.holdout,...stars.rows],independentDiagnostics=games.filter(g=>g.experiment.stage==='B-followup-independent');
const notes=independentRows.map(r=>`- ${r.name}: 先攻率の全未解決帰結を含む可能域${interval(r.metrics.firstFinalPossible)}、決着局限定Wilson95% ${interval(r.metrics.wilsonFirst95Descriptive)}、対応seed bootstrap95% ${interval(r.metrics.bootstrapFirst95)}。位置側の対応区間${interval(r.metrics.bootstrapPosition95)}。保守的seed群区間もsummaryに保存。`).join('\n');
const total=s.newUniqueGames+stars.newUniqueGames+starPolicies.newUniqueGames;
const report=`# Bの長めの訓練・初期位置・星配置・対抗手検証（2026-10-23）

## 判断と境界

開始コミット0325a1ddcfeaff6d5085ad729ca6a5fc1948485b。開始時Game quality #310（単体116、ブラウザ87）と厳密探索 #112は成功。正式Sprint・A〜E、ルール、production CPUを変更しない。PR #15はdraft・未マージ、本番未公開。

新規ユニーク${total}局（位置訓練64・主独立192・異方策96・追加星独立128・星の別方策128）。前段784局から訓練${s.continued}局を同じID・RNG・席/AI割当から継続し、${s.newlySettled}局が新たに決着、追加${s.addedPlies}手。**継続からの新規対局0**。前段784局や以前の研究は上書きしない。元の訓練208局を再生成せず、そのうち未解決だけを延長。途中局面の1手介入2分岐は反実仮想実験として別保存し、新規初期対局・公平性集計には含めない。

## 仮説1：短い訓練が候補を誤って落としていないか

前段160msの訓練へ追加500ms/2,048手。位置4案は最初から660ms/2,560手。どちらもsoft wall-clock予算でCPU速度に依存し、途中保存・再開のGC等も厳密に同じではない。訓練2seedは最終認定には使わない。元の12候補に加え、星・壁・サイズ・先取数を固定した位置4案（0/80、18/62、36/44、54/26）を合法性確認。親を上書きしない。

長めの訓練結果：

${table(frozen.training)}

決着率優先、最大の手番/位置偏り、IDで選抜。壁削減と位置変更から各1案を、主独立対局を見る前にfrozen.json.gzへ固定。2個先取と前回棄却8×8はこの選抜では不採用のまま。異なる魅力・原因を検証するため1系列に統一しない。

## 仮説2：壁削減・初期位置変更

未使用8seed・両開始手番/位置交換/AI交換、各64局。全盤面同じsearch/production route・1,500ms/4,096手。予算打切りは未解決。

${table(s.holdout)}

変更は${frozen.ids.map(id=>`${names.get(id)}：${JSON.stringify(roster.find(r=>r.id===id).change)}`).join('／')}。

## 仮説3：星の分散

長めの訓練で星だけの変更が有望に見えたため、主比較とは別の追加計画star-plan.jsonを対局開始前に固定。選抜は延長訓練の星変更系列のみ。主比較の結果を選択に使わず、さらに別の未使用8seedを使う。全盤面search/production route、900ms/4,096手、各64局。星位置[71,63,12,14,17]→[0,18,40,62,80]、壁・初期位置・9×9・3個先取は維持。

${table(stars.rows)}

この900ms対照と主比較1,500ms対照は合算しない。追加仮説であることを隠さず、今回3比較全体のHolm補正を併記。

## 統計と未解決

${comparisons.map(c=>`- ${c.experiment} ${names.get(c.id)}：対応${c.matchedGames}局、決着率差${pct(c.settlementGain)}、seed符号反転片側p=${c.oneSidedSeedSignFlipP}、今回3比較Holm p=${c.taskHolmP}。`).join('\n')}

${notes}

区間は方策・予算条件付き。Wilsonは独立局近似の記述値、bootstrapは8seedと打切り選択の影響があり、退化した狭い区間を数学的証明にしない。符号反転検定はseed単位の交換可能性を仮定。未解決を除いた50%だけで候補を評価しない。星配置比較も同じ予算の対照との差を見る。

主独立192局の停止理由：${JSON.stringify(Object.fromEntries([...new Set(independentDiagnostics.map(g=>g.reason))].map(reason=>[reason,independentDiagnostics.filter(g=>g.reason===reason).length])))}。合法手なし・invalid actionを通常の未決着に隠さない。

## Bの残星：協力的経路に相手が対抗できるか

前段で保存した途中局面を使う。3手経路の最初の1手を固定し、その後の相手の**全合法応手**を独立実装で列挙。各応手に対し、次の自分の1手で勝てる手が存在するかを確認。これは「その初手が3手勝ちを保証するか」の局所的な厳密検証で、他の初手や長期の勝敗は別問題。

${tactics.map(t=>`- ${t.id}（${t.state.ply}手・得点${t.state.scores.join(':')}・残星${t.state.stars.join(',')}）：3手探索 ${t.proof3.status}（${t.proof3.nodes}展開）、5手探索 ${t.proof5.status}（${t.proof5.nodes}展開）。${t.lines.map(l=>`固定初手${JSON.stringify(l.firstAction)}に対して、相手${l.replies}応手中、次の勝ちを防ぐ応手${l.preventImmediateRootWin}。${l.exampleCounter?`例${JSON.stringify(l.exampleCounter.action)}。`:''}`).join(' ')}`).join('\n')}

特にs-c7721…は2対2・残星12、101手で87手無得点。協力経路はP2が10→17、P1が53→26、P2が壁20→11を作って17→12へ滑走。しかし相手の別応手も検査する必要がある。tactics.json.gzに全応手と次手の勝ち数・対抗例を保存。forced-win-within-horizonのみ、その有限手数内の必勝。finite-horizon-onlyはその範囲の非決着評価であり正式引分でも全ゲームの公平性証明でもない。budget-unresolvedは不明。

### 独立証明で見つかった「停止壁の二重化」

${forced.map(r=>`- ${r.id}: 壁1→2と駒10→17を同時に選ぶと、相手の全${r.independent.certificate.replies}合法応手について、次のP2の1手での勝ちを確認。壁2と20の両方が11へ移動できる準備で、相手は一方を動かしても他方が残る。証明は全応手と勝ち応手を独立実装で再検証。初期盤面からの必勝や公平性の証明ではなく、この途中局面の強制勝ち。
- 同じ履歴・RNGのsearch系列の枝刈り前評価は${r.ordering.rootActions}手すべて${JSON.stringify(r.ordering.uniqueOrderingValues)}。この証明手は乱数tie順位${r.ordering.certificateRank1Based}でbeam${r.ordering.beam}から外れる。他にも必勝手がある可能性は否定しない。単に深さを増やし、同じ根の候補選択を使うだけでは改善しない例。
- 同一状態・履歴・RNGで比較した${r.probes.length}方策：${r.probes.map(p=>`${p.label}（次の勝ちを拒める相手応手${p.audit.preventImmediateRootWin}）`).join('、')}。全てこの局面の3手必勝を保証する手を選ばなかった。
- 同一checkpointの2分岐：${r.forks.map(f=>`${f.kind}は${f.game.state.ply-r.state.ply}手追加、${f.game.reason}、勝者${f.game.state.winner===null?'未解決':'P'+(f.game.state.winner+1)}`).join('／')}。介入は最初の1手だけで、通常方策と同じ乱数消費を保ち、以後は既存方策。1局面の比較なので一般的なCPU強化効果とはしない。正式CPUは不変更。`).join('\n')}

3手証明を得た局面で5手の別探索が予算切れになっても矛盾ではない。既に3手必勝が証明されているため5手以内にも勝てるが、後者の探索手続きが時間内に再発見しなかっただけ。forced-certificates.json.gzに完全な応手証明・方策出力・RNG・反実仮想分岐を保存。

## 異なる方策と戦略性の限界

別2seed・各組16局、700ms/2,048手。深さや方策の強さを統計的に認定する標本数ではない。壁操作頻度・初手種類・逆転観測も人間の楽しさを証明しない。

初手種類は物理的な開始位置・席条件込みの観測値で、有力手・最善手の数ではない。勝利目前からの逆転は保存棋譜上の定義による代理指標。

|盤面|方策|先攻/後攻/未解決|位置P1/P2勝|
|---|---|---|---|
${policyTable}

星配置案はさらに別4seed・各方策32局で確認。900ms、手番/位置/AIを交換し、search/routeの主勝率へ合算しない。

|盤面|方策|先攻/後攻/未解決|位置P1/P2勝|
|---|---|---|---|
${starPolicies.rows.flatMap(r=>Object.entries(r.byPair).map(([pair,m])=>`|${r.name}|${pair}|${m.first}/${m.second}/${m.unresolved}|${m.positionWins.join('/')}|`)).join('\n')}

## 全モードの位置付け

今回はBの原因対応を深めた回で、Sprint・A・C・D・Eの新しい対局は0。前段の別4seed・star/search・300msの各32局を新規と数えない：Sprint16/16/0、A7/11/14、B15/1/16、C11/5/16、D17/15/0、E0/0/32。前段より前の長時間継続結果とも合算しない。

- Sprint：現行維持。短期決着に加え、人間の入門しやすさと単調さの確認。
- A：現行維持。得点準備と初心者の理解、打切りと停滞の切り分け。
- B：本報告の配置変更と限定戦術を継続。正式採用はしない。
- C：現行維持。位置偏りと未解決原因を確認。
- D：現行維持。前段の別方策17/15と従来の偏りを両方保存し、認定しない。
- E：現行維持。計算負荷を分離し、過去の合法終局28本を無視して永久停滞と断定しない。

## 実装・検証・次の判断

ラボの既存B比較ボタンで、新しい壁・位置・星候補と前段の不採用2案を保持し、実験予算と未認定を表示。CPU/2人対戦・エディター・JSON・Undo・再戦は既存機能を再利用。試遊可能であることと正式採用は分離。

再現：node scripts/b-followup.js → node scripts/b-star-check.js → 同 --policies → 各 --verify と星 --verify-policies → node scripts/b-followup-report.js。重い処理は手動b-followup.ymlのみ。ID集合・席/AI割当・RNG継続・独立ルール再生・凍結選抜・対応集計・全応手の証拠を検証。通常CIに大量対局を追加しない。検証結果はverification.json、star-verification.json、star-policy-verification.json。

正式採用0。判断には同予算対照の決着率だけでなく手番・物理位置の偏り、別方策、長期無得点、初手の偏りを併せる。人間の面白さ・所要時間・勝敗の納得感は未測定。候補を何度も選び直した結果の過学習と、短い2seed訓練の不安定性も残る。

次の優先項目は、初期盤面を変えるだけでなく、今回の停止壁二重化のような準備手を落とさない研究用AIを複数の未使用途中局面で評価すること。今回の1局面だけで正式CPUへ採用しない。星分散案は再現性と混合/防御方策の未解決をさらに調べる候補として保存し、壁削減・位置案は改善未確認のまま保持。

ローカル品質：単体122件、Chromium29件成功。新規608局の14,346手、継続追加3,306手を独立ルールで照合。前段784局・12,537手の検証も再実行成功。新しい3手証明、全64応手、方策/RNG再現と1手介入のテストを追加。GitHub CIの最新結果はPRへ記録し、実行前に成功とは表示しない。人間による実機プレイテストは未実施。
`;
writeFileSync(`${dir}.md`,report);writeFileSync(`${dir}/task-comparisons.json`,JSON.stringify(comparisons,null,2)+'\n');
console.log({newUniqueGames:total,continued:s.continued,newlySettled:s.newlySettled,comparisons:comparisons.map(c=>({id:c.id,gain:c.settlementGain,holmP:c.taskHolmP}))});
