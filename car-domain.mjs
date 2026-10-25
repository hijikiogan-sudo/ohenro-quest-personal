// 車遍路向けの判定・データ検証（DOMやIndexedDBに依存しない純粋関数）。
import {distanceMeters} from './domain.mjs';
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
    validateClosure(t.closure ?? null);
    if (t.blockedVehicles !== undefined && (!Array.isArray(t.blockedVehicles) || t.blockedVehicles.some(v => !['kei', 'standard', 'large', 'micro', 'bus'].includes(v)))) fail(`第${t.id}番の通行できない車種を確認できません。`);
    if (t.costs !== undefined && (!Array.isArray(t.costs) || t.costs.some(v => !str(v, 120)))) fail(`第${t.id}番の費用の情報を確認できません。`);
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
export function createParkingResolver(carData, userPoints = [], sharedPacks = []) {
  const byData = new Map((carData?.temples || []).filter(t => t.parkingPoints.length).map(t => [t.id, t.parkingPoints[0]]));
  const byUser = new Map(userPoints.map(p => [p.templeId, p]));
  const byShared = new Map();
  for (const pack of [...sharedPacks].sort((a, b) => b.importedAt - a.importedAt)) for (const p of pack.points) if (!byShared.has(p.templeId)) byShared.set(p.templeId, {...p, from: pack.name});
  return templeId => {
    const u = byUser.get(templeId);
    if (u) return {lat: u.lat, lng: u.lng, label: '自分で登録した駐車場', source: 'user', savedAt: u.savedAt, accuracy: u.accuracy};
    const d = byData.get(templeId);
    if (d) return {lat: d.lat, lng: d.lng, label: d.label, source: 'data', sourceUrl: d.sourceUrl};
    const sh = byShared.get(templeId);
    if (sh) return {lat: sh.lat, lng: sh.lng, label: `${sh.from}さんが共有した駐車場`, source: 'shared', savedAt: sh.savedAt, accuracy: sh.accuracy};
    return null;
  };
}

export function carInfoFor(carData, templeId) {
  return carData?.temples?.find(t => t.id === templeId) || null;
}

export function parkingQuery(parking) {
  return `${parking.lat.toFixed(6)},${parking.lng.toFixed(6)}`;
}

export function exportParkings(points, ratings = [], memos = []) {
  return JSON.stringify({format: 'ohenro-quest-parkings', version: 3, exportedAt: new Date().toISOString(), points: points.map(validateUserParking), ratings: ratings.map(validateRating), memos: memos.map(validateMemo)}, null, 2);
}

export function readParkingsJSON(value) {
  if (typeof value !== 'string' || value.length > 256 * 1024) fail('駐車場地点のJSONは256KB以内にしてください。');
  let data; try { data = JSON.parse(value); } catch { fail('JSONファイルを読み込めません。'); }
  if (data?.format !== 'ohenro-quest-parkings' || ![1, 2, 3].includes(data.version) || !Array.isArray(data.points) || data.points.length > 88 || (data.version >= 2 && (!Array.isArray(data.ratings) || data.ratings.length > 88)) || (data.version === 3 && (!Array.isArray(data.memos) || data.memos.length > 5000))) fail('対応する駐車場地点のバックアップではありません。');
  const points = data.points.map(validateUserParking);
  if (new Set(points.map(p => p.templeId)).size !== points.length) fail('同じ札所の駐車場地点が重複しています。');
  const ratings = data.version >= 2 ? data.ratings.map(validateRating) : [];
  if (new Set(ratings.map(r => r.templeId)).size !== ratings.length) fail('同じ札所の評価が重複しています。');
  const memos = data.version === 3 ? data.memos.map(validateMemo) : [];
  if (new Set(memos.map(m => m.id)).size !== memos.length) fail('車メモのIDが重複しています。');
  return {points, ratings, memos};
}

// ---- STEP 2：注意表示・季節・車のサイズ・自分の評価 ----

