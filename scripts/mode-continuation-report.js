import {readFileSync,writeFileSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {successors} from '../src/engine.js';
import {MODE_IDS} from './mode-continuation.js';
const dir=process.env.MODE_CONTINUE_REPORT??'reports/mode-continuation-2026-10-23',base='reports/stall-2026-10-23',read=(d,n)=>JSON.parse(gunzipSync(readFileSync(`${d}/${n}.json.gz`))),s=JSON.parse(readFileSync(`${dir}/summary.json`)),plan=JSON.parse(readFileSync(`${dir}/plan.json`)),delta=read(dir,'delta'),source=read(base,'games'),before=new Map(source.map(g=>[g.id,g])),audit=read(dir,'audit');
const pct=x=>x===null?'—':(x*100).toFixed(1)+'%',interval=a=>a?a.map(pct).join('〜'):'未算出';
const examples=MODE_IDS.flatMap(id=>{
 const pending=delta.filter(g=>g.experiment.boardId===id&&g.state.winner===null).sort((a,b)=>b.metrics.quiet-a.metrics.quiet),solved=delta.filter(g=>g.experiment.boardId===id&&g.state.winner!==null).sort((a,b)=>b.state.ply-a.state.ply);
 return [...pending.slice(0,2),...solved.slice(0,1)].map(g=>{const old=before.get(g.id),legal=[0,1].map(turn=>successors({...g.state,turn}));return {id:g.id,boardId:id,policies:g.research.policyByActor,before:old.state,after:g.state,addedHistory:g.history.slice(old.history.length),reason:g.reason,quiet:g.metrics.quiet,addedScores:g.metrics.scorePlies.length-old.metrics.scorePlies.length,addedRepetitions:g.repetitionCount-old.repetitionCount,legalActions:legal.map(cs=>cs.length),immediateCaptures:legal.map((cs,p)=>cs.filter(c=>c.n.scores[p]>g.state.scores[p]).length),lastMoves:g.history.slice(-12),note:'Legal counts describe the saved state; a paused scoring opportunity does not prove the AI would decline it.'};});
});writeFileSync(`${dir}/examples.json.gz`,gzipSync(JSON.stringify(examples)));
const lines=['# スプリント・A〜E：既存棋譜の追加継続（2026-10-23）','','PR #15、開始コミットb4ec48a。前回の新規1,696局を増やさず、6モードの未解決局を同一AI・席・手番・RNGのまま延長した。配置・基本ルール・production CPUは変更していない。','','## 実験計画と集計','',
 `先に元データのSHA-256、全${plan.sourceGames}ゲームID、対象${plan.selectedIDs.length}IDをplan.jsonへ固定。各局に追加${plan.perGameMs}ms／${plan.extraPlies}手、メモリ640MiBの研究予算を割り当てた。Eを先に計算するが、全6モードに同じ上限を適用。予算は手番境界で確認するため1手の処理時間分は超過し得る。`,
 `完了=${s.complete}。継続${s.continued}局、新たな決着${s.newlySettled}局、追加${s.addedPlies.toLocaleString('en-US')}手。新規対局0。元の1,696局は1,696局のまま。既存5,008局や別Actions実行の決着数を足し合わせていない。`,
 '','|モード|継続前 先攻/後攻/未解決|継続後 先攻/後攻/未解決|継続/新決着|決着率 前→後|決着手数中央値|','|---|---|---|---|---|---:|'];
for(const r of s.rows){const a=r.before,b=r.after;lines.push(`|${r.id.replace('mode-','')}|${a.first}/${a.second}/${a.unresolved}|${b.first}/${b.second}/${b.unresolved}|${r.continued}/${r.newlySettled}|${pct(1-a.unresolvedRate)}→${pct(1-b.unresolvedRate)}|${b.medianDecidedPlies??'—'}|`);}
lines.push('','## Eの解釈','');const e=s.rows.find(r=>r.id==='mode-E');lines.push(`Eは0/64決着から${64-e.after.unresolved}/64決着になった。${e.newlySettled}本の実際の合法な終局棋譜が得られたため、元U字2IDの「全到達状態に勝利状態なし」とは異なる。Eの最善手での決着や公平性を証明したものではなく、残る${e.after.unresolved}局の永久停滞も証明していない。`);
lines.push('','## 公平性：手番と位置を分離','', '|モード|物理的位置0/位置1の勝数|未解決込み先攻最終可能範囲|seed対応bootstrap95%（決着局）|保守的cluster95%（決着局）|決着率増分のHolm補正参考p|','|---|---|---|---|---|---|');
for(const r of s.rows)lines.push(`|${r.id.replace('mode-','')}|${r.after.positionWins.join('/')}|${interval(r.after.firstFinalPossible)}|${interval(r.after.bootstrapFirst95)}|${interval(r.conservative.conservativeClusterDecided95)}|${r.comparison.holmSettlementP.toFixed(6)}|`);
lines.push('','8seed群しかなく、AI組とseedの関係・未解決打切りによる選択が残る。決着局だけの先攻率で公平認定しない。Holmは6モードの決着率増分に対するseed符号反転の参考検定に適用。交換可能性の仮定があり、最善手や人間の面白さの証明ではない。今回は配置を選抜・変更しない。','',
 '## AI組による違い','', '|モード|AI組|先攻/後攻/未解決|位置0/位置1|','|---|---|---|---|');
for(const r of s.rows)for(const [pair,m] of Object.entries(r.afterBehavior.byPair))lines.push(`|${r.id.replace('mode-','')}|${pair}|${m.first}/${m.second}/${m.unresolved}|${m.positionWins.join('/')}|`);
lines.push('','## 残る未解決は同じ種類とは限らない','','|モード/AI組|未解決|到達手数中央値|直近の無得点手数中央値|反復を観測した局|','|---|---:|---:|---:|---:|');
const median=xs=>{xs.sort((a,b)=>a-b);const n=xs.length;return n%2?xs[(n-1)/2]:(xs[n/2-1]+xs[n/2])/2;};
for(const id of MODE_IDS)for(const pair of ['search/route','mixed/defensive']){const gs=delta.filter(g=>g.experiment.boardId===id&&g.state.winner===null&&g.research.labels.join('/')===pair);if(gs.length)lines.push(`|${id.replace('mode-','')}/${pair}|${gs.length}|${median(gs.map(g=>g.state.ply))}|${median(gs.map(g=>g.metrics.quiet))}|${gs.filter(g=>g.repetitionCount>0).length}|`);}
lines.push('','Eの混合/防御の未解決は中央値14手・直近無得点3手で反復0局。少なくともこの標本は、長期往復だけを理由に盤面が悪いとはいえず、計算コストの影響を含む。Aの未解決はより長く進み、無得点と反復が重なる例がある。反復の観測は合理的防御や永久ループの証明ではない。');
lines.push('','## 停滞と終局の区別','', '|モード|停止理由と局数|無得点30手以上＋反復の未解決|最長無得点区間|120手を超えた勝利|','|---|---|---:|---:|---:|');
for(const r of s.rows)lines.push(`|${r.id.replace('mode-','')}|${JSON.stringify(r.afterBehavior.stopReasons)}|${r.afterBehavior.quietRepeatedUnresolved}|${r.afterBehavior.maxScorelessPlies}|${r.conservative.plies.beyond120Wins}|`);
const scored=audit.filter(a=>a.addedCaptures>0),late=audit.filter(a=>a.settled&&a.afterPlies>120);lines.push('',`継続中に得点が増えた局は${scored.length}局。追加決着のうち${late.length}局は120手超で終局した。反復や120手を終了ルールへ追加していない。未決着・時間切れ・研究手数予算・合法手なし・勝利の理由を棋譜に保存。`,'',
 'examples.json.gzには各モードの無得点が長い未解決例と、追加決着の代表例を保存。保存状態の合法手数・直近取得可能手数・追加得点・反復・最後12手を記録。停止直後に得点手があることだけで、AIが得点を見送ったとは判断しない。','',
 '## 保存と再開','', 'delta.json.gzは延長した同一IDの棋譜だけ。audit.json.gzは元prefixハッシュ・前後RNG・得点・手数・終了理由を保持。元のresearchラベルも固定し、方策変更を継続に紛れ込ませない。既存checkpointのIDは処理済みとして再加算しない。途中状態は各局後に原子的に保存する。',
 '', '```sh','npm run research:modes:continue','npm run research:modes:verify','npm run research:modes:report','```','',
 '重い処理は手動mode-continuation.ymlのみ。90日保存の成果物を1つ明示して復元・独立検証してから引き継ぐ。元のデータはGitへ永続保存し、通常CIには対局を入れない。',
 '', '盤面ラボの「停滞原因と改善比較を読み込む」で6モードの継続後成績を表示する。他14候補は追加予算が異なるため、同じ時間条件のランキングとして比較しない。',
 '', '未完了：A〜Eの公平性認定、残る未解決の原因究明、十分な独立seed・探索条件での検証、人間の所要時間・楽しさの試遊。5分／10分は目標であり実測値ではない。正式認定・マージ・本番公開は行わない。テスト・CIとコミットはPRへ記録する。','');
writeFileSync('reports/mode-continuation-2026-10-23.md',lines.join('\n'));console.log({report:'reports/mode-continuation-2026-10-23.md',continued:s.continued,newlySettled:s.newlySettled,examples:examples.length});
