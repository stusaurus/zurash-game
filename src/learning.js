// Browser-local opponent modelling. No identifiers, move logs or network storage.
export const LEARNING_KEY='zurash-learning-v1';
export const freshLearning=()=>({version:1,wins:0,losses:0,samples:0,contexts:{}});
const count=n=>Number.isSafeInteger(n)&&n>=0;
export function validateLearning(x){if(!x||x.version!==1||![x.wins,x.losses,x.samples].every(count)||!x.contexts||typeof x.contexts!=='object'||Array.isArray(x.contexts)||Object.keys(x.contexts).length>1000)throw Error('学習データの形式を確認できません');let total=0;for(const [k,v] of Object.entries(x.contexts)){if(!/^\d{1,2}x\d{1,2}:\d{1,2}:\d$/.test(k)||!Array.isArray(v)||v.length!==16||!v.every(count))throw Error('学習データの形式が不正です');total+=v.reduce((a,b)=>a+b,0);}if(total!==x.samples)throw Error('学習データの手数が一致しません');return structuredClone(x);}
export function learningContext(s){return `${s.width??s.size??7}x${s.height??s.size??7}:${s.target??3}:${Number(s.scores[s.turn]===(s.target??3)-1)}`;}
export function learningFeature(s,a,n){return a.dir*4+Number(a.wall!==null)*2+Number(n.scores[s.turn]>s.scores[s.turn]);}
export function learnWeight(model,s,a,n){const counts=model?.contexts?.[learningContext(s)];return 1+(counts?.[learningFeature(s,a,n)]??0);}
export function learnMatch(model,observations,winner){const n=validateLearning(model);if(![0,1].includes(winner))throw Error('終局だけを記録します');for(const o of observations){if(!o)continue;if(!/^\d{1,2}x\d{1,2}:\d{1,2}:\d$/.test(o.context)||!Number.isInteger(o.feature)||o.feature<0||o.feature>15)throw Error('学習対象が不正です');const counts=n.contexts[o.context]??=Array(16).fill(0);if(counts[o.feature]>=Number.MAX_SAFE_INTEGER||n.samples>=Number.MAX_SAFE_INTEGER)throw Error('保存上限です');counts[o.feature]++;n.samples++;}if(winner===0)n.wins++;else n.losses++;return validateLearning(n);}
export function openLearning(storage){let model=freshLearning(),warning='',writable=true;try{const text=storage.getItem(LEARNING_KEY);if(text){if(text.length>262144)throw Error('学習データが大きすぎます');model=validateLearning(JSON.parse(text));}}catch{warning='保存データを読み込めません。この対戦中だけ記録します。';writable=false;}
 const persist=()=>{if(!writable)return;try{storage.setItem(LEARNING_KEY,JSON.stringify(model));}catch{warning='端末への保存ができません。この対戦中だけ記録します。';writable=false;}};
 return {get model(){return structuredClone(model);},get warning(){return warning;},finish(observations,winner){model=learnMatch(model,observations,winner);persist();},reset(){model=freshLearning();try{storage.removeItem(LEARNING_KEY);warning='';writable=true;}catch{warning='端末の保存データを削除できませんでした。';writable=false;}return writable;}};
}
