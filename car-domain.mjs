// 車遍路向けの判定・データ検証（DOMやIndexedDBに依存しない純粋関数）。
import {distanceMeters, PARKING_RADIUS} from './domain.mjs';
export {PARKING_RADIUS};
// 自分で駐車場を登録できるのは札所マーカーから3km以内・測位誤差50m以内。
export const PARKING_REGISTER_MAX_DISTANCE = 3000;
export const PARKING_REGISTER_MAX_ACCURACY = 50;

const fail = message => { throw new Error(message); };
const str = (v, max) => typeof v === 'string' && v.length <= max && !/[\u0000-\u001f]/.test(v);
const dateOK = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const latOK = v => Number.isFinite(v) && v >= 32 && v <= 35;      // 四国周辺
const lngOK = v => Number.isFinite(v) && v >= 131.5 && v <= 135.5;

export function validateCarData(data) {
  if (!data || data.format !== 'ohenro-quest-car' || data.version !== 1 || !dateOK(data.checkedAt) || !Array.isArray(data.temples)) fail('車の札所データの形式を確認できません。');
  const ids = new Set();
  for (const t of data.temples) {
    if (!t || !Number.isInteger(t.id) || t.id < 1 || t.id > 88 || ids.has(t.id)) fail('車の札所データの札所番号を確認できません。');
    ids.add(t.id);
    for (const key of ['parking', 'seasonalClosure', 'ropeway']) if (t[key] !== null && !str(t[key], 300)) fail(`第${t.id}番の車情報（${key}）を確認できません。`);
    if (t.walkToHondoMeters !== null && !(Number.isInteger(t.walkToHondoMeters) && t.walkToHondoMeters > 0 && t.walkToHondoMeters < 10000)) fail(`第${t.id}番の徒歩距離を確認できません。`);
    for (const key of ['vehicleLimits', 'roadNotes']) if (!Array.isArray(t[key]) || t[key].some(v => !str(v, 300))) fail(`第${t.id}番の車情報（${key}）を確認できません。`);
    if (!Array.isArray(t.parkingPoints) || t.parkingPoints.some(p => !p || !str(p.label, 80) || !latOK(p.lat) || !lngOK(p.lng) || !str(p.sourceUrl, 300))) fail(`第${t.id}番の駐車場座標を確認できません。`);
    if (!Array.isArray(t.sources) || !t.sources.length || t.sources.some(s => !s || !str(s.label, 120) || !/^https:\/\//.test(s.url) || !dateOK(s.checkedAt))) fail(`第${t.id}番の出典を確認できません。`);
  }
  return data;
}

export function validateUserParking(point) {
  if (!point || !Number.isInteger(point.templeId) || point.templeId < 1 || point.templeId > 88 || !latOK(point.lat) || !lngOK(point.lng) ||
      !Number.isFinite(point.accuracy) || point.accuracy < 0 || point.accuracy > PARKING_REGISTER_MAX_ACCURACY || !Number.isFinite(point.savedAt) ||
      typeof (point.note ?? '') !== 'string' || (point.note ?? '').length > 100) fail('駐車場地点の情報を確認できません。');
  return {templeId: point.templeId, lat: point.lat, lng: point.lng, accuracy: Math.round(point.accuracy), savedAt: point.savedAt, note: (point.note || '').trim()};
}

// 現在地を「この札所の駐車場」として登録してよいかを判定する。
export function assessParkingRegistration(position, temple, now = Date.now()) {
  if (!position || !latOK(position.lat) || !lngOK(position.lng) || !Number.isFinite(position.accuracy) || position.accuracy < 0 || !Number.isFinite(position.timestamp)) return {ok: false, message: '現在地を四国周辺で確認できませんでした。再測位してください。'};
  if (Math.abs(now - position.timestamp) > 60000) return {ok: false, message: '位置情報が古いため、再測位してください。'};
  if (position.accuracy > PARKING_REGISTER_MAX_ACCURACY) return {ok: false, message: `測位誤差が${PARKING_REGISTER_MAX_ACCURACY}mを超えています。空が見える場所で再測位してください。`};
  const distance = distanceMeters(position, temple);
  if (distance > PARKING_REGISTER_MAX_DISTANCE) return {ok: false, message: `札所から${(PARKING_REGISTER_MAX_DISTANCE / 1000)}km以上離れているため、この札所の駐車場として登録できません。`};
  return {ok: true, distance: Math.round(distance), accuracy: Math.round(position.accuracy)};
}

// ナビ・チェックインに使う駐車場を選ぶ。自分で登録した地点を最優先し、次に出典付きデータの座標。
export function createParkingResolver(carData, userPoints = []) {
  const byData = new Map((carData?.temples || []).filter(t => t.parkingPoints.length).map(t => [t.id, t.parkingPoints[0]]));
  const byUser = new Map(userPoints.map(p => [p.templeId, p]));
  return templeId => {
    const u = byUser.get(templeId);
    if (u) return {lat: u.lat, lng: u.lng, label: '自分で登録した駐車場', source: 'user', savedAt: u.savedAt, accuracy: u.accuracy};
    const d = byData.get(templeId);
    if (d) return {lat: d.lat, lng: d.lng, label: d.label, source: 'data', sourceUrl: d.sourceUrl};
    return null;
  };
}

export function carInfoFor(carData, templeId) {
  return carData?.temples?.find(t => t.id === templeId) || null;
}

export function parkingQuery(parking) {
  return `${parking.lat.toFixed(6)},${parking.lng.toFixed(6)}`;
}

export function exportParkings(points) {
  return JSON.stringify({format: 'ohenro-quest-parkings', version: 1, exportedAt: new Date().toISOString(), points: points.map(validateUserParking)}, null, 2);
}

export function readParkingsJSON(value) {
  if (typeof value !== 'string' || value.length > 256 * 1024) fail('駐車場地点のJSONは256KB以内にしてください。');
  let data; try { data = JSON.parse(value); } catch { fail('JSONファイルを読み込めません。'); }
  if (data?.format !== 'ohenro-quest-parkings' || data.version !== 1 || !Array.isArray(data.points) || data.points.length > 88) fail('対応する駐車場地点のバックアップではありません。');
  const points = data.points.map(validateUserParking);
  if (new Set(points.map(p => p.templeId)).size !== points.length) fail('同じ札所の駐車場地点が重複しています。');
  return points;
}
