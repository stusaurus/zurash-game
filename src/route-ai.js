// Experimental until paired holdout testing demonstrates an improvement.
import {DIRS,step,slideOptions,mobility,successors,distances,key} from './engine.js';

// Exact next-turn star reachability, including at most one legal wall shift.
// A sliding player can only collect stars on its current row or column.
export function captureRoutes(s,p) {
  if(s.winner!==null)return new Map();
  const at=s.players[p], routes=new Map(), base={...s,turn:p};
  const valid=(star,dir,wall)=>{
    let n=base;
    if(wall){
      if(s.walls.includes(wall.to)||s.stars.includes(wall.to)||s.players.includes(wall.to))return false;
      n={...base,walls:s.walls.map((v,i)=>i===wall.wall?wall.to:v)};
      if(!mobility(n,0).length||!mobility(n,1).length)return false;
    }
    if(slideOptions(n).some(m=>m.dir===dir&&m.to===star)){
      routes.set(star,{wall,dir});return true;
    }
    return false;
  };
  for(const star of s.stars){
    const dx=star%7-at%7,dy=Math.floor(star/7)-Math.floor(at/7);
    if(dx&&dy)continue;
    const dir=dx>0?1:dx<0?3:dy>0?2:0;
    let blocked=false;const walls=[];
    for(let cell=step(at,dir);cell!==star;cell=step(cell,dir)){
      if(cell===null){blocked=true;break;}
      if(cell===s.players[1-p]){blocked=true;break;}
      const w=s.walls.indexOf(cell);if(w!==-1)walls.push(w);
    }
    if(blocked||walls.length>1)continue;
    if(valid(star,dir,null))continue;
    const support=step(star,dir);
    let candidates=[];
    if(walls.length===1){
      const w=walls[0];
      candidates=DIRS.flatMap((_,d)=>{const to=step(s.walls[w],d);return to===null?[]:[{wall:w,to}];});
    }else if(support!==null&&!s.walls.includes(support)&&support!==s.players[1-p]){
      // With a clear path, an unblocked star needs a wall immediately beyond it.
      candidates=s.walls.flatMap((from,w)=>DIRS.some((_,d)=>step(from,d)===support)?[{wall:w,to:support}]:[]);
    }else{
      // The stopping point exists, but collecting would trap the opponent.
      // A wall away from our path can reopen their escape, so check all shifts.
      candidates=s.walls.flatMap((from,w)=>DIRS.flatMap((_,d)=>{const to=step(from,d);return to===null?[]:[{wall:w,to}];}));
    }
    for(const wall of candidates)if(valid(star,dir,wall))break;
  }
  return routes;
}
const progressKey=s=>JSON.stringify([s.stars.slice().sort((a,b)=>a-b),s.players,s.scores,s.turn]);
export function chooseRoute(s,{rng=Math.random,seen=new Map(),progress=false,variety=0}={}){
  const p=s.turn,cache=new Map(),progressSeen=new Map();
  if(progress)for(const [k,count] of seen){
    const [,stars,players,scores,turn]=JSON.parse(k),compact=JSON.stringify([stars,players,scores,turn]);
    progressSeen.set(compact,(progressSeen.get(compact)||0)+count);
  }
  function value(n){
    if(n.winner!==null)return n.winner===p?100000:-100000;
    const k=key(n);if(cache.has(k))return cache.get(k);
    const a=distances(n,p),b=distances(n,1-p),ra=captureRoutes(n,p),rb=captureRoutes(n,1-p);
    let score=(n.scores[p]-n.scores[1-p])*700;
    for(const star of n.stars){
      const da=ra.has(star)?1:Math.min(8,a[star]),db=rb.has(star)?1:Math.min(8,b[star]);
      score+=(db-da)*12;
    }
    score+=ra.size*100-rb.size*100;
    // After the opponent's reply it is our turn: an exact next-turn win is
    // far more informative than a fixed-wall distance estimate.
    if(n.turn===p&&n.scores[p]===2&&ra.size)score+=20000;
    if(n.turn!==p&&n.scores[1-p]===2&&rb.size)score-=20000;
    cache.set(k,score);return score;
  }
  const penalty=n=>(seen.get(key(n))||0)*130+(progress?Math.min(4,progressSeen.get(progressKey(n))||0)*55:0);
  let ranked=successors(s).map(c=>({...c,score:value(c.n)-penalty(c.n),tie:rng()})).sort((a,b)=>b.score-a.score||a.tie-b.tie);
  if(!ranked.length)return null;
  const win=ranked.find(c=>c.n.winner===p);if(win)return win.a;
  if(s.scores[1-p]===2){const safe=ranked.filter(c=>!captureRoutes(c.n,1-p).size);if(safe.length)ranked=safe;}
  let best=-Infinity,pick=ranked[0].a;
  const alternatives=[];
  for(const c of ranked.slice(0,12)){
    let worst=Infinity,complete=true;
    for(const r of successors(c.n)){
      worst=Math.min(worst,value(r.n));
      const bound=worst*.95+c.score*.05-penalty(c.n);
      if(variety ? bound<best-variety : bound<=best){complete=false;break;}
    }
    const score=worst*.95+c.score*.05-penalty(c.n);
    if(complete)alternatives.push({a:c.a,score});
    if(score>best){best=score;pick=c.a;}
  }
  if(variety){const near=alternatives.filter(c=>c.score>=best-variety);if(near.length)return near[Math.floor(rng()*near.length)].a;}
  return pick;
}