export const VEHICLES = [
  {id: 'kei', label: '軽自動車'},
  {id: 'standard', label: '普通車'},
  {id: 'large', label: 'ミニバン・大きめの乗用車'},
  {id: 'micro', label: 'マイクロバス'},
  {id: 'bus', label: '大型バス'},
];
export const vehicleLabel = id => VEHICLES.find(v => v.id === id)?.label || '普通車';

// 自分の評価（現地で走ってみた感覚）。公式の格付けではない。
export const RATINGS = [
  {level: 0, label: 'ふつう', note: '離合や駐車に困らなかった'},
  {level: 1, label: 'やや注意', note: '一部すれ違いに気を使う・急坂・駐車場が混む'},
  {level: 2, label: '注意', note: '離合が難しい区間が続く・駐車場から長い登り'},
  {level: 3, label: '難所', note: '運転に慣れていないと厳しい・事前確認が必須'},
];
export const ratingLabel = level => RATINGS.find(r => r.level === level)?.label || '';

export function validateRating(r) {
  if (!r || !Number.isInteger(r.templeId) || r.templeId < 1 || r.templeId > 88 || !Number.isInteger(r.level) || r.level < 0 || r.level > 3 || !Number.isFinite(r.savedAt)) fail('自分の評価を確認できません。');
  return {templeId: r.templeId, level: r.level, savedAt: r.savedAt};
}

const mmdd = v => typeof v === 'string' && /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v);
export function validateClosure(c) {
  if (c === null) return null;
  if (!c || !mmdd(c.from) || !mmdd(c.to) || typeof c.approximate !== 'boolean') fail('季節の通行止めの期間を確認できません。');
  return c;
}

