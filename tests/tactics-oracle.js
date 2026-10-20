// Deliberately simple independent rules implementation; no engine imports.
export function oracleChildren(s){
  if(s.winner!==null)return [];
  const size=s.size??7,deltas=[[0,-1],[1,0],[0,1],[-1,0]];
  function neighbor(cell,d){const [dx,dy]=deltas[d],x=cell%size+dx,y=Math.floor(cell/size)+dy;return x<0||y<0||x>=size||y>=size?null:y*size+x;}
  function end(players,walls,p,d){let at=players[p];for(;;){const next=neighbor(at,d);if(next===null||walls.includes(next)||next===players[1-p])return at;at=next;}}
  function mobile(players,walls,p){return deltas.some((_,d)=>end(players,walls,p,d)!==players[p]);}
  const shifts=[{wall:null,walls:[...s.walls]}];
  s.walls.forEach((from,w)=>deltas.forEach((_,d)=>{const to=neighbor(from,d);if(to!==null&&![...s.walls,...s.stars,...s.players].includes(to)){
    const walls=s.walls.map((v,i)=>i===w?to:v);
    if(mobile(s.players,walls,0)&&mobile(s.players,walls,1))shifts.push({wall:{wall:w,to},walls});
  }}));
  const out=[];
  for(const {wall,walls} of shifts)for(let dir=0;dir<4;dir++){
    const to=end(s.players,walls,s.turn,dir);if(to===s.players[s.turn])continue;
    const players=s.players.map((v,p)=>p===s.turn?to:v);
    if(!mobile(players,walls,0)||!mobile(players,walls,1))continue;
    const scored=s.stars.includes(to),scores=s.scores.map((v,p)=>v+Number(p===s.turn&&scored));
    const winner=scores[s.turn]>=(s.target??3)?s.turn:null;
    out.push({a:{wall,dir},n:{...s,walls:[...walls],players,scores,stars:s.stars.filter(v=>!scored||v!==to),winner,ply:s.ply+1,turn:winner===null?1-s.turn:s.turn}});
  }
  return out;
}
export function oracleValue(s,depth,root=s.turn){
  if(s.winner!==null)return s.winner===root?1:-1;
  if(!depth)return 0;
  const children=oracleChildren(s);if(!children.length)return 0;
  const values=children.map(({n})=>oracleValue(n,depth-1,root));
  return s.turn===root?Math.max(...values):Math.min(...values);
}
