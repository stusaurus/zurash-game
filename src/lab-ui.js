import {MASK_LIBRARY} from './mask-library.js';
import {EVALUATED_MASK_LIBRARY} from './evaluated-mask-library.js';
import {SHAPES,generateBoard,validateBoard,parseBoardJSON,recordBoard,definitionKey} from './board-lab.js';
export function mountLab(play) {
 const host=document.getElementById('boardLab');
 host.innerHTML=`<section aria-label="比較試遊"><p>比較試遊【研究用・未認定】</p><label>比較する盤面<select id="quickResearch"><option value="A-control">現行A</option><option value="D-positions-14-21">D候補［14,21］</option><option value="C-star-relocate">C候補：星配置</option><option value="C-control">現行C</option><option value="D-control">現行D</option><option value="B-control">現行B</option><option value="E-control">現行E</option></select></label><button id="quickResearchPlay">この比較盤面で対戦</button><p id="quickResearchStatus" role="status"></p></section><details><summary>盤面ラボ【研究用・未認定】</summary>
 <p>保存された盤面で遊ぶ／条件を変えて作る。公平性や決着は未認定です。</p>
 <label>盤面ライブラリ<select id="labLibrary"></select></label>
 <label>検索<input id="labSearch" placeholder="形状・名前・検証状態"></label>
 <button id="labLoad">選んだ盤面を編集・確認</button>
 <button id="labCorpus">生成済みの研究候補を追加表示</button>
 <button id="labDiscovery">名盤研究・全件の基礎評価を読み込む</button>
 <button id="labStage8">第8段階の独立比較を読み込む</button>
 <button id="labStage7">第7段階の全5モード比較を読み込む</button>
 <button id="labStall">停滞原因と改善比較を読み込む</button>
 <button id="labBSettlement">Bの決着改善・独立比較を読み込む</button>
 <div id="labEvidence" aria-live="polite"></div>
 <div class="lab-fields">
 <label>幅<input id="labWidth" type="number" min="2" max="16" value="9"></label>
 <label>高さ<input id="labHeight" type="number" min="2" max="16" value="7"></label>
 <label>形状<select id="labShape"></select></label>
 <label>通路幅<input id="labCorridor" type="number" min="1" max="16" value="3"></label>
 <label>星<input id="labStars" type="number" min="1" max="64" value="5"></label>
 <label>壁<input id="labWalls" type="number" min="0" max="64" value="6"></label>
 <label>先取数<input id="labTarget" type="number" min="1" max="32" value="3"></label>
 <label>シード<input id="labSeed" type="number" value="1"></label>
 <label>対称性<select id="labSymmetry"><option value="none">指定なし</option><option value="rotation">180度回転</option></select></label>
 <label>星配置<select id="labStarBias"><option value="random">ランダム</option><option value="central">中央集中</option><option value="dispersed">分散</option></select></label>
 <label>壁配置<select id="labWallBias"><option value="random">ランダム</option><option value="central">中央集中</option><option value="outer">外周寄り</option></select></label>
 <label>追加の欠損数<input id="labHoles" type="number" min="0" max="64" value="0"></label>
 </div>
 <button id="labGenerate">条件から生成</button> <button id="labRandom">ランダム盤面</button>
 <p id="labMessage" role="status"></p>
 <label>編集するもの<select id="labTool"><option value="terrain">マスの有効・無効</option><option value="stars">星</option><option value="walls">壁</option><option value="p0">プレイヤー1</option><option value="p1">プレイヤー2</option><option value="erase">配置を消す</option></select></label>
 <div class="editor-scroll"><div id="labEditor" aria-label="盤面エディター"></div></div>
 <button id="labPlay" class="primary">この盤面で対戦</button>
 <button id="labSave">この端末に保存</button>
 <details><summary>JSONの読み込み・書き出し</summary>
 <textarea id="labJSON" maxlength="65536" aria-label="盤面JSON"></textarea>
 <button id="labImport">JSONを読み込む</button><button id="labExport">JSONを書き出す</button>
 <button id="labDownload">JSONファイルを保存</button>
 </details></details>`;
 const $=id=>document.getElementById(id),storageKey='zurash-mask-library-v1';
 const say=text=>$('labMessage').textContent=text;
 const attempt=fn=>{try{fn();}catch(e){say(e.message);}};
 let saved=[],corpus=[],discovery=[],basicById=new Map();
 try{const text=localStorage.getItem(storageKey);if(text&&text.length<=1048576){const records=JSON.parse(text);if(Array.isArray(records))saved=records.slice(0,100).flatMap(r=>{try{return [recordBoard(r.board,{name:String(r.name).slice(0,80),seed:r.seed})];}catch{return [];}});}}catch{say('保存データを読み込めませんでした。');}
 let current=structuredClone(MASK_LIBRARY[0]),draft=structuredClone(current.board);
 $('quickResearchPlay').onclick=async()=>{try{const response=await fetch(new URL('../reports/stage8-2026-10-25/quick.json',import.meta.url));if(!response.ok)throw Error('比較盤面を読み込めませんでした');const rs=await response.json();const r=rs.find(r=>r.id==='stage8-'+$('quickResearch').value);if(!r||!validateBoard(r.board).ok)throw Error('比較盤面の形式を確認できません');play(r);}catch(e){$('quickResearchStatus').textContent=e.message;}};
 function records(){const replacement=new Map(discovery.map(r=>[r.id,r])),base=[...MASK_LIBRARY,...EVALUATED_MASK_LIBRARY,...corpus,...saved],ids=new Set(base.map(r=>r.id));return [...base.map(r=>replacement.get(r.id)??r),...discovery.filter(r=>!ids.has(r.id))];}
 function evidence(r){
  const panel=$('labEvidence');panel.replaceChildren();
  const add=text=>{const p=document.createElement('p');p.textContent=text;panel.append(p);};
  if(!r){add('編集後の盤面はAI未検証です。表示していた対局成績は引き継ぎません。');return;}
  const b=r.board,m=r.metrics,shape=SHAPES[r.shape]??r.shape??'自由マスク';
  add(`${shape} · ${b.width}×${b.height} · 星${b.stars.length}／壁${b.walls.length}／${b.target}個先取 · ${r.status}【未認定】`);
  const basic=basicById.get(r.id);if(basic)add(`全件基礎評価：初手${basic.openings.map(o=>o.actions).join('／')}通り、移動可能性${basic.positions.mobility.join('／')}、地形の関節点${basic.topology.articulationCells.length}。固定壁距離と地形グラフの参考値です。`);
  if(!m){add('AI対局は未検証です。');return;}
  add(`AI対局${m.games??r.games}局：先攻${m.first}勝／後攻${m.second}勝／未解決${m.unresolved}局`);
  add(`物理的な初期位置：P1側${m.positionWins?.[0]??'—'}勝／P2側${m.positionWins?.[1]??'—'}勝。手番の集計とは別です。`);
  const hold=m.stages?.holdout,percent=v=>(v*100).toFixed(1)+'%',interval=v=>v?v.map(percent).join('〜'):'標本不足・未算出';
  if(hold){add(`独立条件：${hold.games}局・${hold.clusterCount??'—'}シード群。未解決${hold.unresolved}局。先攻率の対応区間${interval(hold.bootstrapFirst95)}／初期位置側の区間${interval(hold.bootstrapPosition95)}。`);}
  if(m.continuation)add(`保存棋譜を継続：${m.continuation.continued}局／新たに決着${m.continuation.newlySettled}局。新規対局0。追加予算${m.continuation.perGameMs}ms／${m.continuation.extraPlies}手。`);
  if(m.comparison){const c=m.comparison.holdout;add(`親盤面との対応比較${c.matchedGames}局：位置偏りの減少${(c.positionBiasReduction===null?'未算出':c.positionBiasReduction.toFixed(3))}、区間${c.bootstrapReduction95?c.bootstrapReduction95.map(v=>v.toFixed(3)).join('〜'):'未算出'}。${c.improvementSupported?'条件付き改善の暫定的証拠':'改善は未確認'}。`);}
  if(Array.isArray(m.finiteHorizonProof))add('4手以内の厳密探索：'+m.finiteHorizonProof.map(p=>`開始P${p.starter+1} ${p.status}`).join('／')+'。finite-horizon-onlyは全ゲームの引き分け・公平性の証明ではありません。');
  add(`観測された特徴：${(r.traits??[]).join('／')||'評価中'}`);
  if(m.controls?.wallFull?.games)add(`壁制限比較：通常操作${m.controls.wallFull.games}局／壁操作なし${m.controls.wallNone.games}局。ルールを変更した比較実験で、通常対局の勝率に含めません。`);
  add((r.warnings??['研究用・未認定。AI条件と標本に依存し、人間の面白さ・最善手の公平性は未証明です。']).join('／'));
 }
 function invalidateEvidence(){current={...current,name:'カスタム盤面',seed:null,algorithm:'editor',metrics:null};evidence(null);}
 function library(){
  const filter=$('labSearch').value.toLowerCase();$('labLibrary').replaceChildren();
  records().forEach((r,index)=>{if(!`${r.name} ${r.id} ${r.shape??''} ${r.status} ${(r.traits??[]).join(' ')}`.toLowerCase().includes(filter))return;const o=document.createElement('option');o.value=index;o.dataset.research=String(!!r.metrics?.stages?.deep);o.textContent=`${r.name} · ${r.board.width}×${r.board.height} · ${r.status}`;$('labLibrary').append(o);});
 }
 for(const [value,name] of Object.entries(SHAPES)){const o=document.createElement('option');o.value=value;o.textContent=name;$('labShape').append(o);}
 function draw(){
  const e=$('labEditor');e.style.gridTemplateColumns=`repeat(${draft.width},minmax(24px,1fr))`;e.replaceChildren();
  for(let i=0;i<draft.width*draft.height;i++){
   const b=document.createElement('button'),valid=draft.playableCells.includes(i);
   const item=!valid?'欠損':draft.players.includes(i)?`P${draft.players.indexOf(i)+1}`:draft.walls.includes(i)?'壁':draft.stars.includes(i)?'★':'';
   b.textContent=item;b.classList.toggle('gap',!valid);b.setAttribute('aria-label',`${Math.floor(i/draft.width)+1}行${i%draft.width+1}列 ${item||'空き'}`);b.dataset.editCell=i;
   b.onclick=()=>{
    const tool=$('labTool').value;
    if(tool==='terrain'){
     if(valid){draft.playableCells=draft.playableCells.filter(x=>x!==i);draft.walls=draft.walls.filter(x=>x!==i);draft.stars=draft.stars.filter(x=>x!==i);draft.players=draft.players.map(x=>x===i?-1:x);}
     else draft.playableCells.push(i);
    }else if(!valid){say('欠損マスには配置できません。先にマスを有効にしてください。');return;}
    else {
     const toggle=draft[tool]?.includes(i);
     draft.walls=draft.walls.filter(x=>x!==i);draft.stars=draft.stars.filter(x=>x!==i);draft.players=draft.players.map(x=>x===i?-1:x);
     if(tool==='p0'||tool==='p1')draft.players[Number(tool[1])]=i;
     else if(tool!=='erase'&&!toggle)draft[tool].push(i);
    }
    invalidateEvidence();draw();check();
   };e.append(b);
  }
 }
 function check(){const v=validateBoard(draft);$('labPlay').disabled=!v.ok;$('labSave').disabled=!v.ok;say(v.ok?`合法性確認済み・未認定 · 有効${draft.playableCells.length}マス／星${draft.stars.length}／壁${draft.walls.length}／${draft.target}個先取。星取得と決着は未証明。`:v.errors.join('／'));return v;}
 function load(r){current=structuredClone(r);draft=structuredClone(r.board);for(const [id,value] of [['labWidth',draft.width],['labHeight',draft.height],['labStars',draft.stars.length],['labWalls',draft.walls.length],['labTarget',draft.target]])$(id).value=value;if(r.shape&&SHAPES[r.shape])$('labShape').value=r.shape;draw();check();evidence(r);if(r.metrics)say(`${r.status}・未認定 · ${r.games}局／先攻${r.metrics.first}勝・後攻${r.metrics.second}勝・未解決${r.metrics.unresolved}局。${r.traits.join('／')}`);}
 const num=id=>Number($(id).value);
 function options(){return {width:num('labWidth'),height:num('labHeight'),shape:$('labShape').value,corridor:num('labCorridor'),stars:num('labStars'),walls:num('labWalls'),target:num('labTarget'),seed:num('labSeed'),symmetry:$('labSymmetry').value,starBias:$('labStarBias').value,wallBias:$('labWallBias').value,holes:num('labHoles'),playableCells:draft.playableCells};}
 $('labGenerate').onclick=()=>attempt(()=>load(generateBoard(options())));
 $('labRandom').onclick=()=>attempt(()=>{let last;const start=crypto.getRandomValues(new Uint32Array(1))[0];for(let k=0;k<80;k++)try{const r=generateBoard({...options(),seed:(start+k)>>>0});$('labSeed').value=r.seed;load(r);return;}catch(e){last=e;}throw last;});
 $('labLoad').onclick=()=>attempt(()=>{const r=records()[Number($('labLibrary').value)];if(!r)throw Error('盤面を選んでください');load(r);});
 $('labCorpus').onclick=async()=>{
  $('labCorpus').disabled=true;say('研究候補を読み込んでいます…');
  try{
   if(!globalThis.DecompressionStream)throw Error('このブラウザは圧縮ライブラリに未対応です。個別JSONを利用してください。');
   const response=await fetch(new URL('../reports/mask-lab-2026-10-22/corpus.json.gz',import.meta.url));if(!response.ok)throw Error('研究候補を取得できませんでした');
   const bytes=await response.arrayBuffer();if(bytes.byteLength>2097152)throw Error('候補データが大きすぎます');
   const text=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();if(text.length>16777216)throw Error('候補データが大きすぎます');
   const data=JSON.parse(text);if(!Array.isArray(data.accepted)||data.accepted.length>20000)throw Error('候補形式が不正');
   const seen=new Set(records().map(r=>definitionKey(r.board))),next=[];
   for(const r of data.accepted){const v=validateBoard(r.board);if(!v.ok)continue;const k=definitionKey(v.state);if(seen.has(k))continue;seen.add(k);next.push(recordBoard(v.state,{name:r.name,shape:r.shape,seed:r.seed,algorithm:r.algorithm}));}
   corpus=next;library();say(`研究候補${corpus.length}面を追加表示しました。合法性のみ確認・未認定。`);
  }catch(e){say(e.message);$('labCorpus').disabled=false;}
 };
 $('labDiscovery').onclick=async()=>{
  $('labDiscovery').disabled=true;say('名盤研究の結果を読み込んでいます…');
  try{
   if(!globalThis.DecompressionStream)throw Error('圧縮ライブラリに未対応です');
   const fetchData=async name=>{const response=await fetch(new URL('../reports/discovery-2026-10-22/'+name+'.json.gz',import.meta.url));if(!response.ok)throw Error('研究結果を取得できませんでした');const bytes=await response.arrayBuffer();if(bytes.byteLength>2097152)throw Error('研究結果が大きすぎます');const text=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();if(text.length>16777216)throw Error('研究結果が大きすぎます');return JSON.parse(text);};
   const [lib,basic]=await Promise.all([fetchData('catalogue'),fetchData('basics')]);
   if(!Array.isArray(lib)||lib.length>1000||!Array.isArray(basic)||basic.length>20000)throw Error('研究結果の形式が不正');
   discovery=lib.filter(r=>validateBoard(r.board).ok).map(r=>({...r,status:['有望候補','AI検証中'].includes(r.status)?r.status:'AI検証中'}));basicById=new Map(basic.map(r=>[r.id,r]));library();say(`名盤研究${discovery.length}面・全件基礎評価${basic.length}面を読み込みました。すべて未認定。`);
  }catch(e){say(e.message);$('labDiscovery').disabled=false;}
 };
 for(const [button,path,message] of [
  ['labStage8','stage8-2026-10-25','未使用seed・難度別の独立比較。正式採用なし'],
  ['labStage7','stage7-2026-10-25','現行AI固定の盤面比較。すべて研究候補・正式採用なし'],
  ['labStall','mode-continuation-2026-10-23','勝利不能の原因・改善候補・全モードの継続結果'],
  ['labBSettlement','b-followup-2026-10-23','Bの壁・位置・星比較。実験ごとの予算を確認。正式採用なし']
 ])$(button).onclick=async()=>{
  $(button).disabled=true;say('停滞研究の結果を読み込んでいます…');
  try{
   if(!globalThis.DecompressionStream)throw Error('圧縮ライブラリに未対応です');
   const response=await fetch(new URL('../reports/'+path+'/catalogue.json.gz',import.meta.url));if(!response.ok)throw Error('停滞研究を取得できませんでした');
   const bytes=await response.arrayBuffer();if(bytes.byteLength>2097152)throw Error('研究結果が大きすぎます');
   const text=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();if(text.length>16777216)throw Error('研究結果が大きすぎます');
   const data=JSON.parse(text);if(!Array.isArray(data)||data.length>100)throw Error('研究結果の形式が不正');
   if(data.some(r=>!validateBoard(r.board).ok||!r.metrics))throw Error('研究盤面の形式が不正');
   const map=new Map(discovery.map(r=>[r.id,r]));for(const r of data)map.set(r.id,r);discovery=[...map.values()];library();say(`停滞研究${data.length}面を追加しました。${message}。すべて未認定。`);
  }catch(e){say(e.message);$(button).disabled=false;}
 };
 $('labSearch').oninput=library;
 $('labTarget').onchange=()=>{draft.target=num('labTarget');invalidateEvidence();check();};
 $('labPlay').onclick=()=>attempt(()=>{const r=recordBoard(draft,{name:current.name,seed:current.seed,algorithm:current.algorithm});play(r);});
 $('labSave').onclick=()=>attempt(()=>{
  const r=recordBoard(draft,{name:current.name,seed:current.seed,algorithm:current.algorithm});
  if(records().some(x=>definitionKey(x.board)===definitionKey(r.board)))throw Error('同じ盤面は保存済みです');
  if(saved.length>=100)throw Error('保存は100面まで。JSONで書き出せます。');
  const next=[...saved,r];localStorage.setItem(storageKey,JSON.stringify(next));saved=next;library();say('この端末に保存しました。合法性確認済み・未認定。');
 });
 $('labImport').onclick=()=>attempt(()=>load(recordBoard(parseBoardJSON($('labJSON').value),{name:'読み込み盤面'})));
 $('labExport').onclick=()=>attempt(()=>{$('labJSON').value=JSON.stringify(recordBoard(draft,{name:current.name,seed:current.seed}),null,2);say('JSONに書き出しました。');});
 $('labDownload').onclick=()=>attempt(()=>{const r=recordBoard(draft,{name:current.name,seed:current.seed}),url=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=r.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 library();load(current);
}
