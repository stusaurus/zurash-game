import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {apply,key} from '../src/engine.js';
import {sha} from './stall-research.js';
import {bFactorMove} from './b-factorial-ai.js';
import {play,seenAt,plan} from './b-factorial-study.js';
import {randomStream} from './tactics-completion.js';
import {checkpointFingerprint} from './trajectory-followup.js';
const dir='reports/b-factorial-2026-10-24',read=n=>JSON.parse(gunzipSync(readFileSync(`${dir}/${n}.json.gz`))),aid=a=>JSON.stringify(a);
const fmt=n=>n===null?'—':Number(n).toFixed(1),pct=n=>`${(100*n).toFixed(1)}%`;
function table(arms){return '|条件|勝/負/未|安全手保持（局面）|回避可能な即負け選択|候補中央値|探索局面中央値|初手時間 中央/P90 ms|初手未完了|\n|---|---|---|---:|---:|---:|---|---:|\n'+Object.entries(arms).map(([a,r])=>`|${a}|${r.wins}/${r.losses}/${r.unresolved}|${r.anySafeRetained}/${r.safetyEligible}|${r.avoidableDanger}/${r.n}|${r.medianRoots}|${r.medianSearchPositions}|${fmt(r.probeMedianMs)}/${fmt(r.probeP90Ms)}|${r.probeIncomplete}|`).join('\n');}
function actionText(s,a){const wall=a.wall?`壁${s.walls[a.wall.wall]}→${a.wall.to}`:'壁省略',n=apply(s,a);return `${wall}・駒${s.players[s.turn]}→${n.players[s.turn]}`;}
export function representatives(){
 const dev=read('development-forks'),held=read('holdout-forks'),picked=[];
 const defense=dev.find(r=>r.arm==='A'&&r.checkpoint.state.ply===35&&r.judgement.avoidableDanger);assert.ok(defense);
 picked.push({name:'保存局面：防御手を残し、その後の評価を分離',kind:'development',caseID:defense.caseID,records:dev.filter(r=>r.caseID===defense.caseID)});
 const fresh=held.find(r=>r.arm==='D'&&r.game.state.winner===r.actor&&held.some(a=>a.caseID===r.caseID&&a.arm==='A'&&a.game.state.winner===1-a.actor));
 if(fresh)picked.push({name:'未使用局面：A敗北とD勝利の観測例',kind:'holdout',caseID:fresh.caseID,records:held.filter(r=>r.caseID===fresh.caseID)});
 const view=s=>{const width=s.width??s.size??7,height=s.height??s.size??7;return {...s,width,height,playableCells:s.playableCells??Array.from({length:width*height},(_,i)=>i)};};
 const data=picked.map(c=>({...c,records:c.records.map(r=>{let s=r.checkpoint.state;const states=[view(s)],moves=[];for(const h of r.game.history.slice(r.checkpoint.history.length)){moves.push(actionText(s,h.a));s=apply(s,h.a);states.push(view(s));}return {arm:r.arm,actor:r.actor,seed:r.seed,startPly:r.checkpoint.state.ply,outcome:r.game.state.winner===null?'未決着':r.game.state.winner===r.actor?'対象側の勝利':'対象側の敗北',states,moves};})}));
 writeFileSync(`${dir}/representatives.json`,JSON.stringify(data,null,2)+'\n');
 const d=picked[0].records.find(r=>r.arm==='D'),b=picked[0].records.find(r=>r.arm==='B'),cp=play(b.checkpoint,{arm:'B',actor:b.actor,ms:3600000,plies:2,replayStats:b.stats});
 assert.deepEqual(cp.history,d.game.history.slice(0,cp.history.length));
 const probes=['B','D'].map(arm=>bFactorMove(cp.state,arm,randomStream(cp.rngStates[cp.state.turn]),seenAt(cp),{...plan().moveBudget,maxMs:3600000,trace:true}));
 assert.deepEqual(probes[0].retainedActions,probes[1].retainedActions);
 const choices=probes.map(p=>({arm:p.arm,action:p.action,text:actionText(cp.state,p.action),scores:p.scores.filter(r=>probes.some(p=>aid(p.action)===aid(r.action)))}));
 const mechanism={state:cp.state,checkpointSHA256:checkpointFingerprint(cp),checkpointHashSchema:'source-and-policy-state-v1',sameRootSets:true,choices,note:'Static same-state comparison of B versus D at first shared continuation. Does not prove changing only this isolated move wins.'};
 writeFileSync(`${dir}/mechanism.json`,JSON.stringify(mechanism,null,2)+'\n');
 const payload=JSON.stringify(data).replaceAll('<','\\u003c');
 const html=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>B探索AI・4条件の代表棋譜</title><style>*{box-sizing:border-box}body{font:16px/1.6 system-ui,sans-serif;margin:0;padding:16px;background:#f4f7fb;color:#172a3b}main{max-width:820px;margin:auto}h1{font-size:1.3rem}select,button{font:inherit;max-width:100%;padding:8px;margin:4px 0}label{display:block}#board{display:grid;gap:2px;width:min(100%,520px);aspect-ratio:1;background:#9baebd;padding:2px;margin:12px 0}.cell{display:grid;place-items:center;background:white;font-size:clamp(10px,3vw,21px);aspect-ratio:1;position:relative}.wall{background:#59687a;color:white;font-size:12px}.star{color:#b37700}.pawn{border-radius:50%;width:75%;aspect-ratio:1;display:grid;place-items:center;background:#0573bb;color:white;font-weight:bold}.p1{background:#c32f56}.hole{background:#28313a}.small{font-size:13px;color:#4c6173}#result{font-weight:bold}input{width:min(100%,520px)}button:disabled{opacity:.4}</style><main><h1>B探索AI・4条件の代表棋譜</h1><p>研究用比較。正式盤面・CPUは変更していません。勝利例は説明用に選んだもので、公平性や必勝の証明ではありません。</p><label>局面<select id="case"></select></label><label>条件<select id="arm"><option>A：現行候補・距離評価</option><option>B：候補保持のみ改善</option><option>C：評価のみ改善</option><option>D：両方改善</option></select></label><div id="result"></div><div id="status"></div><div id="board" aria-label="棋譜の盤面"></div><input id="step" type="range" min="0" value="0" aria-label="棋譜の手数"><div><button id="first">最初</button> <button id="prev">前の手</button> <button id="next">次の手</button> <button id="last">最後</button></div><p id="move"></p><p class="small">青=プレイヤー0、赤=プレイヤー1、★=星、W=壁。座標・手数はエンジンの0始まりのマス番号／実行済み手数を使用。追加した分岐部分だけを表示します。人間の楽しさと実機iPhoneは未検証。</p></main><script>const data=${payload};const el=id=>document.getElementById(id);data.forEach((r,i)=>el('case').add(new Option(r.name,i)));let record;function load(){record=data[+el('case').value].records.find(r=>r.arm===el('arm').value[0]);el('step').max=record.states.length-1;el('step').value=0;render()}function render(){const i=+el('step').value,s=record.states[i],board=el('board');board.style.gridTemplateColumns='repeat('+s.width+',1fr)';board.replaceChildren();for(let n=0;n<s.width*s.height;n++){const c=document.createElement('div');c.className='cell';c.title='マス'+n;if(!s.playableCells.includes(n))c.classList.add('hole');else if(s.players.includes(n)){const p=s.players.indexOf(n),v=document.createElement('span');v.className='pawn p'+p;v.textContent=p;c.append(v)}else if(s.walls.includes(n)){c.classList.add('wall');c.textContent='W'+s.walls.indexOf(n)}else if(s.stars.includes(n)){c.classList.add('star');c.textContent='★'}board.append(c)}el('result').textContent='条件'+record.arm+'：'+record.outcome+'（一次予算）';el('status').textContent='実行済み'+s.ply+'手 ／ 得点 '+s.scores.join(' 対 ')+' ／ '+(s.winner===null?'次：プレイヤー'+s.turn:'勝者：プレイヤー'+s.winner);el('move').textContent=i?record.moves[i-1]:'比較開始局面';el('first').disabled=el('prev').disabled=i===0;el('next').disabled=el('last').disabled=i===record.states.length-1}el('case').onchange=el('arm').onchange=load;el('step').oninput=render;el('first').onclick=()=>{el('step').value=0;render()};el('last').onclick=()=>{el('step').value=el('step').max;render()};el('prev').onclick=()=>{el('step').value=+el('step').value-1;render()};el('next').onclick=()=>{el('step').value=+el('step').value+1;render()};load();</script></html>`;
 writeFileSync(`${dir}/replay.html`,html);return {data,mechanism};
}
export function report(){
 const s=JSON.parse(readFileSync(`${dir}/summary.json`,'utf8')),reps=representatives(),safety=read('trajectory-safety'),terms=read('term-ablations'),ai=read('ai-replay-verified');
 const sums=kind=>['A','B','C','D'].map(arm=>{const rs=safety.filter(r=>r.kind===kind&&r.arm===arm);return {arm,checked:rs.reduce((n,r)=>n+r.checked,0),dangerous:rs.reduce((n,r)=>n+r.dangerous,0),avoidable:rs.reduce((n,r)=>n+r.avoidable,0),missedWins:rs.reduce((n,r)=>n+r.missedImmediateWins,0)};});
 const effects=s.results.holdout.effects.map(r=>`|${r.control}→${r.treatment}|${pct(r.observedWinDifference)}|${r.seedBootstrap95.map(pct).join('〜')}|${r.twoSidedSeedSignFlipP}|${r.holmReferenceP??'対象外'}|`).join('\n');
 const self=Object.entries(s.results.self).map(([a,r])=>`|${a}|${r.wins}/${r.losses}/${r.unresolved}|${r.positionWins.join('/')}|${r.diversity.completed.unique}/${r.n-r.unresolved}|${r.firstFinalPossible.map(pct).join('〜')}|`).join('\n');
 const memory=Object.entries(s.results.holdout.arms).map(([a,r])=>`|${a}|${fmt(r.maxSampledHeapBytes/1048576)}|${fmt(r.cumulativePeakRssKB/1024)}|${fmt(r.moveMedianMs)}/${fmt(r.moveP90Ms)}|${r.incompleteMoves}/${r.moves}|`).join('\n');
 const supplement=s.results.supplementary?`\n## 補足：一次未決着65分岐を同じ追加8秒で延長\n\n一次結果を固定した後、条件に関係なく未決着全65分岐へ追加8秒/256手を与えた。一次25/32局面の同じID・同じ相手・同じAI/RNGからの継続で、独立した第二標本ではない。一次成績は上書きしない。\n\n保存済み25局面：\n\n${table(s.results.supplementary.development.arms)}\n\n未使用32局面：\n\n${table(s.results.supplementary.holdout.arms)}\n`:'';
 const componentTable=['A','B'].flatMap(arm=>['distance','counts','threat','both'].map(term=>{const rows=terms.filter(r=>r.kind==='holdout'&&r.keeper===(arm==='B'));return `|${arm}の候補|${term}|${rows.filter(r=>aid(r.terms[term].action)!==aid(r.terms.distance.action)).length}/${rows.length}|${rows.filter(r=>r.terms[term].judgement.avoidableDanger).length}|${rows.filter(r=>r.terms[term].judgement.selectedForced).length}|`;})).join('\n');
 const text=`# B探索AIの4条件比較（2026-10-24）

比較の基準はPR #15（d20b580）とPR #16の独立判定器（7d94615）。提出前にPR #15の追加更新c0052df（D初期得点機会の独立証明）も取り込んだが、B比較のAI・棋譜は変わらない。正式盤面・ルール・本番CPU・画像・Sprint/A〜Eの変更は0。以下のA〜Dはモード名ではなく、モードB上の研究AI条件である。

## 比較条件と既存実験との違い

|条件|候補保持|評価|
|---|---|---|
|A|現行の距離順上位8手、安全除外なし|現行の距離|
|B|安全手優先＋妨害/準備/得点の代表と3手証明手|現行の距離|
|C|Aと同じ候補集合|距離＋得点経路数＋次手勝利の脅威|
|D|Bと同じ候補集合|Cと同じ評価|

前段25局面の共通核は全条件に即負け除外が入り、候補保持の安全効果を測れなかった。今回はA/Cを非除外の上位8手へ戻した。全条件で距離順・乱数消費・深さ2・全相手応手・0.88/0.12の合成と反復ペナルティを共有し、評価を替えても候補集合は変えない。即勝利は全条件共通。3手必勝の証明手は保持するが自動採用はせず、評価の効果を分離する。

Aは現行の候補と評価を使う制御実装であり、現行chooseの早期打切りは使わない。実際のchooseを同じ乱数で別途計測し、着手の一致率をデータに保存した。共有の得点経路/証明手の特徴計算はA/Cにも同じように負担させているため、本番CPUとの速度比較ではない。

## 固定計画・独立性・計算予算

計画は b-factorial-2026-10-24-plan.json。実行前にファイルを固定したが、Gitへ先行登録した事前登録ではない。新しい結果を見て係数や候補数を調整していない。1手は探索葉8,192件・軟時間1,500ms、対局/分岐は同じ軟時間予算。時間は根の評価途中では止めないため超過しうる。根ごとの評価完了数・未完了・共通特徴時間を記録した。探索局面数は評価した根＋応手葉で、特徴計算内の経路/証明手走査は含めず、時間へは含める。

PR #16の独立遷移referenceChildrenと深さ3 OR/AND判定で全57初期比較局面を照合。判定器の正解計算は探索側のcaptureRoutesや評価関数を使用しない。全根の安全集合・必勝集合を独立に求め、返された候補集合と選択を検査した。保存元の履歴・訪問回数・担当AI・RNGを復元し、対象側だけを変える。前段の相手AIは維持し、新規対局由来の相手は固定A。新規32局面は新8seed×先後/位置交換から、比較条件の結果を使わない規則で1局1局面を抽出。保存25局面と物理的に同一の状態、および新規内の同一状態を除外した。

一次比較は4,000ms/追加256手。未決着を負けや引き分けとしない。初期予算による打切り地点自体は環境依存。AI再計算は保存された評価完了根数を使い、同じ壁時計の停止時刻を再現したとは言わない。

## 保存済み25局面（診断標本）

${table(s.results.development.arms)}

安全手の上位順位23/17/24を再現し、A/Cでは全てbeam外、B/Dでは全て保持して選択した。もう1件の16位も同様だった。安全手を残す効果は確認できるが、それだけで最終的な敗北を回避したことにはならない。「安全手保持（局面）」は安全手がある局面で少なくとも1手を保持した割合であり、安全手を全部保持した割合ではない。各安全手の保持率はJSONに別記した。

## 調整に未使用の32局面・一次4秒

${table(s.results.holdout.arms)}

8seedを単位に対応を保った区間を計算した。勝利確認の指標であり、未決着を負けにした最終勝率ではない。少数のseedと同一棋譜の相関が残る。

|差|観測勝利差|seed bootstrap 95%・個別未補正|両側seed符号反転p・参考|4比較Holm p・参考|
|---|---|---|---:|---:|
${effects}

符号反転検定にも交換可能性の仮定がある。8組の少数標本でbootstrap区間が0を除いても、総合強化や盤面公平性の確定とはしない。完全重複棋譜の件数と終局のみの固有件数は各armのdiversityに保存した。複数条件で同じ勝利棋譜を得ても独立の公平性証拠として合算しない。

${supplement}

## 初期からの自己対戦・先後/位置交換

新8seed×先後2×初期位置2×4条件の128局。初期4秒、未決着だけ同じAI・同じID/RNGから追加8秒。異なるAIの方策は混ぜない。

|条件|先攻/後攻/未|物理スロット0/1勝|固有終局/決着|未決着を全て含む先攻勝率可能域|
|---|---|---|---|---|
${self}

この表は自己対戦であり、A対Dの直接対戦成績ではない。先後50%への近さを強さの証拠にせず、強い方策になったと仮定して公平性を認定しない。

Dの自己対戦未決着は${s.results.self.D.unresolved}/32、Aは${s.results.self.A.unresolved}/32である。局面分岐の勝利改善を、自己対戦の決着品質改善と同一視しない。4方策とも決着局に先攻集中が残り、盤面固有の最善手先攻有利は未証明。

## メモリと実時間（未使用局面の分岐）

|条件|heap標本最大MiB|プロセス累積最大RSS MiB|対象AI着手時間 中央/P90 ms|未完了着手/計測着手|
|---|---:|---:|---|---|
${memory}

heapは根反復時点と前後の標本、RSSは同じプロセスの累積高水位で、条件ごとに隔離した最大割当量ではない。GC・ホスト負荷の影響もある。source生成とdevelopmentの初期部分は別プロセスで並行し、一次の一部はホスト時間の影響を受ける。速度改善やiPhone快適性を、この数値から認定しない。

## 代表棋譜と評価要素

35手局面ではA/Cが壁63→64を選んで37手で敗北。B/Dは壁10→9を保持し、Bは73手で敗北、Dは62手で3対2勝利した。まず候補不足を解消し、その後の評価が結末へ影響した観測例である。共通の37手局面を再評価した結果はmechanism.jsonに候補集合と両手の評価内訳を保存した。最初に違う1手だけを替えれば必ず勝つという証明ではない。

[4条件を切り替えて棋譜を見る](b-factorial-2026-10-24/replay.html)。一次4秒の分岐部分を表示。未使用局面のA敗北/D勝利例も説明用に収録した。例の選択は事後であり、勝率の追加標本にしない。

距離、得点経路数のみ、勝利脅威のみ、両方の4静的評価を、同じ候補・全応手で比較した（${terms.length*4}判定、対局数0）。これは各要素の着手への寄与の診断であり、単独要素の対局強度の採否を証明しない。複雑な追加項目や係数の後付け調整は採用しない。

|候補|評価要素|距離のみから着手変更・未使用局面|回避可能な即負け選択|3手必勝選択|
|---|---|---|---:|---:|
${componentTable}

全分岐の対象AI着手に対する独立した即負け検査：

~~~json
${JSON.stringify({development:sums('development'),holdout:sums('holdout')},null,2)}
~~~

## 台帳・再計算・採否

~~~json
${JSON.stringify(s.ledger,null,2)}
~~~

元の976初期IDと資料は維持。今回の新規初期160はsource32＋自己対戦128。228局面分岐、source/自己対戦の延長、補足分岐延長を新規対局へ加算しない。独立ルールで全保存着手を再生。${ai.length}本のAI再計算記録を保存し、履歴・RNG・状態・訪問回数・計測値の一致を確認した。再計算は新規標本へ加算しない。

一致確認した計測値は得点・壁移動・無得点等の対局計測であり、実行時間やheap/RSSの同値再現を主張しない。新規研究AIの実名はfactorArm/researchに保存。newGame互換用のpolicies欄はsearchであり、古い独立検証器へはチェック済みの実名と標準ルールを渡す検証用ビューを使う。元の保存データや着手は変更しない。

検証器のキャッシュキーがsize形式の盤面寸法を含んでいなかった問題も修正した。3×3と4×4の同じ数値の駒・壁・星を同じ判定器で続けて調べると誤判定する回帰例を追加。今回の各局面判定は判定器を新しく作るため、この衝突による結果変更はなく、旧16,288局面と17保存局面も再計算して一致を確認する。棋譜ビューアもsize形式を表示用に正規化する。正式エンジンは変更しない。

候補保持による局所的な即負け回避は支持された。経路評価との組合せに条件付きの勝利改善があるが、未決着・8seed・多数の比較・自己対戦の偏りを含めて評価する。新4条件は明示的な研究比較として保持し、既存研究AIの既定動作や正式CPUへ昇格させない。盤面固有の先攻有利は未判定。評価要素単独の総合強さ、人間の楽しさ/所要時間、実機iPhoneは未検証。

## 次の人間プレイテストと開発順

楽しさは未検証。まず小学生相当の初見者と経験者を含む4組以上で、現行Bを先後と物理位置を交換して各2局遊ぶ。研究条件はゲームUIへ接続していないため、A/Dを対戦済みとは数えない。棋譜ビューアの35手局面を条件名を伏せて見せ、候補を選ぶ理由と相手の次の得点を説明してもらう。

記録項目は、ルール理解までの分数、対局時間、誤操作、勝敗理由の説明、壁移動/省略を選ぶ理由、次回変えたい一手、再戦希望（5段階）。「強かったか」と「面白かったか」は別々に聞く。実機iPhone SafariではCPU4手目以降・再戦・戻る・モード切替を確認する。この手順は未実施。

次は追加の未使用seedで固定相手を複数にし、A/D直接対戦と候補/評価の4条件を再検証する。続いて、D自己対戦の停滞原因を固定局面として切り出し、候補を残す効果を保ったまま反復を減らせるか調べる。評価要素単独の対局試験と実機計測を終えるまで、既定AIや本番CPUへの採用を保留する。

## 再現

~~~sh
node scripts/b-factorial-study.js --verify
node scripts/b-factorial-analysis.js --replay
node scripts/b-factorial-analysis.js --merge-replays --shards 1
node scripts/b-factorial-analysis.js --verify-replays
node scripts/b-factorial-analysis.js --safety
node scripts/b-factorial-analysis.js --ablate
node scripts/b-factorial-report.js
~~~

新規生成は出力がない別チェックアウトで--setup、--source、--development、--holdout、--self、--extendの順に行う。--extend-forksは一次後に全未決着65分岐へ追加した補足計画で、一次の成績を上書きしない。時間打切りの再生成は環境依存。PR #15・#16をマージせず、本番反映はしていない。
`;
 writeFileSync('reports/b-factorial-2026-10-24.md',text);
 const cols=['kind','arm','n','wins','losses','unresolved','safetyEligible','anySafeRetained','avoidableDanger','safeActionRetentionMean','medianRoots','medianSearchPositions','probeMedianMs','probeP90Ms','probeIncomplete','maxSampledHeapBytes','cumulativePeakRssKB'];
 const csv=[cols.join(','),...['development','holdout'].flatMap(kind=>Object.entries(s.results[kind].arms).map(([arm,r])=>cols.map(k=>k==='kind'?kind:k==='arm'?arm:r[k]).join(',')))];writeFileSync(`${dir}/comparison.csv`,csv.join('\n')+'\n');
 return {representativeCases:reps.data.length,ledger:s.ledger};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(report()));
