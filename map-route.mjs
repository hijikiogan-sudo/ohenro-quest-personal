// 地図の種類と、予定のルート表示に使う純粋関数。

// 地図の種類：全体図（SVG・オフライン可）／地図（国土地理院 淡色・標準）／写真（国土地理院 写真）。
export const MAP_KINDS = ['overview', 'pale', 'std', 'photo'];
// 旧バージョンの保存値を新しい種類に読み替える（冒険の地図は全体図へ、OpenStreetMapは標準地図へ）。
const LEGACY = {quest: 'overview', plain: 'overview', road: 'std'};
export function readMapKind(storage, key) {
  try { const saved = storage?.getItem(key); if (MAP_KINDS.includes(saved)) return saved; if (LEGACY[saved]) return LEGACY[saved]; } catch {}
  return 'overview';
}
export const isTileKind = kind => kind === 'pale' || kind === 'std' || kind === 'photo';

// 国土地理院タイル。写真は「全国最新写真（シームレス）」のズーム14〜18だけを使い、それより広い範囲は淡色地図を表示する。
export const GSI = {
  pale: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',
  std: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
  photo: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
  photoMinZoom: 14,
};

// 予定（またはその日の巡礼）の札所を、めぐる順に番号付きの点にする。status は visited / skipped / pending / next。
export function routePoints(stops, temples, done = new Set()) {
  let nextMarked = false;
  return stops.map((s, i) => {
    const t = temples.find(t => t.id === s.templeId);
    if (!t) return null;
    let status = s.status || (done.has(t.id) ? 'visited' : 'pending');
    if (status === 'pending' && !nextMarked) { status = 'next'; nextMarked = true; }
    return {order: i + 1, templeId: t.id, name: t.name, lat: t.lat, lng: t.lng, status};
  }).filter(Boolean);
}

// 順番が行ったり来たりしているか（直線距離の合計が、近い順に並べ替えた場合より大きく長いか）の目安。
export function routeZigzag(points, distance) {
  if (points.length < 3) return false;
  const total = points.slice(1).reduce((n, p, i) => n + distance(points[i], p), 0);
  const rest = [...points.slice(1)], order = [points[0]];
  while (rest.length) { const last = order.at(-1); rest.sort((a, b) => distance(last, a) - distance(last, b)); order.push(rest.shift()); }
  const greedy = order.slice(1).reduce((n, p, i) => n + distance(order[i], p), 0);
  return total > greedy * 1.3 && total - greedy > 10000;
}

// 画面上で近すぎる番号札を、重ならないよう少しずつ右へずらす（px単位の座標を受け取り、ずらし量を返す）。
export function spreadBadges(points, min = 22) {
  const placed = [];
  return points.map(([x, y]) => {
    let dx = 0;
    while (placed.some(([px, py]) => Math.abs(px - (x + dx)) < min && Math.abs(py - y) < min)) dx += min;
    placed.push([x + dx, y]);
    return dx;
  });
}

// 道場の色分けのときは、同じ道場の札所どうしだけをまとめる（混ざると色が付けられないため）。
export function groupByKey(rows, keyOf, group) {
  const keys = [...new Set(rows.map(keyOf))];
  return keys.flatMap(k => group(rows.filter(r => keyOf(r) === k)));
}

// 現在地から近い未訪問の札所（直線距離の近い順）。
export function nearestUnvisited(position, temples, done, distance, n = 3) {
  return temples.filter(t => !done.has(t.id)).map(t => ({temple: t, meters: distance(position, t)})).sort((a, b) => a.meters - b.meters).slice(0, n);
}
