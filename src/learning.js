// PR #18's browser-local opponent model, extended with match-id deduplication.
// No move logs or personal identifiers are sent to a server.
import { apply } from './engine.js';

export const LEARNING_KEY = 'zurash-learning-v1';
export const freshLearning = () => ({version:1,wins:0,losses:0,draws:0,total:0,samples:0,contexts:{},matchIds:[]});
const count = n => Number.isSafeInteger(n) && n >= 0;
const contextPattern = /^\d{1,2}x\d{1,2}:\d{1,2}:[01]$/;
const idPattern = /^[a-zA-Z0-9_-]{1,80}$/;
const maxBytes = 262144;

export function validateLearning(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.version !== 1 ||
      ![input.wins,input.losses,input.samples].every(count) || !input.contexts ||
      typeof input.contexts !== 'object' || Array.isArray(input.contexts)) throw Error('学習データの形式が不正です');
  const draws = input.draws ?? 0, total = input.total ?? input.wins + input.losses + draws;
  const matchIds = input.matchIds ?? [];
  if (!count(draws) || !count(total) || total !== input.wins + input.losses + draws ||
      !Array.isArray(matchIds) || matchIds.length > 10000 || matchIds.length > total ||
      !matchIds.every(id => typeof id === 'string' && idPattern.test(id)) || new Set(matchIds).size !== matchIds.length ||
      Object.keys(input.contexts).length > 1000) throw Error('学習データの形式が不正です');
  let samples = 0;
  const contexts = {};
  for (const [key, values] of Object.entries(input.contexts)) {
    if (!contextPattern.test(key) || !Array.isArray(values) || values.length !== 16 || !values.every(count)) throw Error('学習データの形式が不正です');
    for (const value of values) { samples += value; if (!Number.isSafeInteger(samples)) throw Error('保存上限です'); }
    contexts[key] = values.slice();
  }
  if (samples !== input.samples) throw Error('学習データの手数が一致しません');
  return {version:1,wins:input.wins,losses:input.losses,draws,total,samples,contexts,matchIds:matchIds.slice()};
}
export function learningContext(s) { return `${s.width??s.size??7}x${s.height??s.size??7}:${s.target??3}:${Number(s.scores[s.turn]===(s.target??3)-1)}`; }
export function learningFeature(s,a,n) { return a.dir*4+Number(a.wall!==null)*2+Number(n.scores[s.turn]>s.scores[s.turn]); }
export function learnWeight(model,s,a,n) { return 1+(model?.contexts?.[learningContext(s)]?.[learningFeature(s,a,n)]??0); }

// Each session is tied to one unique match ID. Discarding it never records a result.
export function openLearning(storage) {
  let model = freshLearning(), warning = '', writable = true, generation = 0;
  try {
    const text = storage.getItem(LEARNING_KEY);
    if (text) { if (text.length > maxBytes) throw Error('学習データが大きすぎます'); model = validateLearning(JSON.parse(text)); }
  } catch { warning = '保存データを読み込めません。この対戦中だけ記録します。'; writable = false; }
  const persist = () => {
    if (!writable) return;
    try {
      const text = JSON.stringify(model);
      if (text.length > maxBytes) throw Error('保存上限です');
      storage.setItem(LEARNING_KEY,text);
    } catch { warning = '端末への保存ができません。この対戦中だけ記録します。'; writable = false; }
  };
  return {
    get model() { return structuredClone(model); },
    get warning() { return warning; },
    reset() {
      model = freshLearning(); generation++;
      try { storage.removeItem(LEARNING_KEY); warning = ''; writable = true; }
      catch { warning = '端末の保存データを削除できませんでした。'; writable = false; }
      return writable;
    },
    beginMatch({id,mode,human=0}) {
      if (typeof id !== 'string' || !idPattern.test(id) || !['cpu','local'].includes(mode) || ![0,1].includes(human)) throw Error('対局設定が不正です');
      let observations = [], closed = false;
      const matchGeneration = generation;
      return {
        observe(state,action) {
          if (closed || matchGeneration !== generation || mode !== 'cpu' || !state || state.turn !== human || state.winner !== null) return false;
          try {
            const next = apply(state,action); // Never persist a move log.
            observations.push({context:learningContext(state),feature:learningFeature(state,action,next)});
            return true;
          } catch { return false; }
        },
        undo() { if (!closed) observations.pop(); },
        finish(state,{unresolved=false}={}) {
          if (closed || matchGeneration !== generation || mode !== 'cpu' || model.matchIds.includes(id)) { closed = true; return false; }
          if (!state || (state.winner !== 0 && state.winner !== 1 && !(state.winner === null && unresolved === true))) return false;
          if (model.matchIds.length >= 10000) { warning = '学習記録の上限に達しました。'; return false; }
          try {
          const next = validateLearning(model);
          for (const {context,feature} of observations) {
            const counts = next.contexts[context] ??= Array(16).fill(0);
            counts[feature]++; next.samples++;
          }
          if (state.winner === null) next.draws++;
          else if (state.winner === human) next.wins++;
          else next.losses++;
          next.total++; next.matchIds.push(id);
          model = validateLearning(next); closed = true; observations = []; persist(); return true;
          } catch { warning = '学習記録を保存できませんでした。'; return false; }
        },
        discard() { closed = true; observations = []; }
      };
    }
  };
}
