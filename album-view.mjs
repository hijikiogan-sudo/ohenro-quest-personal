export function albumGroups(rows,mode='all'){
  const sorted=[...rows].filter(p=>mode!=='favorite'||p.favorite).sort((a,b)=>b.createdAt-a.createdAt||a.id.localeCompare(b.id));
  if(!['temple','date'].includes(mode))return [{key:'all',rows:sorted}];
  const groups=new Map();for(const p of sorted){const key=mode==='temple'?(p.templeId??'unassigned'):(p.date||'unknown');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}
  return [...groups].sort(([a],[b])=>mode==='temple'?(a==='unassigned'?1:b==='unassigned'?-1:a-b):(a==='unknown'?1:b==='unknown'?-1:b.localeCompare(a))).map(([key,rows])=>({key,rows}));
}
export function swipeDirection(start,end){
  if(!start||!end||start.multiple||end.multiple)return 0;
  const dx=end.x-start.x,dy=end.y-start.y;
  return Math.abs(dx)>=60&&Math.abs(dx)>Math.abs(dy)*1.5?(dx<0?1:-1):0;
}
