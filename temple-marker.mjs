export function groupNearby(rows,project,cell=48){
  const groups=rows.map(t=>({rows:[t],point:project(t)}));
  // 格子の境界で近接する札所もまとめ、表示位置でアイコンが重ならないようにする。
  let changed=true;
  while(changed){changed=false;
    outer:for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
      const a=groups[i],b=groups[j];if(Math.abs(a.point[0]-b.point[0])>=cell||Math.abs(a.point[1]-b.point[1])>=cell)continue;
      const total=a.rows.length+b.rows.length;a.point=a.point.map((v,k)=>(v*a.rows.length+b.point[k]*b.rows.length)/total);a.rows.push(...b.rows);groups.splice(j,1);changed=true;break outer;
    }
  }
  return groups.map(g=>g.rows);
}
export function templeGlyph(label){
  if(!/^\d{1,2}(寺)?$/.test(String(label)))throw new Error('札所マーカーの表示を確認してください。');
  // 数字は寺院の本堂部分へ。円形ピンや鳥居と区別する。
  return `<svg class="temple-glyph" viewBox="0 0 44 48" aria-hidden="true"><path class="temple-shadow" d="M7 42h30l-15 5Z"/><path class="temple-roof" d="M22 2c-3 8-9 10-17 12l2 4h30l2-4C31 12 25 10 22 2Z"/><path class="temple-roof second" d="M22 12c-5 7-12 9-20 12l3 4h34l3-4c-8-3-15-5-20-12Z"/><rect class="temple-house" x="8" y="25" width="28" height="17" rx="3"/><path class="temple-step" d="M5 43h34"/><text class="temple-digit" x="22" y="37" text-anchor="middle">${label}</text></svg>`;
}
