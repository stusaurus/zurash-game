import {MASK_LIBRARY} from './mask-library.js';
import {EVALUATED_MASK_LIBRARY} from './evaluated-mask-library.js';
import {SHAPES,generateBoard,validateBoard,parseBoardJSON,recordBoard,definitionKey} from './board-lab.js';
export function mountLab(play) {
 const host=document.getElementById('boardLab');
 host.innerHTML=`<details><summary>盤面ラボ【研究用・未認定】</summary>
 <p>保存された盤面で遊ぶ／条件を変えて作る。公平性や決着は未認定です。</p>
 <label>盤面ライブラリ<select id="labLibrary"></select></label>
 <label>検索<input id="labSearch" placeholder="形状・名前・検証状態"></label>
 <button id="labLoad">選んだ盤面を編集・確認</button>
 <button id="labCorpus">生成済みの研究候補を追加表示</button>
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
 let saved=[],corpus=[];
 try{const text=localStorage.getItem(storageKey);if(text&&text.length<=1048576){const records=JSON.parse(text);if(Array.isArray(records))saved=records.slice(0,100).flatMap(r=>{try{return [recordBoard(r.board,{name:String(r.name).slice(0,80),seed:r.seed})];}catch{return [];}});}}catch{say('保存データを読み込めませんでした。');}
 let current=structuredClone(MASK_LIBRARY[0]),draft=structuredClone(current.board);
 function records(){return [...MASK_LIBRARY,...EVALUATED_MASK_LIBRARY,...corpus,...saved];}
 function library(){
  const filter=$('labSearch').value.toLowerCase();$('labLibrary').replaceChildren();
  records().forEach((r,index)=>{if(!`${r.name} ${r.shape??''} ${r.status}`.toLowerCase().includes(filter))return;const o=document.createElement('option');o.value=index;o.textContent=`${r.name} · ${r.board.width}×${r.board.height} · ${r.status}`;$('labLibrary').append(o);});
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
    current={...current,name:'カスタム盤面',seed:null,algorithm:'editor'};draw();check();
   };e.append(b);
  }
 }
 function check(){const v=validateBoard(draft);$('labPlay').disabled=!v.ok;$('labSave').disabled=!v.ok;say(v.ok?`合法性確認済み・未認定 · 有効${draft.playableCells.length}マス／星${draft.stars.length}／壁${draft.walls.length}／${draft.target}個先取。星取得と決着は未証明。`:v.errors.join('／'));return v;}
 function load(r){current=structuredClone(r);draft=structuredClone(r.board);for(const [id,value] of [['labWidth',draft.width],['labHeight',draft.height],['labStars',draft.stars.length],['labWalls',draft.walls.length],['labTarget',draft.target]])$(id).value=value;if(r.shape&&SHAPES[r.shape])$('labShape').value=r.shape;draw();check();if(r.metrics)say(`${r.status}・未認定 · ${r.games}局／先攻${r.metrics.first}勝・後攻${r.metrics.second}勝・未解決${r.metrics.unresolved}局。${r.traits.join('／')}`);}
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
 $('labSearch').oninput=library;
 $('labTarget').onchange=()=>{draft.target=num('labTarget');check();};
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
