import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {protocol,load,save,summarize,blockEstimate,oldSources,tieCases} from './d-walk-study.js';
import {load as oldLoad,measure} from './b-performance-study.js';
const aid=x=>JSON.stringify(x),pct=x=>(100*x).toFixed(1)+'%',fmt=x=>x===null?'—':Number(x).toFixed(1),range=a=>a.map(x=>x===null?'上限不明':fmt(x)).join('〜'),q=(xs,p)=>{const a=[...xs].sort((a,b)=>a-b);return a.length?a[Math.floor((a.length-1)*p)]:null;};
export function report(){
 const p=protocol(),s=load('summary');assert.equal(s.ledger.newInitialGames,448);assert.equal(s.ledger.AIReplayTasks,571);
 const fresh={self:p.selfSeeds.flatMap((_,i)=>load(`self-${i}`)),panel:p.panelSeeds.flatMap((_,i)=>load(`panel-${i}`))},raw=[...fresh.self,...fresh.panel],analyses={self:p.selfSeeds.flatMap((_,i)=>load(`analysis-self-${i}`)),panel:p.panelSeeds.flatMap((_,i)=>load(`analysis-panel-${i}`))};
 const ext=Array.from({length:6},(_,i)=>load(`extension-${i}`)).flat(),prior=Array.from({length:12},(_,i)=>oldLoad(`fresh-${i}`)).flat(),oldCohort={};
 for(const arm of ['A','D']){const before=prior.filter(r=>r.game.research.labels.every(a=>a===arm)),after=before.map(r=>{const es=ext.filter(e=>e.id===r.game.id);return es.length?{...r,game:es.at(-1).game,stats:[...r.stats,...es.flatMap(e=>e.stats)]}:r;});oldCohort[arm]={before:summarize(before),after:summarize(after),continued:s.extensions.filter(r=>r.arm===arm)};}
 const selfTable=Object.entries(s.self).map(([pair,r])=>`|${pair}|${r.settled}/${r.n}|${r.unresolved}|${Object.entries(r.winsByAI).map(([k,v])=>k+':'+v).join(' ')}|${r.firstWins}/${r.secondWins}|${r.diversity.completed.unique}/${r.settled}|${r.diversity.physicalCompleted.unique}/${r.settled}|`).join('\n');
 const lengthTable=Object.entries(s.self).map(([pair,r])=>`|${pair}|${r.observedPlies.median}/${r.observedPlies.p90}/${r.observedPlies.max}|${r.completedPlies.median}/${r.completedPlies.p90}|${range(r.bounds.median)}|${range(r.bounds.p90)}|${range(r.bounds.restrictedMean256)}|${r.quiet.median}/${r.quiet.p90}/${r.quiet.max}|`).join('\n');
 const mixed=fresh.self.filter(r=>r.game.research.labels[0]!==r.game.research.labels[1]),mixedRoles=Object.fromEntries(['D','D-walk'].map(a=>{const rs=mixed.filter(r=>r.game.research.labels[r.game.starter]===a);return [a,{n:rs.length,D:rs.filter(r=>r.game.state.winner!==null&&r.game.research.labels[r.game.state.winner]==='D').length,walk:rs.filter(r=>r.game.state.winner!==null&&r.game.research.labels[r.game.state.winner]==='D-walk').length,u:rs.filter(r=>r.game.state.winner===null).length}];}));
 const panelDetails=Object.fromEntries(p.panelOpponents.map(opp=>[opp,Object.fromEntries(p.panelTargets.map(a=>{const rs=fresh.panel.filter(r=>aid(r.game.research.labels)===aid([a,opp]));return [a,{n:rs.length,wins:rs.filter(r=>r.game.state.winner===0).length,losses:rs.filter(r=>r.game.state.winner===1).length,u:rs.filter(r=>r.game.state.winner===null).length,firstWins:rs.filter(r=>r.game.starter===0&&r.game.state.winner===0).length,secondWins:rs.filter(r=>r.game.starter===1&&r.game.state.winner===0).length}];}))]));
 const panelTable=Object.entries(panelDetails).map(([opp,r])=>`|${opp}|${r.D.wins}/${r.D.losses}/${r.D.u}|${r['D-walk'].wins}/${r['D-walk'].losses}/${r['D-walk'].u}|${r.D.firstWins}/${r.D.secondWins}|${r['D-walk'].firstWins}/${r['D-walk'].secondWins}|${pct(s.effects.panel[opp].wins.mean)} (${s.effects.panel[opp].wins.bootstrap95.map(pct).join('〜')})|`).join('\n');
 const resources=Object.fromEntries(['D','D-walk','A','star','route','defensive'].map(label=>{const ss=raw.flatMap(r=>r.stats).filter(r=>r.label===label),ts=[...analyses.self,...analyses.panel].flatMap(r=>r.tactics).filter(t=>t.AI===label);return [label,{moves:ss.length,medianMs:q(ss.map(r=>r.elapsedMs),.5),p90Ms:q(ss.map(r=>r.elapsedMs),.9),maxHeap:ss.reduce((n,r)=>Math.max(n,r.sampledHeapPeak),0),rss:ss.reduce((n,r)=>Math.max(n,r.processPeakRssKB),0),searchMedian:q(ss.map(r=>r.searchPositions).filter(x=>x!==null),.5),incomplete:ss.filter(r=>r.complete===false).length,unmeasured:ss.filter(r=>r.complete===null).length,avoidable:ts.filter(r=>r.avoidable).length,missedWins:ts.filter(r=>r.missedWin).length}];}));
 const resourceTable=Object.entries(resources).map(([a,r])=>`|${a}|${r.moves}|${fmt(r.medianMs)}/${fmt(r.p90Ms)}|${r.searchMedian??'未計測'}|${fmt(r.maxHeap/1048576)}|${fmt(r.rss/1024)}|${r.incomplete}/${r.unmeasured}|${r.avoidable}/${r.missedWins}|`).join('\n');
 const longTags=Object.fromEntries(['D','D-walk'].map(arm=>{const gs=fresh.self.filter(r=>r.game.research.labels.every(a=>a===arm)),as=analyses.self.filter(a=>gs.some(r=>r.game.id===a.id)),ls=as.filter(a=>a.long);return [arm,{long:ls.length,highRepetition:ls.filter(a=>a.tags.highRepetition).length,noTailScore:ls.filter(a=>a.metrics.plies>=128&&a.tags.tailScoring===0).length,defensiveTail:ls.filter(a=>a.tags.tailDefensiveChoices>0).length,allTiedTail:ls.filter(a=>a.tags.tailTieDenominator>0&&a.tags.tailAllTied/a.tags.tailTieDenominator>=.5).length,pawnBacktracks:gs.reduce((n,r)=>n+r.game.metrics.pawnBacktracks,0),wallBacktracks:gs.reduce((n,r)=>n+r.game.metrics.wallBacktracks,0)}];}));
 const strategicTable=Object.entries(s.self).map(([pair,r])=>`|${pair}|${r.repeatingGames}/${r.n}|${r.comebacks}/${r.settled}|${r.close}/${r.n}|${r.allTiedMoves}/${r.tieDenominator}|${fmt(r.meanTopTies)}|${r.diversity.first10.unique}/${r.diversity.first10.eligible}|`).join('\n');
 const allForks=['development','holdout'].flatMap(kind=>Array.from({length:4},(_,i)=>load(`ties-${kind}-${i}`)).flat()),forkEffects={},prefixes=[];
 for(const kind of ['development','holdout'])for(const variant of p.tieVariants.slice(1)){const rs=allForks.filter(r=>r.kind===kind&&['D',variant].includes(r.variant));forkEffects[kind+'/'+variant]=blockEstimate(rs,r=>Number(r.game.state.winner!==null)*(r.variant===variant?2:-2),[...new Set(rs.map(r=>r.seed))]);}
 for(const kind of ['development','holdout'])for(const c of tieCases(kind)){const a=allForks.find(r=>r.kind===kind&&r.caseID===c.caseID&&r.variant==='D');for(const variant of p.tieVariants.slice(1)){const b=allForks.find(r=>r.kind===kind&&r.caseID===c.caseID&&r.variant===variant),ha=a.game.history.slice(c.checkpoint.history.length),hb=b.game.history.slice(c.checkpoint.history.length),length=Math.min(ha.length,hb.length);let divergence=null;for(let i=0;i<length;i++)if(aid(ha[i].a)!==aid(hb[i].a)){divergence=c.checkpoint.state.ply+i;break;}prefixes.push({kind,caseID:c.caseID,variant,commonTested:length,firstDivergence:divergence});}}
 const forkTable=['development','holdout'].flatMap(kind=>p.tieVariants.map(variant=>{const rs=allForks.filter(r=>r.kind===kind&&r.variant===variant);return `|${kind}|${variant}|${rs.filter(r=>r.game.state.winner!==null).length}/${rs.length}|${rs.reduce((n,r)=>n+r.game.state.ply-r.checkpoint.state.ply,0)}|${fmt(rs.reduce((n,r)=>n+r.game.elapsedMs-r.checkpoint.elapsedMs,0)/1000)}|${rs.reduce((n,r)=>n+r.stats.filter(s=>s.tieChanged).length,0)}|`;})).join('\n');
 const tieProbes=load('tie-probes'),probeChanged=Object.fromEntries(p.tieVariants.map(variant=>[variant,tieProbes.filter(r=>r.probes.find(p=>p.variant===variant).changedFromD).length]));
 const extTable=['A','D'].map(arm=>{const r=oldCohort[arm],es=r.continued;return `|${arm}/${arm}|${es.length}|${[0,1,2].map(stage=>es.filter(r=>r.stages.some(s=>s.stage<=stage&&s.winner!==null)).length).join(' → ')}|${fmt(q(es.map(r=>r.finalPly-r.sourcePly),.5))}/${fmt(q(es.map(r=>r.finalPly-r.sourcePly),.9))}|${Math.max(...es.map(r=>r.finalPly))}|${Math.max(...es.map(r=>r.finalMetrics.longestQuiet))}|${es.filter(r=>r.finalMetrics.repeatedStates>0).length}|${fmt(es.reduce((n,r)=>n+r.addedMs,0)/1000)}|`;}).join('\n');
 const afterTable=Object.entries(oldCohort).map(([a,r])=>`|${a}/${a}|${r.before.completedPlies.median}/${r.before.completedPlies.p90}|${r.after.completedPlies.median}/${r.after.completedPlies.p90}|${r.after.firstWins}/${r.after.secondWins}|`).join('\n');
 const adoption={selfSettlementPositiveLower:s.effects.settlement.bootstrap95[0]>0,strengthScreen:s.effects.mixedStrength.bootstrap95[0]>-p.statistics.strengthTolerance,walkImmediateSafety:resources['D-walk'].avoidable===0,formalAdoption:false,note:'Exploratory screen, not a formal noninferiority trial. No default/production change.'};
 const result={planSHA256:s.planSHA256,oldCohort,panelDetails,mixedRoles,resources,longTags,forkEffects,prefixes,probeChanged,adoption};save('evaluation',result);
 const text=`# D-walk独立検証と長期化対策（2026-10-24）

結論：D-walkは今回、D同士より決着が4局増え、対Dで47勝36敗13未、経路重視型にも改善方向だった。しかし自己対戦の決着差の95%区間は0をまたぎ、長い無得点と強い先攻集中が残る。正式・既定AIへの採用は保留する。反復回避・必要星数を考慮した同点処理も、葉評価を変えず研究比較した。

## 引継ぎと固定条件

PR #15 c0052df、PR #16 2cf2c34、main 7a9f14aを基準とする。両PRはDraft・未マージ、開始時の最新CI全成功。新規研究スクリプト/テスト/資料/CI検証のみで、正式盤面・ルール・src・本番CPU・画像・Sprint/A〜E・星の迷宮の変更0。PRマージ・本番反映なし。

計画を新しい対局前にローカルGitへ固定。自己比較12新seed、相手別確認8別seedで、前回の調整用8局/旧holdout32局と分離した。自己比較192初期局、相手別256初期局。1手8192葉/軟1500ms、初期3秒＋未決着のみ9秒、各段階2048追加手。全根評価の途中では停止しない軟上限。条件順をseedで交代、同じ初期配置/RNG、starter2×物理位置交換2を実施した。

## 1. 旧未決着24局を同じAI/RNGから延長

追加8秒・未決着へ24秒・さらに未決着へ64秒、各段階8192追加手。元の状態・履歴・RNG・訪問回数・AI設定は維持。24初期局を新規へ加算せず、43延長段階を保存した。

|旧AI|延長元|累計決着 8秒→追加24秒→追加64秒|追加手数 中央/P90|最長決着手|最長無得点|反復あり/延長元|追加計算秒合計|
|---|---:|---|---|---:|---:|---:|---:|
${extTable}

全24局が決着した。上限による未決着を引き分けとしない判断を維持する。延長中の全手に最高同点候補数・全候補同点・探索完了数を記録した。A/D別の各段階平均同点数、各局の元/終端手数・無得点・反復はsummary.extensionsに保存している。

旧48局ずつのコホートを、既に決着していた局と延長結果で閉じると：

|旧コホート|延長前の決着局だけ 中央/P90|全局決着後 中央/P90|全局決着後 先攻/後攻勝|
|---|---|---|---|
${afterTable}

「終わった局だけの短さ」は長期局を過小評価していた。旧コホートの延長後と、新seedの12秒試験は計算予算が違うため、同じ勝率・長さへ混ぜない。CPU秒は人間の対局時間ではない。

## 2. 新seedのD/D-walk比較192局

表の並びはplayer0/player1への割当で、先攻名ではない。先後・初期位置をそれぞれ交換した。

|割当|決着/全局|未|AI別勝ち|先攻/後攻勝|固有決着/決着|物理正規化固有/決着|
|---|---|---:|---|---|---|---|
${selfTable}

D-walk自己対戦−D自己対戦の決着率差は${pct(s.effects.settlement.mean)}、12seedブロックbootstrap95% ${s.effects.settlement.bootstrap95.map(pct).join('〜')}、両側符号反転参考p=${s.effects.settlement.signFlipP}。改善方向だが確定しない。

直接混合96局はD-walk47勝/D36勝/未13。勝利確認指標差は${pct(s.effects.mixedStrength.mean)}、95% ${s.effects.mixedStrength.bootstrap95.map(pct).join('〜')}、参考p=${s.effects.mixedStrength.signFlipP}。未決着を除外して勝率を作らない。bootstrapと少数非ゼロブロックの符号反転pは異なる結論になり得る。0.10の許容幅は探索的なスクリーニングで、正式な非劣性試験ではない。

実際の先攻AI別の混合対戦：

~~~json
${JSON.stringify(mixedRoles,null,2)}
~~~

自己対戦には強い先攻集中が残る。未決着を全て後攻勝ちとしても、この標本の先攻勝ちはD/Dで35/48、D-walk/D-walkで38/48以上。盤面の最善手先攻必勝を証明しないが、公平性が改善したとは言えない。物理slot別勝ち・序盤5/10手の固有棋譜・完全重複率は各summary.selfのdiversity/slotWinsに保存。固有終局だけへの間引きは不偏勝率ではなく、重複を新しい公平性証拠として合算しない。

## 3. 打切りを含む長さ

|割当|全観測prefix 中央/P90/最大|決着局のみ 中央/P90|最終中央値の可能域|最終P90の可能域|256手で切った平均手数の可能域|最長無得点 中央/P90/最大|
|---|---|---|---|---|---|---|
${lengthTable}

未決着局L手の最終長は少なくともL+1、上限不明。全局を含めた順序統計量の下限/上限と、min(最終手数,256)の平均の範囲を示した。これは95%信頼区間ではなく、打切りから論理的に許される範囲。分位点は保存コードのfloor((N−1)p)規約。「観測最大」は最終最大ではない。情報のある打切りを独立打切りと仮定した生存曲線は使わない。

D/DとD-walk/D-walkの256手制限平均は約98.3対97.5手で、中央値の29対21手ほど大きな短縮ではない。両者の最終P90上限も不明。長期化を解消したとは言わない。

## 4. 複数相手への強さ（別8seed）

各相手・対象AIごと32局。対象actor0、相手actor1とし、先後2×物理位置2を交換した。不要なactorラベル重複を足していない。DとD-walkは同じseed/RNG/相手で比較。starは即星優先、routeは既存size対応経路CPU、defensiveは距離評価＋得点妨害＋即敗北除外という既存研究方策を流用した。相手の種類を混ぜた総合勝率は作らない。

|相手|D 勝/負/未|D-walk 勝/負/未|D 先攻勝/後攻勝・各16|D-walk 先攻勝/後攻勝・各16|対応勝利確認差・個別95%|
|---|---|---|---|---|---|
${panelTable}

相手Dへの結果は上の混合96局（47/36/13）。D-walkは経路重視型へ改善方向だが、防御重視型には1敗増。各相手の対応区間・決着差・符号反転参考pはsummary.effects.panelに保存した。8seed・複数の探索的比較であり、特定相手の結果だけで正式採用しない。

## 5. 同点候補選択を4条件で分離

- D：現行の最高値の最初の根。
- D-walk：最高値同点内で、次の星への隣接マスBFS距離を最小化。
- D-repeat：最高値同点内で、その到達盤面の訪問数を最小化。Dには元から130の反復罰がある。
- D-victory：最高値同点内で、勝利までに必要な星数を順に集める推定歩行距離を最小化。歩行距離は合法滑走手数や強制勝利の証明ではない。

葉評価・候補集合・根評価値・RNG消費は全条件共通。旧調整8局＋新12局の静的80判断で全件同一を検査し、選択が最高値を下回らないことも確認。係数変更や探索幅変更を混ぜていない。

新12局面は新自己対戦のD/D軌跡から結果によらない規則で選び、調整元・相互の物理重複を除外。これらは独立seed由来だが同じ192局からの分岐であり、新規初期局や別の公平性標本に加算しない。

|局面群|選択方式|決着/局面|追加手数合計|追加計算秒|Dの同点選択から変更した手|
|---|---|---|---:|---:|---:|
${forkTable}

静的な比較開始手がDから変わった局面数（20局面中）：${Object.entries(probeChanged).map(([k,v])=>k+' '+v).join('、')}。分岐中の最初の着手相違はevaluation.prefixesに保存。同じ共通prefixで打切り位置だけ異なる場合を、方策が改善したとは数えない。各同点方式の対応決着差・区間はevaluation.forkEffects。少数局面での僅差を採用根拠にしない。

D-repeatは全20局面の対応する共通prefixでDと着手が一致し、同点選択の変更も0手だった。旧局面の決着3/8対2/8は異なる戦術の効果ではなく、打切り・追加計算負荷の差として扱う。反復回避をさらに加える利益は確認できない。D-victoryも新局面の決着7/12でD-walkと同数で、追加の複雑さに見合う優位を確認できなかった。

反復回避や必要星数の距離は研究比較として残し、D-walkやDの既定動作へ追加しない。実験結果に応じた追加チューニングもしていない。forkEffectsはseedを等重みにした平均で、旧8局面は5seedに属するため、単純な局面数比の差と異なり得る。

## 6. 長期化と戦略性の分類

|自己対戦|反復あり/全局|逆転勝利/決着|2対2到達/全局|全候補同点/完了探索|最高同点候補数平均|序盤10手固有/十分な長さの局|
|---|---|---|---|---|---|---|
${strategicTable}

逆転は最終勝者が途中で得点負け、接戦は両者が勝利まで残り1個に到達した局。長期は観測256手以上または最長無得点128手以上と定義（研究タグでルールではない）。長期局のタグは重複する：

~~~json
${JSON.stringify(longTags,null,2)}
~~~

highRepetitionは同一盤面反復割合10%以上、noTailScoreは末尾128手の星獲得0、defensiveTailは安全/即敗北の分岐が末尾に存在、allTiedTailは末尾の完了探索の半数以上が全候補同点。pawn/wallBacktracksは同じ駒/壁を2手前の自分の元マスに戻した回数で、盤面全体のループとは別。

得点・逆転・危険回避のある区間は実際の攻防として記録するが、長い無得点を全て意味のある防御とは呼ばない。即戻りが多くても壁が違えば盤面反復0になり得る。深い最善防御による必須の膠着かは未証明。人間の楽しさ・再戦意欲・理解しやすさは未検証。

## 7. 計算負荷と防御回帰

|方策|計測手|思考ms 中央/P90|探索局面 中央|heap標本最大MiB|累積RSS MiB|未完了/探索数未計測|回避可能即敗北/即勝利見逃し|
|---|---:|---|---|---:|---:|---|---|
${resourceTable}

全新規着手の合法性・即敗北回避をreferenceChildrenで独立照合。既存順位23/17/24の防御手について、4選択方式の安全性・同じ候補・同じRNG・同じ最高評価を固定回帰で確認した。短期安全を長期必勝とはしない。

経路/証明手の共通前処理は時間に含み探索局面には含めない。star/route/defensiveの内部探索局面数は未計測として空欄にした。heapは標本で、方策により根途中/ターン後の採取点が異なる。RSSはプロセス累積。最大6生成プロセス、検証プロセスも同じ8CPU/8GiBホストを共有し、時間打切り地点は環境依存。速度の隔離比較や実機Safari認定に使わない。

## 8. 台帳・再現と採否

~~~json
${JSON.stringify(s.ledger,null,2)}
~~~

新規448初期局、旧24局の43延長段階、旧8/新12局面からの80分岐を別管理。静的80判断・全AI再計算も新規対局数へ加算しない。全571保存タスクの着手・状態・履歴・RNG・訪問回数・得点等をAI再計算一致。実時間/メモリ値の同値再現は主張しない。

候補分岐の実行方策はvariantで明示し、game.researchは元棋譜の情報を保つ。通常のD/D結果へ同点変更分岐を混ぜない。

~~~sh
npm ci
npm test
node scripts/d-walk-study.js --verify
node scripts/d-walk-analysis.js --verify
node scripts/d-walk-report.js
# 全AI再計算。indexは自己0..11、panel0..7、extension0..5
node scripts/d-walk-study.js --replay self 0
node scripts/d-walk-study.js --replay panel 0
node scripts/d-walk-study.js --replay extension 0
# development/holdoutはpart0..3
node scripts/d-walk-study.js --replay development 0
node scripts/d-walk-study.js --replay holdout 0
node scripts/d-walk-study.js --analysis self 0
node scripts/d-walk-analysis.js --forks holdout 0
npx playwright test
~~~

新規生成は別チェックアウトで--setup、--extend 0..5、--fresh self 0..11、--fresh panel 0..7、--cases、--forks development/holdout 0..3。保存棋譜の再計算は記録した完了根数を使い、同じ壁時計の打切りを再現したとは言わない。

採用スクリーニング：

~~~json
${JSON.stringify(adoption,null,2)}
~~~

正式採用は保留。D-walkはDの防御を維持して改善方向を示したが、自己対戦の決着性優越は確定せず、長期尾部と先攻集中が残った。B完成へは、固定手数/同計算量での独立確認、今回未決着の継続、4手以上の準備・強制防御の独立分析、実機Safari、初見者/経験者の勝敗理解・再戦希望のプレイテストを優先する。ルール追加で決着を強制しない。
`;
 writeFileSync('reports/d-walk-independent-2026-10-24.md',text);console.log(JSON.stringify({adoption,longTags,panelDetails}));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)report();
