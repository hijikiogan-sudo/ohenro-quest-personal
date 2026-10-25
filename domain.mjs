export const GPS_RADIUS = 300;
export const GPS_MAX_ACCURACY = 100;
export function japanDate(now = Date.now()) {
  return new Date(now + 9 * 3600000).toISOString().slice(0, 10);
}
export function validDate(value, now = Date.now()) {
  if (value === '' || value === null) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value && value >= '1900-01-01' && value <= japanDate(now);
}
export function distanceMeters(a, b) {
  const r = Math.PI / 180, dLat = (b.lat-a.lat)*r, dLng = (b.lng-a.lng)*r;
  const h = Math.sin(dLat/2)**2 + Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLng/2)**2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0,1-h)));
}
// チェックインは本堂（札所の位置）を中心に判定する。駐車場の位置はナビにだけ使い、判定には使わない。
export function assessGPS(position, temple, now = Date.now()) {
  if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng) ||
      position.lat < -90 || position.lat > 90 || position.lng < -180 || position.lng > 180 ||
      !Number.isFinite(position.accuracy) || position.accuracy < 0 || !Number.isFinite(position.timestamp)) {
    return {ok:false, message:'位置情報が正しくありません。再測位してください。'};
  }
  if (Math.abs(now - position.timestamp) > 60000) return {ok:false, message:'位置情報が古いため、再測位してください。'};
  if (position.accuracy > GPS_MAX_ACCURACY) return {ok:false, message:'測位誤差が100mを超えています。空が見える場所で再測位するか、手動登録してください。'};
  const distance = distanceMeters(position, temple);
  if (distance + position.accuracy > GPS_RADIUS) return {ok:false, message:'誤差を含めて札所から300m以内と確認できません。本堂に近づいて再測位するか、手動登録してください。'};
  return {ok:true, distance:Math.round(distance), accuracy:Math.round(position.accuracy), trust:'gps-self-reported'};
}
export function progress(temples, visits) {
  const unique = new Set(visits.map(v=>v.templeId));
  const count = temples.filter(t=>unique.has(t.id)).length;
  const xp = count * 100;
  const badges = [];
  if (count >= 1) badges.push('はじめの一歩');
  if (count >= 10) badges.push('十寺巡礼');
  for (const pref of ['徳島県','高知県','愛媛県','香川県']) {
    const all = temples.filter(t=>t.prefecture===pref);
    if (all.length && all.every(t=>unique.has(t.id))) badges.push(pref.slice(0,-1)+'踏破');
  }
  if (count===88) badges.push('結願');
  return {count, xp, level:1+Math.floor(xp/500), percent:Math.round(count/88*100), badges,
    title: count===88 ? '結願の旅人' : count>=40 ? '巡礼の達人' : count>=10 ? '巡礼の旅人' : 'はじまりの旅人'};
}
export function routeUrl(temple, provider='google', parking=null) {
  // 駐車場の座標が分かる札所は駐車場へ案内する。分からない札所は、本堂の座標を駐車場入口と誤認させないよう名称と住所で地図アプリに渡す。
  const destination = parking && Number.isFinite(parking.lat) && Number.isFinite(parking.lng) ? `${parking.lat.toFixed(6)},${parking.lng.toFixed(6)}` : `${temple.name} ${temple.address}`;
  if (provider === 'apple') return `https://maps.apple.com/?${new URLSearchParams({daddr:destination,dirflg:'d'})}`;
  return `https://www.google.com/maps/dir/?${new URLSearchParams({api:'1',destination,travelmode:'driving'})}`;
}
