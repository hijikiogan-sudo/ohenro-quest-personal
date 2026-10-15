// 海岸線と札所の座標は既存データを使う。森・山・船は案内に使わない装飾。
export const MAP_STYLES=['quest','plain','pale','road'];
export function readMapStyle(storage,key){
  try{const saved=storage?.getItem(key);if(MAP_STYLES.includes(saved))return saved;}catch{}
  return 'quest';
}
export function questTerrain(coast,project){
  const outline=coast.geometry.coordinates.map(polygon=>polygon.map(ring=>ring.map((p,i)=>{
    const [x,y]=project(p);return `${i?'L':'M'}${Math.round(x/2)*2},${Math.round(y/2)*2}`;
  }).join('')+'Z').join('')).join('');
  return `<defs>
    <pattern id="quest-sea" width="36" height="28" patternUnits="userSpaceOnUse"><rect width="36" height="28" fill="#73cddd"/><path d="M2 8h9v2H2zM20 22h10v2H20z" fill="#b8edf0"/><path d="M13 12h9v2h-9z" fill="#58bccc"/></pattern>
    <pattern id="quest-grass" width="84" height="72" patternUnits="userSpaceOnUse"><rect width="84" height="72" fill="#b4d778"/><path d="M5 9h2v-3h2v3h2v2H5zM52 39h2v-3h2v3h2v2h-6zM32 64h2v-3h2v3h2v2h-6z" fill="#77ae5e"/><path d="M20 21h3v2h-3zM70 61h3v2h-3zM44 12h3v2h-3z" fill="#e4eeaa"/></pattern>
    <pattern id="quest-woods" width="104" height="90" patternUnits="userSpaceOnUse"><g transform="translate(12 24)"><path d="M7 0h6v4h4v5h4v6h-6v5H5v-5H0V9h4V4h3z" fill="#3f8261"/><path d="M7 4h5v4h4v4H5V8h2z" fill="#69ac70"/><path d="M9 19h4v6H9z" fill="#987c4c"/></g><g transform="translate(38 19)"><path d="M7 0h6v4h4v5h4v6h-6v5H5v-5H0V9h4V4h3z" fill="#4e9165"/><path d="M9 19h4v6H9z" fill="#987c4c"/></g><g transform="translate(66 53)"><path d="M8 0h6v5h4v5h4v5h4v6H0v-6h4v-5h4z" fill="#9b9869"/><path d="M8 0h6v5h4v5H4V5h4z" fill="#fff1c9"/><path d="M16 11h3v5h4v5H12v-5h4z" fill="#787f5c"/></g></pattern>
    <clipPath id="quest-land-clip"><path d="${outline}" clip-rule="evenodd"/></clipPath>
  </defs><g class="quest-terrain" aria-hidden="true" pointer-events="none" shape-rendering="crispEdges">
    <rect x="-3000" y="-3000" width="6000" height="6000" fill="url(#quest-sea)"/>
    <path d="${outline}" fill="#7dbda4" stroke="#5bb6bd" stroke-width="16" stroke-linejoin="round"/>
    <path d="${outline}" fill="url(#quest-grass)" fill-rule="evenodd" stroke="#f3dda0" stroke-width="6" stroke-linejoin="round"/>
    <g clip-path="url(#quest-land-clip)"><rect x="-3000" y="-3000" width="6000" height="6000" fill="url(#quest-woods)"/></g>
    <g transform="translate(584 340)"><path d="M0 14h34v4h-4v4H6v-4H0z" fill="#9c7755"/><path d="M14-11h3v25h-3z" fill="#76593f"/><path d="M11-7H7v5H3v5H0v6h11zM20-6v15h10V5h-4V0h-3v-6z" fill="#fff4d4"/><path d="M-6 27h22v2H-6zM23 23h16v2H23z" fill="#c3f0ed"/></g>
  </g>`;
}

export function questTempleGlyph(label){
  if(!/^\d{1,2}(寺)?$/.test(String(label)))throw new Error('札所マーカーの表示を確認してください。');
  return `<svg class="temple-glyph quest-glyph" width="44" height="48" viewBox="0 0 44 48" aria-hidden="true"><g shape-rendering="crispEdges"><path class="quest-pin-shadow" d="M4 42h36v4H4z"/><path class="quest-roof" d="M19 2h6v4h5v4h6v4h5v5H3v-5h5v-4h6V6h5z"/><path class="quest-roof-light" d="M19 7h6v4h6v4H13v-4h6z"/><path class="quest-house" d="M7 23h30v19H7z"/><path class="quest-eaves" d="M18 15h8v4h8v3h8v5H2v-5h8v-3h8z"/><path class="quest-step" d="M4 42h36v3H4z"/></g><text class="quest-digit" x="22" y="39" text-anchor="middle">${label}</text></svg>`;
}
