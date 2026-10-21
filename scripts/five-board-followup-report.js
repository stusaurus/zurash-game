import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {verifyGame} from './tactics-completion.js';
import {completionSummary} from './tactics-completion-statistics.js';

const dir='reports/five-board-followup-2026-10-22';
const read=(dir,name)=>{
 const path=`${dir}/${name}.jsonl`;
 return (fs.existsSync(path)?fs.readFileSync(path,'utf8'):gunzipSync(fs.readFileSync(path+'.gz')).toString()).trim().split('\n').map(JSON.parse);
};
const {plan}=JSON.parse(fs.readFileSync(`${dir}/plan.json`));
const training=read(dir,'training'),independent=read(dir,'independent'),original=read('reports/five-board','refinement');
if(training.length!==136||independent.length!==180||new Set(independent.map(g=>g.id)).size!==180)throw Error('Incomplete or duplicate study');
for(const g of [...training,...independent])verifyGame(g);
for(const g of training){const old=original.find(o=>o.id===g.id);if(!old||JSON.stringify(old.history)!==JSON.stringify(g.history.slice(0,old.history.length)))throw Error('Changed continuation');}
const summarize=gs=>completionSummary(gs.map(g=>({...g,cluster:`${g.policies.join('/')}:${g.seed}`})));
const behavior=gs=>{
 const sum=key=>gs.reduce((n,g)=>n+g.metrics[key],0),plies=gs.reduce((n,g)=>n+g.history.length,0),wallMoves=sum('wallMoves');
 return {plies,wallMoves,wallMoveFraction:plies?wallMoves/plies:null,wallBacktracks:sum('wallBacktracks'),leadChanges:sum('leadChanges'),nearVictoryReversals:gs.filter(g=>g.metrics.nearVictoryReversal).length,captureOpportunities:sum('captureOpportunities'),declinedCaptures:sum('declinedCapture'),immediateWinsMissed:sum('immediateWinsMissed'),quietRepeatedUnresolved:gs.filter(g=>g.reason!=='win'&&g.repetitionCount>0&&g.metrics.quiet>=40).length};
};
const summaries=plan.map(p=>({id:p.id,currentSeed:p.current.seed,alternativeSeed:p.alternative.seed,boards:[p.current,p.alternative].map(c=>({seed:c.seed,family:c.family,spec:{size:c.state.size,stars:c.state.stars.length,walls:c.state.walls.length,target:c.state.target},all:summarize(independent.filter(g=>g.id.startsWith(`${p.id}-${c.seed}-`))),behavior:behavior(independent.filter(g=>g.id.startsWith(`${p.id}-${c.seed}-`))),byPolicy:Object.fromEntries(['search','mixed','route'].map(policy=>[policy,summarize(independent.filter(g=>g.id.startsWith(`${p.id}-${c.seed}-`)&&g.policies[0]===policy))]))}))}));
const newlyDecided=training.filter(g=>g.reason==='win'&&original.find(o=>o.id===g.id).reason!=='win');
const output={trainingGames:136,independentGames:180,distinctGamesAcrossBothStudies:716,originalTrainingUnresolved:original.filter(g=>g.state.winner===null).length,continuedTrainingUnresolved:training.filter(g=>g.state.winner===null).length,newlyDecidedTraining:newlyDecided.length,newlyDecidedBeyond120:newlyDecided.filter(g=>g.state.ply>120).length,remainingTrainingBudgetUnder120:training.filter(g=>g.reason!=='win'&&g.state.ply<120).length,verifiedContinuations:136,verifiedIndependentGames:180,summaries,decision:'No automatic fixture replacement or fairness certification. Small independent validation sample.'};
fs.writeFileSync(`${dir}/summary.json`,JSON.stringify(output,null,2));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const archiveChecks={};
for(const name of ['training','independent']){
 const compressed=fs.readFileSync(`${dir}/${name}.jsonl.gz`),raw=gunzipSync(compressed);
 const plain=`${dir}/${name}.jsonl`;
 if(fs.existsSync(plain)&&!raw.equals(fs.readFileSync(plain)))throw Error('Compressed archive mismatch');
 archiveChecks[name]={games:name==='training'?136:180,sha256:hash(compressed),rawSha256:hash(raw),bytes:compressed.length};
}
fs.writeFileSync(`${dir}/verification.json`,JSON.stringify({prefixesVerified:136,independentGamesVerified:180,archives:archiveChecks,summarySha256:hash(fs.readFileSync(`${dir}/summary.json`))},null,2));
const percent=v=>v===null?'—':`${(v*100).toFixed(1)}%`;
const interval=v=>v?v.map(x=>(x*100).toFixed(1)).join('–')+'%':'—';
const lines=['# 全5盤面の継続・独立比較（2026-10-22）','','全5盤面を維持。スプリントと画面の配置を維持し、代替配置を独立検証した。正式採用・マージ・本番公開は行っていない。','','## 方法','','前回の再選抜136局を、元のAI・RNG・棋譜から追加4秒／4,096手まで継続。初回seed60001による訓練結果から未解決数と先後差のPareto前線を作成し、各サイズで既存1面＋代替1面を事前選択した。異なるサイズの候補を削除する選抜ではない。','','選択に使用していないseed71001〜71003で、探索・混合・production CPUの3つの自己対戦、両開始手番を比較。各配置18局、10配置で180局。各局6秒／4,096手、メモリ512MiB上限。前回より計算予算を増やしたが、まだ計算不足を十分排除したとはいえない。','','先後勝率だけでなく未解決とAI別結果を分離。対応付きbootstrapと保守的なcluster区間は既存の検証済み統計関数を利用。9clusterしかないため区間は広く、点推定で公平性を認定しない。120手・反復を正式な終了条件にはしない。','','## 独立比較','','|盤面|設定|seed|星/壁/先取|先攻勝|後攻勝|未解決|決着率|未解決込み先攻範囲|決着局先攻率の対応付き95%区間|','|---|---|---:|---|---:|---:|---:|---:|---|---|'];
for(const r of summaries)for(const [i,b] of r.boards.entries()){const a=b.all,s=b.spec;lines.push(`|${r.id} ${s.size}×${s.size}|${i?'代替':'現行検証用'}|${b.seed}|${s.stars}/${s.walls}/${s.target}|${a.firstWins}|${a.secondWins}|${a.unresolved}|${percent(a.decidedRate)}|${interval(a.firstFinalPossibleRange)}|${interval(a.pairedBootstrapDecided95)}|`);}
lines.push('','## AI別：先攻勝／後攻勝／未解決','','|盤面/seed|探索|混合|production CPU|','|---|---|---|---|');
for(const r of summaries)for(const b of r.boards)lines.push(`|${r.id}/${b.seed}|`+['search','mixed','route'].map(p=>{const a=b.byPolicy[p];return `${a.firstWins}/${a.secondWins}/${a.unresolved}`;}).join('|')+'|');
lines.push('','## 展開の指標','','|盤面/seed|決着手数中央値/p90|リード交代|先取直前の逆転|壁移動率|静かな反復を伴う未解決|','|---|---|---:|---:|---:|---:|');
for(const r of summaries)for(const b of r.boards)lines.push(`|${r.id}/${b.seed}|${b.all.plies.median??'—'}/${b.all.plies.p90??'—'}|${b.behavior.leadChanges}|${b.behavior.nearVictoryReversals}|${percent(b.behavior.wallMoveFraction)}|${b.behavior.quietRepeatedUnresolved}|`);
lines.push('','壁移動率・リード交代はAI対局での代理指標で、面白さや人間の納得感の認定には使わない。決着手数は決着局に限定するため、未解決が多い配置では特に解釈に注意する。');
lines.push('','## 検証と限界','',`継続136局のprefixと最終局面を照合し、独立180局を合法再生した。訓練未解決は${output.originalTrainingUnresolved}件から${output.continuedTrainingUnresolved}件へ変化。前回536局と重複しない新規対局は180局で、累計716局。継続136件を新規対局として数えていない。`,'','代替選択は4局の訓練に依存する小規模探索。最適化範囲は前回生成した124合法候補の一部であり、星・壁・勝利条件・初期位置を広範囲に最適化し終えたものではない。初期位置は対角のまま。人間の所要時間・小学生の操作性・勝敗の納得感は未認定。','','現行を置き換えるには、独立標本の追加、AI・探索予算を変えた追試、未解決対局の継続が必要。盤面サイズごとの可能性と固定配置の問題は区別する。','','## 再現','','```sh','node scripts/five-board-followup.js','node scripts/five-board-followup-report.js','```','','`training.jsonl.gz` と `independent.jsonl.gz` に全棋譜・状態・RNGを保持。壁時計予算の再実行では中断手数は変わり得る。保存checkpointからの継続と、固定手数での再現性は前回のテストを参照。','');
fs.writeFileSync('reports/five-board-followup-2026-10-22.md',lines.join('\n'));
console.log(JSON.stringify(output.summaries.map(r=>({id:r.id,boards:r.boards.map(b=>({seed:b.seed,first:b.all.firstWins,second:b.all.secondWins,unresolved:b.all.unresolved}))})),null,2));
