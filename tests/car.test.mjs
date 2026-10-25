// node --test tests/ で実行（Node 20以降、追加パッケージ不要）
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessGPS, routeUrl, distanceMeters, PARKING_RADIUS} from '../domain.mjs';
import {validateCarData, validateUserParking, assessParkingRegistration, createParkingResolver, carInfoFor, exportParkings, readParkingsJSON} from '../car-domain.mjs';
import {planLocation, navigationSections} from '../plan-domain.mjs';

const temples = JSON.parse(readFileSync(new URL('../data/temples.json', import.meta.url)));
const car = JSON.parse(readFileSync(new URL('../data/car.json', import.meta.url)));
const yokomine = temples.find(t => t.id === 60);
const NOW = 1_800_000_000_000;
// 札所マーカーから北へ約d m離れた地点
const north = (t, d) => ({lat: t.lat + d / 111_320, lng: t.lng});
const pos = (p, accuracy = 10) => ({...p, accuracy, timestamp: NOW});

test('車データは出典付きで検証を通り、座標は未確認なので空', () => {
  validateCarData(car);
  assert.ok(car.temples.length >= 10);
  for (const t of car.temples) {
    assert.ok(t.sources.length > 0);
    assert.ok(t.sources.every(s => s.url.startsWith('https://88shikokuhenro.jp/')));
    assert.equal(t.parkingPoints.length, 0);
    assert.equal(temples.find(x => x.id === t.id).name, t.name);
  }
  const y = carInfoFor(car, 60);
  assert.equal(y.walkToHondoMeters, 500);
  assert.match(y.seasonalClosure, /12月下旬/);
});

test('壊れた車データは拒否する', () => {
  const bad = structuredClone(car); bad.temples[0].sources = [];
  assert.throws(() => validateCarData(bad));
  const dup = structuredClone(car); dup.temples.push(structuredClone(dup.temples[0]));
  assert.throws(() => validateCarData(dup));
  const coord = structuredClone(car); coord.temples[0].parkingPoints = [{label: 'x', lat: 0, lng: 0, sourceUrl: 'https://example.com'}];
  assert.throws(() => validateCarData(coord));
});

test('駐車場なし：従来どおり本堂300m判定', () => {
  assert.equal(assessGPS(pos(north(yokomine, 200)), yokomine, NOW).ok, true);
  assert.equal(assessGPS(pos(north(yokomine, 200)), yokomine, NOW).near, 'temple');
  const far = assessGPS(pos(north(yokomine, 500)), yokomine, NOW);
  assert.equal(far.ok, false);
  assert.match(far.message, /300m/);
});

test('駐車場あり：本堂から500mでも駐車場の近くなら通る', () => {
  const parking = north(yokomine, 500);
  const r = assessGPS(pos(north(yokomine, 520), 20), yokomine, NOW, parking);
  assert.equal(r.ok, true);
  assert.equal(r.near, 'parking');
  assert.ok(r.parkingDistance <= 25);
  assert.ok(r.distance > 500);
});

test('駐車場あり：誤差込みで150mを超えると通らない', () => {
  const parking = north(yokomine, 500);
  const r = assessGPS(pos(north(yokomine, 640), 20), yokomine, NOW, parking);
  assert.equal(r.ok, false);
  assert.match(r.message, new RegExp(`${PARKING_RADIUS}m`));
  // 本堂300m判定は駐車場があっても優先される
  assert.equal(assessGPS(pos(north(yokomine, 100)), yokomine, NOW, parking).near, 'temple');
});

test('測位誤差100m超・古い位置は駐車場があっても拒否', () => {
  const parking = north(yokomine, 500);
  assert.equal(assessGPS(pos(parking, 120), yokomine, NOW, parking).ok, false);
  assert.equal(assessGPS({...parking, accuracy: 5, timestamp: NOW - 120000}, yokomine, NOW, parking).ok, false);
});

test('ルートURL：駐車場があれば座標、なければ名称＋住所', () => {
  const plain = new URL(routeUrl(yokomine));
  assert.equal(plain.searchParams.get('destination'), `${yokomine.name} ${yokomine.address}`);
  assert.equal(plain.searchParams.get('travelmode'), 'driving');
  const p = {lat: 33.8401234, lng: 133.1109876};
  assert.equal(new URL(routeUrl(yokomine, 'google', p)).searchParams.get('destination'), '33.840123,133.110988');
  const apple = new URL(routeUrl(yokomine, 'apple', p));
  assert.equal(apple.searchParams.get('daddr'), '33.840123,133.110988');
  assert.equal(apple.searchParams.get('dirflg'), 'd');
});

