// 札所詳細の「札所のまわり」：札所の位置・登録した駐車場・チェックインできる範囲（札所の位置から300m）。
import {loadLeaflet} from './leaflet-loader.mjs';
import {GSI} from './map-route.mjs';
import {distanceMeters, GPS_RADIUS} from './domain.mjs';

// 駐車場からチェックイン範囲までの目安（直線距離）。
export function parkingWalkNote(temple, parking) {
  if (!parking) return '駐車場の位置を登録すると、ここに駐車場とチェックイン範囲の関係を表示します。';
  const d = Math.round(distanceMeters(parking, temple));
  if (d <= GPS_RADIUS) return `${parking.label}は札所の位置から約${d}mで、チェックインできる範囲（${GPS_RADIUS}m）の中です。本堂の近くでチェックインしてください。`;
  return `${parking.label}は札所の位置から約${d}m（直線）です。チェックインできる範囲（${GPS_RADIUS}m）までは、駐車場から約${d - GPS_RADIUS}m先です。`;
}

export function createMiniMap({document = globalThis.document, window = globalThis.window, navigator = globalThis.navigator} = {}) {
  let map = null;
  function destroy() { if (map) { map.remove(); map = null; } }
  async function render(container, temple, parking, kind = 'pale') {
    destroy();
    if (!container) return;
    const note = container.querySelector('.mini-map-note'), box = container.querySelector('.mini-map');
    if (note) note.textContent = parkingWalkNote(temple, parking);
    container.querySelectorAll('[data-mini-kind]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.miniKind === kind)));
    if (navigator.onLine === false) { box.hidden = true; container.querySelector('.mini-map-offline').hidden = false; return; }
    try {
      const L = await loadLeaflet(document, window);
      if (!box.isConnected) return;
      map = L.map(box, {zoomControl: false, attributionControl: true, scrollWheelZoom: false, minZoom: 12, maxZoom: 18});
      map.attributionControl.setPrefix(false);
      L.control.zoom({zoomInTitle: '拡大', zoomOutTitle: '縮小'}).addTo(map);
      const credit = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>';
      L.tileLayer(kind === 'photo' ? GSI.photo : GSI.pale, {minZoom: 12, maxZoom: 18, attribution: credit}).addTo(map);
      if (kind === 'photo') L.tileLayer(GSI.pale, {minZoom: 12, maxZoom: GSI.photoMinZoom - 1, attribution: ''}).addTo(map).bringToBack();
      const center = [temple.lat, temple.lng];
      L.circle(center, {radius: GPS_RADIUS, className: 'checkin-circle', interactive: false}).addTo(map);
      L.marker(center, {interactive: false, icon: L.divIcon({className: 'mini-pin mini-temple', html: '<span>札所</span>', iconSize: [44, 24], iconAnchor: [22, 12]})}).addTo(map);
      const pts = [center];
      if (parking) {
        const p = [parking.lat, parking.lng]; pts.push(p);
        L.polyline([p, center], {className: 'mini-walk', interactive: false}).addTo(map);
        L.marker(p, {interactive: false, icon: L.divIcon({className: 'mini-pin mini-parking', html: '<span>P</span>', iconSize: [26, 26], iconAnchor: [13, 13]})}).addTo(map);
      }
      const bounds = L.latLng(center).toBounds(GPS_RADIUS * 2.4);
      for (const p of pts) bounds.extend(p);
      map.fitBounds(bounds, {padding: [16, 16], maxZoom: 17, animate: false});
      setTimeout(() => map && map.invalidateSize(), 60);
    } catch (e) { box.hidden = true; const off = container.querySelector('.mini-map-offline'); off.hidden = false; off.textContent = e.message; }
  }
  return {render, destroy};
}
