import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {load,save,protocol,blockEstimate,directory} from './b-performance-study.js';
import {sha} from './stall-research.js';
const pct=x=>(100*x).toFixed(1)+'%',fmt=x=>x===null?'—':x.toFixed(1),aid=x=>JSON.stringify(x);
export function report(){
 const s=load('summary');assert.equal(s.ledger.AIReplayTasks,208);
 const raw=protocol().seeds.flatMap((_,i)=>load(`fresh-${i}`)),tactics=protocol().seeds.flatMap((_,i)=>load(`tactical-${i}`));
 assert.equal(tactics.length,192);assert.deepEqual(tactics.map(r=>r.id).sort(),raw.map(r=>r.game.id).sort());
 const census=Object.fromEntries(protocol().pairs.map(pair=>{const games=raw.filter(r=>aid(r.game.research.labels)===aid(pair)),ts=tactics.filter(t=>games.some(g=>g.game.id===t.id)).flatMap(t=>t.rows);return [pair.join('/'),{critical:ts.filter(t=>t.criticalWin||t.criticalDefense).length,criticalWins:ts.filter(t=>t.criticalWin).length,criticalDefenses:ts.filter(t=>t.criticalDefense).length,avoidable:ts.filter(t=>t.avoidable).length,avoidableByAI:Object.fromEntries(['A','D'].map(a=>[a,ts.filter(t=>t.AI===a&&t.avoidable).length])),missedWins:ts.filter(t=>t.missedWin).length}];}));
 const candidate=load('progress-verification'),allCandidate=['development','holdout'].flatMap(kind=>Array.from({length:4},(_,i)=>load(`progress-${kind}-${i}`)).flat());
 const stats={};for(const kind of ['development','holdout'])stats[kind]=Object.fromEntries(['D','D-walk'].map(variant=>{const rs=candidate.rows.filter(r=>r.kind===kind&&r.variant===variant);return [variant,{n:rs.length,settled:rs.filter(r=>r.winner!==null).length,wins:kind==='holdout'?rs.filter(r=>r.winner===r.actor).length:null,losses:kind==='holdout'?rs.filter(r=>r.winner!==null&&r.winner!==r.actor).length:null,unresolved:rs.filter(r=>r.winner===null).length,addedPlies:rs.reduce((n,r)=>n+r.addedPlies,0),computeMs:rs.reduce((n,r)=>n+r.elapsedMs,0),avoidable:rs.reduce((n,r)=>n+r.safety.avoidable,0),missed:rs.reduce((n,r)=>n+r.safety.missed,0),changed:rs.reduce((n,r)=>n+r.tieChanges,0)}];}));
 const held=allCandidate.filter(r=>r.kind==='holdout'),seeds=[...new Set(held.map(r=>r.seed))];
 const winEffect=blockEstimate(held,r=>Number(r.game.state.winner===r.actor)*(r.variant==='D-walk'?2:-2),seeds),settleEffect=blockEstimate(held,r=>Number(r.game.state.winner!==null)*(r.variant==='D-walk'?2:-2),seeds);
 const flat=load('flat-diagnosis'),diagnosis=load('diagnosis');
 const manifest={planSHA256:sha(protocol()),summarySHA256:sha(s),tacticalArchiveSHA256:sha(tactics),freshRecordsSHA256:sha(raw),tacticalGameIDs:tactics.map(t=>t.id)};save('tactical-manifest',manifest);
 const evaluation={census,candidate:stats,candidateWinEffect:winEffect,candidateSettlementEffect:settleEffect,allEightExtendedSettled:s.extensions.every(r=>r.stages.at(-1).winner!==null),flatCheckpoints:flat.filter(r=>r.uniqueValues===1).length,noPrepareCheckpoints:flat.filter(r=>r.prepare===0).length};save('evaluation',evaluation);
 const extensionTable=s.extensions.map((r,i)=>{const last=r.stages.at(-1);return `|${i+1}・${r.id.slice(0,13)}|${r.sourcePly}|${r.sourceMetrics.quiet}|${flat[i].uniqueValues}|${r.stages.map(s=>s.winner===null?'未':s.scores.join(':')).join(' → ')}|${last.totalPlies}|${last.totalPlies-r.sourcePly}|${fmt(r.stages.reduce((n,s)=>n+s.addedMs,0)/1000)}|`;}).join('\n');
 const matrix=Object.entries(s.grouped).map(([pair,r])=>`|${pair}|${r.settled}/${r.n}|${r.unresolved}|${r.Dwin}/${r.Awin}|${r.firstWins}/${r.secondWins}|${r.slotWins.join('/')}|${r.diversity.completed.unique}/${r.settled}|`).join('\n');
 const quality=Object.entries(s.grouped).map(([pair,r])=>`|${pair}|${r.plies.completedMedian}/${r.plies.completedP90}|${r.quiet.median}/${r.quiet.p90}|${r.repeatingGames}/${r.n}|${r.comebacks}/${r.settled}|${r.close}/${r.n}|${census[pair].critical}|${census[pair].avoidable}|`).join('\n');
 const resources=Object.entries(s.resources).map(([a,r])=>`|${a}|${r.moves}|${fmt(r.medianMs)}/${fmt(r.p90Ms)}|${fmt(r.featureMedianMs)}|${r.medianSearchPositions}|${fmt(r.maxSampledHeapBytes/1048576)}|${fmt(r.cumulativePeakRssKB/1024)}|${r.incomplete}|`).join('\n');
 const ca=Object.entries(stats.holdout).map(([a,r])=>`|${a}|${r.wins}/${r.losses}/${r.unresolved}|${r.settled}/32|${r.addedPlies}|${fmt(r.computeMs/1000)}|${r.avoidable}/${r.missed}|`).join('\n');
 const text=`# B改善版Dの決着性・総合性能（2026-10-24）

結論：Dは今回の固定Aとの直接対戦に明確に強かったが、D同士の決着性まで改善したとは言えない。正式・既定AIへの採用は保留する。改善候補D-walkにも局面分岐で前進があるが、総合強化の認定には足りない。

## 基準と変更範囲

PR #15 c0052df、PR #16 6e93f54を取得。両方Draft・未マージで開始し、各最新CI全成功を確認した。mainは7a9f14a。PR #16の基準AI・独立遷移・保存棋譜を引き継ぐ。新規研究コードと資料のみ。正式盤面・ルール・src・本番CPU・画像・Sprint/A〜Eは変更0。星の迷宮には触れず、PRマージ・本番反映をしない。

## 1. 旧D未決着8局の分類

8局とも旧12秒計算予算の打切り。未決着は引き分けではない。各棋譜全体を独立合法手で再生し、終端と32手前の計16状態を、独立OR/AND得点判定でも診断した。

|候補原因|確認結果|
|---|---|
|計算時間不足|停止理由は8/8でbudget-time。今回同じDを延長すると8/8決着。主に対局全体の計算予算による打切りで、1手の探索失敗と混同しない。|
|同一局面反復|元8局の全棋譜で0。延長後は1局で1回のみ。主要原因を反復ループとは認定しない。|
|防御し続ける膠着|16標本状態では全合法手が次手即敗北に対して安全。直接の防御強制は確認できない。両者の長期的な最善防御による膠着は未証明。|
|得点機会の見落とし|元全棋譜のその場の得点辞退・即勝利見逃しは0。標本16状態でも即得点0、両者とも3手以内の強制得点なし。4手以上先の見落としは否定できない。|
|準備手の不足|停止時点5/8で探索した全根のD評価が完全同点。7/8で保持器の即時prepare分類が0。現在の2手評価が進展を区別できない現象を確認。これだけで深い準備手の存在・最善性を証明しない。|
|その他|滑走距離評価は到達不能を8へ飽和させ、経路数も両者0だと点差だけの平坦な評価になりやすい。候補順のseed依存で異なる盤面を巡回する。評価同点の診断と下記介入はこの仮説に整合するが、唯一の原因とは断定しない。|

独立得点判定は元の勝敗条件を維持してOR/ANDを3手展開。上限時はunknownを返し、協力的経路を強制得点と数えない。source-diagnosis/flat-diagnosis/diagnosis.json.gzに状態・値・証明範囲を保存。

## 2. 同じ状態・乱数からの段階延長

追加8秒、未決着だけ追加24秒、さらに未決着だけ追加64秒。Dの候補・評価・1手予算は不変。同じID・訪問履歴・RNGから続行し、全延長のAI判断を再計算一致した。各段階の8192追加手の保護上限も引き分けではない。

|旧局番号・ID接頭辞|元手数|元の末尾無得点|終端D評価の種類数|延長各段階の結果|決着手数|追加手数|追加実測秒|
|---|---:|---:|---:|---|---:|---:|---:|
${extensionTable}

累計決着は追加8秒段階2/8、追加24秒段階6/8、追加64秒段階8/8。新規対局0、継続元8、実行延長16段階、追加4,938手。段階予算は上限であり、勝利時は早く終了する。最長局は1705手、最長無得点1690手で、決着したことを快適な対局の証明とはしない。CPU計算秒は人間の対局時間ではない。

## 3. 新seedによる直接比較

計画を最初の新規対局前にローカルGitへ固定した。12新seed×4 actorペア×物理位置交換2×手番交換2＝192初期局。3秒＋未決着だけ9秒、各段階2048追加手。全条件で1手上限8192葉・軟1500ms、深さ2と全相手応手を共通化。Aは前回と同じ制御実装で、本番chooseの早期打切りを使わない。

表のA/Dはplayer0=A、player1=Dで、先攻名ではない。starterと物理位置を別々に交換している。実際の先攻AIでの集計も下に分離した。

|actor0/actor1|決着|未|D勝/A勝|先攻勝/後攻勝|物理slot0/1勝|固有決着棋譜/決着|
|---|---:|---:|---|---|---|---|
${matrix}

混合96局：D86勝/A10勝/未0。D先攻は46/48勝、D後攻は40/48勝。12seedをブロックとしたD−Aの勝利指標差は${pct(s.mixedDifference.mean)}、bootstrap95% ${s.mixedDifference.bootstrap95.map(pct).join('〜')}、両側符号反転参考p=${s.mixedDifference.signFlipP}。未決着0なのでD勝率へ換算すると89.6%、ブロック区間84.4〜94.8%。同じ盤面・方策内の対A優位を支持し、全AIや人間への強さへ一般化しない。

混合対戦の固有終局はラベル付き${s.mixedPool.diversity.completed.unique}/96、物理正規化${s.mixedPool.diversity.physicalCompleted.unique}/96。重複率はそれぞれ${pct(1-s.mixedPool.diversity.completed.unique/96)}、${pct(1-s.mixedPool.diversity.physicalCompleted.unique/96)}。集計表だけを間引いた勝率は不偏推定とはしない。seedブロックで相関を扱い、完全重複を独立公平性標本として増やさない。

D/Dの決着率−A/Aは${pct(s.settlementDifference.mean)}、ブロック95% ${s.settlementDifference.bootstrap95.map(pct).join('〜')}、符号反転参考p=${s.settlementDifference.signFlipP}。今回も未決着はD/D14/48、A/A10/48だが、悪化の大きさは不確実。非劣性や決着性改善を確認したとは言えない。

## 4. 戦略性・決着性

|ペア|決着手数 中央/P90|最長無得点 中央/P90・全局|反復あり|逆転勝利/決着|2対2到達/全局|重要戦術選択数|回避可能な即負け選択|
|---|---|---|---|---|---|---:|---:|
${quality}

逆転は「最終勝者が途中で点数負け」、接戦は「両者が勝利まで残り1個へ到達」。無得点は末尾も含め再計算し、未決着局の長さを決着手数分布へ入れない。未決着を除いた分布には打切りによる偏りがある。

重要戦術選択は全着手の独立合法手・全相手即応手から、即勝利手と非勝利手が共存、または安全手と即敗北手が共存する状態の数。同一状態に両方あっても1件。長期準備の選択数や人間の戦略理解を測り切る指標ではない。近似評価が近い根を数える初期proxyも保存したが、多数の同点根を数え過ぎるため戦略性の採否根拠にしなかった。

混合対戦は47局で最終勝者が途中で点数負けしており、単に先に星を取る速さだけではDへの対抗にならない。一方、旧延長8局の長い無得点と評価同点は、全てを有益な攻防と呼べない。人間が準備・妨害を理解できるか、面白いかは未検証。

両自己対戦で決着局の先攻集中が残る。物理slotの偏りも方策で変わる。混合対戦でDが先後とも勝つことはAI差の証拠であり、B盤面の公平性を証明しない。最善手による先攻必勝・後攻必勝は未判定。

## 5. 計算負荷

|AI|計測手|思考ms 中央/P90|共通特徴ms 中央|探索局面 中央|heap標本最大MiB|累積RSS MiB|未完了探索|
|---|---:|---|---:|---:|---:|---:|---:|
${resources}

探索局面は根＋応手葉で、共通の経路/証明手特徴前処理は数に含まず時間には含む。両AIで同じ特徴前処理を負担する制御比較。独立choice proxyの観測処理は1手思考時間の外・対局時間の内にある。最大6生成プロセスが8CPU/8GiB環境を共有し、条件順をseedで交代した。heapは標本、RSSはプロセス累積で、隔離したAI別最大割当量ではない。実機Safari・本番CPUの速度認定には使わない。

## 6. 原因に限定したD-walkの比較

Dの正確に同点の候補だけを、壁・他駒・欠損を避けた隣接マスBFSで星に近いものへ選び直す。Dの根集合、RNG、即勝利、異なるminimax値の優劣を変えない。歩行距離は評価の補助で、駒に歩行ルールを加えない。3つの順位23/17/24の防御回帰も維持した。

候補計画は5/8同点の診断後・候補対局前に別ファイルとローカルGitへ固定。調整元は旧未決着8局のみで係数調整なし。両者をD-walkにした8秒/512手分岐では、Dの決着1/8に対しD-walk4/8。これを一般的な自己対戦決着率としない。

調整に使わなかった旧holdout32局面で、対象側だけD/D-walk、相手A固定、同じ局面/RNGから双方を改めて4秒/256手比較した。これらは本案の調整には不使用だが、前段4条件研究では既使用の局面であり、まったく新しい母集団とは言わない。

|候補|対象側 勝/負/未|決着|追加手数合計|実測計算秒合計|回避可能即負け/即勝利見逃し|
|---|---|---|---:|---:|---|
${ca}

対応8seedの勝利確認差は${pct(winEffect.mean)}、ブロック95% ${winEffect.bootstrap95.map(pct).join('〜')}、参考p=${winEffect.signFlipP}。決着差は${pct(settleEffect.mean)}、区間${settleEffect.bootstrap95.map(pct).join('〜')}。今回80分岐の対象側の回避可能な即負け・即勝利見逃しは0。

局所的な決着改善を示す研究候補としてコードと不成功例を保持する。D-walkはAとの新規初期対局、独立新seedの自己対戦、複数相手、厳密な同予算長期比較を未実施。Dの既定動作や本番へは採用しない。追加敗北・残未決着も隠さず、勝利・決着・安全・負荷を同時に評価する。

## 7. 台帳と再現

~~~json
${JSON.stringify(s.ledger,null,2)}
~~~

別にD/D-walk80分岐（調整16＋確認64）、各AI再計算80。192新規局＋旧8局の延長16段階＋80分岐は種類を混ぜない。全288実行タスクで履歴・盤面・RNG・訪問履歴・得点等をAI再計算一致。再計算は新規標本ではない。時間/メモリを同じ値へ再現したとは言わない。source-flat-evaluationは最初の探索ログ、flat-diagnosisは時間を除いた再生成可能な診断。

~~~sh
npm ci
npm test
node scripts/b-performance-study.js --verify
node scripts/b-progress-study.js --verify
node scripts/b-progress-study.js --verify-replays
node scripts/b-performance-report.js
# 全AI判断の再計算（各indexを別プロセスで並列化可能）
node scripts/b-performance-study.js --replay-fresh 0  # 0..11
node scripts/b-performance-study.js --replay-extension 0  # 0..7
node scripts/b-progress-study.js --replay development 0  # part 0..3
node scripts/b-progress-study.js --replay holdout 0  # part 0..3
node scripts/b-performance-analysis.js --tactical 0  # 0..11
npx playwright test
~~~

新規生成は別チェックアウトで--setup、--extend 0..7、--fresh 0..11。D-walkはb-progress-study.js --run development/holdout とpart 0..3。時間予算による新規生成の打切り地点はホスト依存で、保存棋譜の判断再計算には記録した根の完了数を使用する。

## 8. 正式採用に残る条件

1. D/DとA/Aの未決着全件へさらに同予算を与え、固定手数の比較も併用する。今回新規自己対戦の未決着24局は保存し、引き分けとはしない。
2. 未使用seedでD-walkの初期自己対戦とD/A直接対戦を比較。現在のseedへ後付け最適化しない。
3. 星優先・妨害・別探索を含む相手へ確認。対Aの89.6%を総合勝率へ読み替えない。
4. 深い準備手・長期防御の独立判定と、平坦評価の減少が実際に勝利準備へ結びつくかを確認。
5. 実機SafariでCPU複数手番・再戦・戻る・モード切替と応答時間を確認。ブラウザエミュレーションと区別する。
6. 初見者/経験者の対人プレイで、勝敗理由・次に変える一手・再戦希望・無得点時間の感じ方を記録。AIの強さと楽しさを別々に聞く。

正式採用判断：Dは固定Aに対して強いが、決着性を含む総合優越は未達。D-walkは有望な限定候補。両方とも昇格保留、ルールで決着を強制しない。
`;
 writeFileSync('reports/b-performance-2026-10-24.md',text);console.log(JSON.stringify({census,candidate:stats,winEffect,settleEffect}));return evaluation;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)report();