test('駐車場の登録：3km以内・誤差50m以内だけ受け付ける', () => {
  assert.equal(assessParkingRegistration(pos(north(yokomine, 500), 20), yokomine, NOW).ok, true);
  assert.equal(assessParkingRegistration(pos(north(yokomine, 3500), 20), yokomine, NOW).ok, false);
  assert.equal(assessParkingRegistration(pos(north(yokomine, 500), 80), yokomine, NOW).ok, false);
  assert.equal(assessParkingRegistration({lat: 35.68, lng: 139.76, accuracy: 5, timestamp: NOW}, yokomine, NOW).ok, false);
  assert.equal(assessParkingRegistration({...north(yokomine, 500), accuracy: 5, timestamp: NOW - 90000}, yokomine, NOW).ok, false);
});

test('駐車場の選択：自分の登録 > データの座標 > なし', () => {
  const data = structuredClone(car);
  data.temples.find(t => t.id === 21).parkingPoints = [{label: '太龍寺ロープウェイ駐車場', lat: 33.88, lng: 134.53, sourceUrl: 'https://88shikokuhenro.jp/tokushima/21tairyuji/'}];
  const user = [validateUserParking({templeId: 21, ...north(yokomine, 0), lat: 33.881, lng: 134.531, accuracy: 12, savedAt: NOW})];
  const r1 = createParkingResolver(data, user);
  assert.equal(r1(21).source, 'user');
  const r2 = createParkingResolver(data, []);
  assert.equal(r2(21).source, 'data');
  assert.equal(r2(60), null);
  assert.equal(createParkingResolver(null, [])(21), null);
});

test('行き先予定：駐車場がある札所だけ座標を経由地にする', () => {
  const p = {lat: 33.8401, lng: 133.1109};
  const parkingFor = id => id === 60 ? p : null;
  const loc = planLocation({kind: 'temple', templeId: 60}, temples, parkingFor);
  assert.equal(loc.query, '33.840100,133.110900');
  assert.match(loc.label, /駐車場/);
  assert.equal(planLocation({kind: 'temple', templeId: 61}, temples, parkingFor).query.includes('香園寺'), true);
  // 既存の呼び出し（第3引数なし）は従来どおり
  assert.equal(planLocation({kind: 'temple', templeId: 60}, temples).query, `${yokomine.name} ${yokomine.address}`);
  const plan = {id: 'p1', journeyId: 'j1', name: '愛媛の山', revision: 0, departAt: '', origin: {kind: 'current'}, returnTo: {kind: 'none'}, stops: [{templeId: 60, minutes: 30}, {templeId: 61, minutes: 30}]};
  const [section] = navigationSections(plan, temples, parkingFor);
  const url = new URL(section.url);
  assert.equal(url.searchParams.get('waypoints'), '33.840100,133.110900');
});

test('駐車場地点のJSON：書き出し→読み込みが往復し、不正値は拒否', () => {
  const points = [validateUserParking({templeId: 60, lat: 33.84, lng: 133.11, accuracy: 9.6, savedAt: NOW})];
  const back = readParkingsJSON(exportParkings(points));
  assert.deepEqual(back.points, points);
  assert.throws(() => readParkingsJSON('{"format":"ohenro-quest-parkings","version":1,"points":[{"templeId":60,"lat":10,"lng":133,"accuracy":5,"savedAt":1}]}'));
  assert.throws(() => readParkingsJSON(JSON.stringify({format: 'ohenro-quest-parkings', version: 1, points: [...points, ...points]})));
  assert.throws(() => readParkingsJSON('not json'));
});

test('距離計算の確認：北へ500mはほぼ500m', () => {
  const d = distanceMeters(yokomine, north(yokomine, 500));
  assert.ok(Math.abs(d - 500) < 2);
});

// ---- STEP 2 ----
import {closureHit, vehicleBlocked, carFlags, hasWarn, planWarnings, validateRating, RATINGS} from '../car-domain.mjs';