// date（YYYY-MM-DD）が閉鎖期間に入るか。年をまたぐ期間（12月〜2月など）に対応。
export function closureHit(closure, date) {
  if (!closure || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = date.slice(5);
  return closure.from <= closure.to ? (d >= closure.from && d <= closure.to) : (d >= closure.from || d <= closure.to);
}

export function vehicleBlocked(info, vehicleId) {
  return !!info && Array.isArray(info.blockedVehicles) && info.blockedVehicles.includes(vehicleId);
}

// 一覧・地図・予定に出す短いラベル。level: warn は事前確認が必要、info は知っておくと便利。
export function carFlags(info, {rating = null, vehicle = 'standard'} = {}) {
  const flags = [];
  if (rating !== null && rating !== undefined) flags.push({key: 'rating', label: `自分の評価：${ratingLabel(rating)}`, level: rating >= 2 ? 'warn' : 'info'});
  if (!info) return flags;
  if (info.closure || info.seasonalClosure) flags.push({key: 'closure', label: '冬期通行止めあり', level: 'warn'});
  if (vehicleBlocked(info, vehicle)) flags.push({key: 'vehicle', label: `${vehicleLabel(vehicle)}は通行不可`, level: 'warn'});
  else if (info.vehicleLimits?.length) flags.push({key: 'limits', label: '車両の制限あり', level: 'info'});
  if (info.ropeway) flags.push({key: 'ropeway', label: 'ロープウェイ', level: 'warn'});
  if (info.walkToHondoMeters >= 300) flags.push({key: 'walk', label: `駐車場から約${info.walkToHondoMeters}m`, level: 'info'});
  if (info.costs?.length) flags.push({key: 'cost', label: '費用がかかる', level: 'info'});
  return flags;
}

export const hasWarn = flags => flags.some(f => f.level === 'warn');

// 行き先予定の注意。date は出発予定日（YYYY-MM-DD、未設定なら空文字）。
export function planWarnings({stops, date = '', carData, ratings = new Map(), vehicle = 'standard', temples = []}) {
  const name = id => { const t = temples.find(t => t.id === id); return `第${id}番 ${t?.name || ''}`; };
  const items = [];
  let needsDate = false;
  const costs = [];
  for (const s of stops) {
    const info = carInfoFor(carData, s.templeId), messages = [];
    if (info) {
      if (info.closure) {
        if (!date) needsDate = true;
        else if (closureHit(info.closure, date)) messages.push({level: 'warn', text: `出発予定日（${date}）は通行止めの期間に当たる${info.closure.approximate ? '可能性があります' : 'ため、車で近づけません'}。${info.seasonalClosure || ''}`});
      }
      if (vehicleBlocked(info, vehicle)) messages.push({level: 'warn', text: `設定中の車（${vehicleLabel(vehicle)}）は通行できないと案内されています。`});
      if (info.ropeway) messages.push({level: 'warn', text: `車はロープウェイ乗り場まで。運行時間・運休日を公式案内で確認し、乗車と山上での参拝に時間の余裕を。`});
      if (info.walkToHondoMeters >= 300) messages.push({level: 'info', text: `駐車場から本堂まで約${info.walkToHondoMeters}m歩きます。参拝時間に含めてください。`});
      if (info.costs?.length) costs.push(...info.costs.map(c => `${name(s.templeId)}：${c}`));
    }
    const r = ratings.get(s.templeId);
    if (r !== undefined && r >= 2) messages.push({level: 'warn', text: `自分の評価は「${ratingLabel(r)}」です。時間と体力に余裕のある順番に。`});
    if (messages.length) items.push({templeId: s.templeId, name: name(s.templeId), messages});
  }
  return {items, needsDate, costs, warnCount: items.reduce((n, i) => n + i.messages.filter(m => m.level === 'warn').length, 0)};
}

// ---- STEP 3：車メモ（現地で数タップ記録） ----

export const MEMO_FIELDS = [
  {key: 'road', label: '道幅', options: [['wide', '広い・困らない'], ['some', '一部せまい'], ['narrow', 'せまい区間が続く']]},
  {key: 'passing', label: '対向車とのすれ違い', options: [['0', 'なし'], ['1-2', '1〜2回'], ['3-5', '3〜5回'], ['6+', '6回以上']]},
  {key: 'reverse', label: 'バックで譲った', options: [['no', 'なし'], ['yes', 'あり']]},
  {key: 'parking', label: '駐車場の混み具合', options: [['empty', '空いていた'], ['some', 'やや混雑'], ['full', '満車・待ち']]},
  {key: 'toilet', label: '駐車場付近のトイレ', options: [['yes', 'あった'], ['no', '見当たらない']]},
];
const memoValue = (key, v) => v === null || MEMO_FIELDS.find(f => f.key === key).options.some(([id]) => id === v);
const optionLabel = (key, v) => MEMO_FIELDS.find(f => f.key === key)?.options.find(([id]) => id === v)?.[1] || '';

export function validateMemo(m) {
  if (!m || typeof m.id !== 'string' || !m.id || m.id.length > 100 || !Number.isInteger(m.templeId) || m.templeId < 1 || m.templeId > 88 ||
      typeof m.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(m.date) || !Number.isFinite(m.savedAt) ||
      typeof (m.note ?? '') !== 'string' || (m.note ?? '').length > 200) fail('車メモの形式を確認できません。');
  const out = {id: m.id, templeId: m.templeId, date: m.date, savedAt: m.savedAt, note: (m.note || '').trim()};
  for (const f of MEMO_FIELDS) {
    const v = m[f.key] ?? null;
    if (!memoValue(f.key, v)) fail(`車メモの「${f.label}」を確認できません。`);
    out[f.key] = v;
  }
  if (MEMO_FIELDS.every(f => out[f.key] === null) && !out.note) fail('車メモに1つ以上入力してください。');
  return out;
}

export const memoText = m => MEMO_FIELDS.filter(f => m[f.key] !== null).map(f => `${f.label}：${optionLabel(f.key, m[f.key])}`);

// 記録から自分の評価の目安を出す（自動では設定しない）。
export function suggestRating(memos) {
  if (!memos.length) return null;
  let level = 0;
  const reasons = [];
  for (const m of memos) {
    if (m.road === 'narrow') { level = Math.max(level, 2); reasons.push('せまい区間が続く'); }
    else if (m.road === 'some') { level = Math.max(level, 1); reasons.push('一部せまい'); }
    if (m.passing === '6+') { level = Math.max(level, 3); reasons.push('すれ違い6回以上'); }
    else if (m.passing === '3-5') { level = Math.max(level, 2); reasons.push('すれ違い3〜5回'); }
    else if (m.passing === '1-2') { level = Math.max(level, 1); }
    if (m.reverse === 'yes') { level = Math.max(level, 2); reasons.push('バックで譲った'); }
    if (m.parking === 'full') { level = Math.max(level, 1); reasons.push('駐車場が満車'); }
  }
  return {level, reasons: [...new Set(reasons)]};
}

// ---- STEP 4：移動時間の目安（無料・端末内計算）と共有ファイル ----

// 霊場会「お遍路の心得」：お納経は基本的に午前8時から午後5時まで。
export const NOKYO_OPEN = 8 * 60, NOKYO_CLOSE = 17 * 60;
// 直線距離に掛ける道のりの係数と平均速度。実測ではなく目安（山道・市街地で大きく変わる）。
export const ROAD_FACTOR = 1.4;
export const SPEEDS = [{id: 'slow', label: 'ゆっくり（時速30km）', kmh: 30}, {id: 'normal', label: 'ふつう（時速35km）', kmh: 35}, {id: 'fast', label: '早め（時速40km）', kmh: 40}];
export const speedOf = id => SPEEDS.find(s => s.id === id) || SPEEDS[1];

export function estimateLeg(from, to, kmh = 35) {
  const straightKm = distanceMeters(from, to) / 1000, roadKm = straightKm * ROAD_FACTOR;
  return {straightKm, roadKm, minutes: Math.max(5, Math.round(roadKm / kmh * 60 / 5) * 5)};
}

const hm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const formatMinutes = m => m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ''}` : `${m}分`;

// 自分のGPSチェックインから、同じ日に続けて記録した2札所の間隔（参拝＋移動）を集める。
export function legHistory(visits) {
  const gps = visits.filter(v => v.method === 'gps-self-reported' && !v.deletedAt && v.date && Number.isFinite(v.createdAt)).sort((a, b) => a.createdAt - b.createdAt);
  const map = new Map();
  for (let i = 1; i < gps.length; i++) {
    const a = gps[i - 1], b = gps[i];
    if (a.date !== b.date || a.journeyId !== b.journeyId || a.templeId === b.templeId) continue;
    const minutes = Math.round((b.createdAt - a.createdAt) / 60000);
    if (minutes < 1 || minutes > 600) continue;
    const key = `${a.templeId}-${b.templeId}`;
    map.set(key, [...(map.get(key) || []), {minutes, date: b.date}]);
  }
  return map;
}

// 予定の時間割（目安）。札所の位置は駐車場があれば駐車場、なければ地図上の札所マーカー。
export function planSchedule({stops, departAt = '', temples, parkingFor = () => null, origin = null, returnTo = null, kmh = 35, history = new Map()}) {
  const point = id => { const p = parkingFor(id); if (p) return p; const t = temples.find(t => t.id === id); return t ? {lat: t.lat, lng: t.lng} : null; };
  const endPoint = e => e?.kind === 'temple' ? point(e.templeId) : null;
  const start = departAt && /T\d{2}:\d{2}$/.test(departAt) ? Number(departAt.slice(11, 13)) * 60 + Number(departAt.slice(14, 16)) : null;
  let clock = start, prev = endPoint(origin), prevId = origin?.kind === 'temple' ? origin.templeId : null, driveTotal = 0, kmTotal = 0, unknownFirst = false;
  const rows = [];
  stops.forEach((s, i) => {
    const here = point(s.templeId);
    let leg = null;
    if (prev && here) { leg = estimateLeg(prev, here, kmh); driveTotal += leg.minutes; kmTotal += leg.roadKm; }
    else if (i === 0) unknownFirst = true;
    const past = prevId ? history.get(`${prevId}-${s.templeId}`) || [] : [];
    // 自分の実績があれば、実績（前の札所の参拝込み）から予定の参拝時間を引いた値を移動時間に使う。
    if (leg && past.length && i > 0) { const drive = past.at(-1).minutes - stops[i - 1].minutes; if (drive >= 5) { driveTotal += drive - leg.minutes; leg = {...leg, minutes: Math.round(drive / 5) * 5, fromHistory: true}; } }
    if (clock !== null && leg) clock += leg.minutes;
    const arrive = clock, leave = clock === null ? null : clock + s.minutes;
    const outside = arrive !== null && (arrive < NOKYO_OPEN || arrive + Math.min(s.minutes, 15) > NOKYO_CLOSE);
    rows.push({templeId: s.templeId, leg, arrive, leave, arriveText: arrive === null ? '' : hm(arrive), leaveText: leave === null ? '' : hm(leave), outside, past});
    if (clock !== null) clock = leave;
    prev = here; prevId = s.templeId;
  });
  let back = null;
  const end = endPoint(returnTo);
  if (end && prev) { back = estimateLeg(prev, end, kmh); driveTotal += back.minutes; kmTotal += back.roadKm; if (clock !== null) clock += back.minutes; }
  return {rows, back, driveMinutes: driveTotal, roadKm: Math.round(kmTotal), prayerMinutes: stops.reduce((n, s) => n + s.minutes, 0), finishText: clock === null ? '' : hm(clock), overnight: clock !== null && clock >= 24 * 60, unknownFirst, outsideCount: rows.filter(r => r.outside).length};
}

// 共有ファイル（サーバーなし。LINEやAirDropで渡す）。
const nameOK = v => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 30 && !/[\u0000-\u001f]/.test(v);
export function exportSharePack({name, memos = [], ratings = [], points = []}) {
  if (!nameOK(name)) fail('共有する名前を30文字以内で入力してください。');
  if (!memos.length && !ratings.length && !points.length) fail('共有する内容がありません。');
  return JSON.stringify({format: 'ohenro-quest-share', version: 1, name: name.trim(), exportedAt: new Date().toISOString(), memos: memos.map(validateMemo), ratings: ratings.map(validateRating), points: points.map(validateUserParking)}, null, 2);
}
export function readSharePack(value) {
  if (typeof value !== 'string' || value.length > 2 * 1024 * 1024) fail('共有ファイルは2MB以内にしてください。');
  let d; try { d = JSON.parse(value); } catch { fail('JSONファイルを読み込めません。'); }
  if (d?.format !== 'ohenro-quest-share' || d.version !== 1 || !nameOK(d.name) || !Array.isArray(d.memos) || !Array.isArray(d.ratings) || !Array.isArray(d.points) || d.memos.length > 5000 || d.ratings.length > 88 || d.points.length > 88) fail('お遍路クエストの共有ファイルではありません。');
  return {name: d.name.trim(), exportedAt: typeof d.exportedAt === 'string' ? d.exportedAt.slice(0, 40) : '', memos: d.memos.map(validateMemo), ratings: d.ratings.map(validateRating), points: d.points.map(validateUserParking)};
}
export function validateSharedPack(p) {
  if (!p || typeof p.id !== 'string' || !p.id || p.id.length > 100 || !Number.isFinite(p.importedAt)) fail('共有されたデータの形式を確認できません。');
  return {id: p.id, importedAt: p.importedAt, ...readSharePack(JSON.stringify({format: 'ohenro-quest-share', version: 1, name: p.name, exportedAt: p.exportedAt, memos: p.memos, ratings: p.ratings, points: p.points}))};
}

// LINEなどに貼る文章。
export function shareText({name, memos, ratings, temples}) {
  const tn = id => { const t = temples.find(t => t.id === id); return `第${id}番 ${t?.name || ''}`; };
  const ids = [...new Set([...ratings.map(r => r.templeId), ...memos.map(m => m.templeId)])].sort((a, b) => a - b);
  const lines = [`お遍路クエスト 車メモ（${name}）`];
  for (const id of ids) {
    const r = ratings.find(r => r.templeId === id), ms = memos.filter(m => m.templeId === id);
    lines.push('', `■${tn(id)}${r ? `　評価：${r.level} ${ratingLabel(r.level)}` : ''}`);
    for (const m of ms) lines.push(`${m.date} ${memoText(m).join('、')}${m.note ? `「${m.note}」` : ''}`);
  }
  return lines.join('\n');
}