test('冬期閉鎖：年をまたぐ期間を判定（横峰寺 12-21〜02-29）', () => {
  const c = carInfoFor(car, 60).closure;
  for (const d of ['2026-12-21', '2026-12-31', '2027-01-15', '2027-02-28', '2028-02-29']) assert.equal(closureHit(c, d), true, d);
  for (const d of ['2026-12-20', '2027-03-01', '2026-11-03', '2026-08-01']) assert.equal(closureHit(c, d), false, d);
  assert.equal(closureHit(c, ''), false);
  assert.equal(closureHit({from: '04-01', to: '04-30', approximate: false}, '2026-04-15'), true);
});

test('車のサイズ：横峰寺は大型バスのみ不可', () => {
  const y = carInfoFor(car, 60);
  assert.equal(vehicleBlocked(y, 'bus'), true);
  assert.equal(vehicleBlocked(y, 'standard'), false);
  assert.equal(vehicleBlocked(null, 'bus'), false);
});

test('一覧のラベル：公式情報と自分の評価から作る', () => {
  const y = carFlags(carInfoFor(car, 60));
  assert.deepEqual(y.map(f => f.key), ['closure', 'limits', 'walk']);
  assert.equal(hasWarn(y), true);
  assert.ok(carFlags(carInfoFor(car, 60), {vehicle: 'bus'}).some(f => f.key === 'vehicle'));
  assert.ok(carFlags(carInfoFor(car, 21)).some(f => f.key === 'ropeway' && f.level === 'warn'));
  assert.equal(carFlags(null).length, 0);
  assert.equal(hasWarn(carFlags(null, {rating: 1})), false);
  assert.equal(hasWarn(carFlags(null, {rating: 2})), true);
  assert.equal(hasWarn(carFlags(carInfoFor(car, 81))), false);
});

test('行き先予定の注意：日付・車・ロープウェイ・自分の評価・費用', () => {
  const stops = [{templeId: 60, minutes: 30}, {templeId: 21, minutes: 60}, {templeId: 1, minutes: 30}, {templeId: 27, minutes: 30}];
  const noDate = planWarnings({stops, carData: car, temples});
  assert.equal(noDate.needsDate, true);
  const winter = planWarnings({stops, date: '2027-01-10', carData: car, temples, vehicle: 'bus', ratings: new Map([[1, 3]])});
  assert.equal(winter.needsDate, false);
  const y = winter.items.find(i => i.templeId === 60);
  assert.ok(y.messages.some(m => /通行止めの期間に当たる可能性/.test(m.text)));
  assert.ok(y.messages.some(m => /設定中の車（大型バス）は通行できない/.test(m.text)));
  assert.ok(winter.items.find(i => i.templeId === 21).messages.some(m => /ロープウェイ/.test(m.text)));
  assert.ok(winter.items.find(i => i.templeId === 1).messages.some(m => /難所/.test(m.text)));
  assert.ok(winter.costs.some(c => c.startsWith('第27番')));
  const summer = planWarnings({stops: [{templeId: 60, minutes: 30}], date: '2027-07-10', carData: car, temples});
  assert.equal(summer.items[0].messages.some(m => /通行止め/.test(m.text)), false);
  assert.equal(summer.warnCount, 0);
  assert.equal(planWarnings({stops: [{templeId: 1, minutes: 30}], carData: car, temples}).items.length, 0);
});

test('自分の評価は0〜3のみ、バックアップv2に含まれ、v1も読める', () => {
  assert.equal(RATINGS.length, 4);
  assert.throws(() => validateRating({templeId: 1, level: 4, savedAt: NOW}));
  assert.throws(() => validateRating({templeId: 0, level: 1, savedAt: NOW}));
  const points = [validateUserParking({templeId: 60, lat: 33.84, lng: 133.11, accuracy: 9, savedAt: NOW})];
  const rs = [validateRating({templeId: 12, level: 2, savedAt: NOW})];
  const back = readParkingsJSON(exportParkings(points, rs));
  assert.deepEqual(back, {points, ratings: rs});
  const v1 = JSON.stringify({format: 'ohenro-quest-parkings', version: 1, points});
  assert.deepEqual(readParkingsJSON(v1), {points, ratings: []});
});
