// node --test tests/ で実行（Node 20以降、追加パッケージ不要）
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePlan, planDays, moveStop, nightsAfterRemove, navigationSections} from '../plan-domain.mjs';
import {planSchedule, nearestOrder} from '../car-domain.mjs';

const temples = JSON.parse(readFileSync(new URL('../data/temples.json', import.meta.url)));
const plan = (ids, extra = {}) => ({id: 'p1', journeyId: 'j1', revision: 0, name: '一泊二日', departAt: '', origin: {kind: 'current'}, returnTo: {kind: 'none'}, stops: ids.map(templeId => ({templeId, minutes: 30})), ...extra});
const ids = stops => stops.map(s => s.templeId);

test('泊まりがけ：区切りと出発時刻の検証。区切りの無い古い予定もそのまま通る', () => {
  assert.doesNotThrow(() => validatePlan(plan([1, 2, 3])));
  assert.doesNotThrow(() => validatePlan(plan([1, 2, 3, 4], {nights: [{after: 1, place: '道の駅の近くの宿'}], dayStart: '07:30'})));
  assert.doesNotThrow(() => validatePlan(plan([1, 2, 3], {nights: [{after: 0, place: ''}, {after: 1, place: ''}]})));
  for (const nights of [[{after: 2, place: ''}], [{after: -1, place: ''}], [{after: 1, place: ''}, {after: 1, place: ''}], [{after: 1, place: 'あ'.repeat(121)}], [{after: 1}], 'x'])
    assert.throws(() => validatePlan(plan([1, 2, 3], {nights})), JSON.stringify(nights));
  for (const dayStart of ['24:00', '8:00', '', 800]) assert.throws(() => validatePlan(plan([1, 2], {dayStart})), String(dayStart));
});

test('泊まりがけ：日ごとの範囲と宿', () => {
  assert.deepEqual(planDays(plan([1, 2, 3])), [{day: 1, from: 0, to: 2, stay: null}]);
  assert.deepEqual(planDays(plan([1, 2, 3, 4, 5], {nights: [{after: 1, place: ' 宿A '}, {after: 3, place: ''}]})), [
    {day: 1, from: 0, to: 1, stay: '宿A'}, {day: 2, from: 2, to: 3, stay: ''}, {day: 3, from: 4, to: 4, stay: null}]);
});

test('泊まりがけ：↑↓で日の境目をまたぐと、入れ替えずに隣の日へ移る', () => {
  const stops = plan([1, 2, 3, 4]).stops, nights = [{after: 1, place: '宿'}];
  const down = moveStop(stops, nights, 1, 1);
  assert.deepEqual(ids(down.stops), [1, 2, 3, 4]);
  assert.equal(down.nights[0].after, 0, '2番目の札所が2日目の先頭になる');
  const up = moveStop(stops, nights, 2, -1);
  assert.deepEqual(ids(up.stops), [1, 2, 3, 4]);
  assert.equal(up.nights[0].after, 2, '3番目の札所が1日目の最後になる');
  assert.deepEqual(ids(moveStop(stops, nights, 0, 1).stops), [2, 1, 3, 4], '同じ日の中では入れ替える');
  const lonely = moveStop(plan([1, 2, 3]).stops, [{after: 0, place: ''}], 0, 1);
  assert.deepEqual(ids(lonely.stops), [2, 1, 3], '1日目が空になるときは入れ替える');
  assert.equal(lonely.nights[0].after, 0);
  assert.equal(nights[0].after, 1, '元の区切りは書き換えない');
});

test('泊まりがけ：札所を外すと区切りがずれ、空になった日は区切りごと消える', () => {
  assert.deepEqual(nightsAfterRemove([{after: 1, place: '宿'}], 0, 3), [{after: 0, place: '宿'}]);
  assert.deepEqual(nightsAfterRemove([{after: 1, place: '宿'}], 3, 3), [{after: 1, place: '宿'}]);
  assert.deepEqual(nightsAfterRemove([{after: 0, place: '宿'}], 0, 2), [], '1日目の札所が無くなる');
  assert.deepEqual(nightsAfterRemove([{after: 1, place: '宿'}], 2, 2), [], '最後の日の札所が無くなる');
  assert.deepEqual(nightsAfterRemove([{after: 0, place: 'A'}, {after: 1, place: 'B'}], 1, 2), [{after: 0, place: 'A'}], '2日目が空になる');
});

test('泊まりがけ：ナビは日ごとに分け、宿を終点・翌日の始点にする', () => {
  const p = plan([1, 2, 3, 4], {origin: {kind: 'address', address: '徳島駅'}, returnTo: {kind: 'address', address: '高松駅'}, nights: [{after: 1, place: '鳴門の宿'}]});
  const s = navigationSections(p, temples);
  assert.deepEqual(s.map(x => x.day), [1, 2]);
  assert.equal(s[0].origin.query, '徳島駅');
  assert.equal(s[0].targets.at(-1).query, '鳴門の宿');
  assert.equal(s[1].origin.query, '鳴門の宿');
  assert.equal(s[1].targets.at(-1).query, '高松駅');
  const noStay = navigationSections({...p, nights: [{after: 1, place: ''}]}, temples);
  assert.equal(noStay[1].origin, null, '宿が無ければ2日目は現在地から');
  assert.equal(noStay[0].targets.length, 2, '1日目の終点は最後の札所');
});

test('泊まりがけ：時間の目安は2日目の朝から数え直し、宿からの移動は含めない', () => {
  const stops = plan([1, 2, 3, 4]).stops;
  const sc = planSchedule({stops, departAt: '2026-11-01T09:00', temples, nights: [{after: 1, place: ''}], dayStart: '07:30'});
  assert.equal(sc.days, 2);
  assert.deepEqual(sc.rows.map(r => r.day), [1, 1, 2, 2]);
  assert.equal(sc.rows[2].dayHead, true);
  assert.equal(sc.rows[2].leg, null);
  assert.equal(sc.rows[2].arriveText, '07:30');
  assert.ok(sc.rows[3].arrive > sc.rows[2].leave);
  const oneDay = planSchedule({stops, departAt: '2026-11-01T09:00', temples});
  assert.ok(sc.driveMinutes < oneDay.driveMinutes, '2日目の最初の移動を含めない');
});

test('泊まりがけ：近い順は日ごとに並べ、札所を別の日へ移さない', () => {
  const stops = plan([1, 6, 3, 10, 2, 8]).stops, nights = [{after: 2, place: ''}];
  const r = nearestOrder({stops, temples, origin: {kind: 'current'}, nights});
  assert.equal(r.stops[0].templeId, 1);
  assert.deepEqual(ids(r.stops.slice(0, 3)).sort((a, b) => a - b), [1, 3, 6]);
  assert.deepEqual(ids(r.stops.slice(3)).sort((a, b) => a - b), [2, 8, 10]);
  assert.ok(r.afterKm <= r.beforeKm);
});

import {validateOuting, outingProgress} from '../today-store.mjs';
const outing = (ids, extra = {}) => ({version: 1, id: 'o1', journeyId: 'j1', planId: 'p1', name: '一泊二日', status: 'active', revision: 1, dates: ['2026-11-14'], startedAt: 1, updatedAt: 1, endedAt: null, stops: ids.map(templeId => ({templeId, minutes: 30, skipped: false})), ...extra});
const visit = (templeId, date) => ({id: 'v' + templeId, journeyId: 'j1', templeId, date});

test('今日の巡礼：日の区切りの検証。区切りの無い進行もそのまま通る', () => {
  assert.doesNotThrow(() => validateOuting(outing([1, 2, 3])));
  assert.doesNotThrow(() => validateOuting(outing([1, 2, 3], {nights: [{after: 0, place: '宿'}]})));
  for (const nights of [[{after: 2, place: ''}], [{after: 0, place: 1}], [{after: 1, place: ''}, {after: 0, place: ''}], {}])
    assert.throws(() => validateOuting(outing([1, 2, 3], {nights})), JSON.stringify(nights));
});

test('今日の巡礼：日と宿の表示用の情報、その日の札所を終えたら宿へ', () => {
  const s = outing([1, 2, 3, 4], {nights: [{after: 1, place: ' 鳴門の宿 '}]});
  const start = outingProgress(s, [], '2026-11-14');
  assert.equal(start.days, 2);
  assert.deepEqual(start.rows.map(r => [r.day, r.firstOfDay, r.stayAfter]), [[1, true, null], [1, false, '鳴門の宿'], [2, true, null], [2, false, null]]);
  assert.equal(start.toStay, null);
  const evening = outingProgress(s, [visit(1, '2026-11-14'), visit(2, '2026-11-14')], '2026-11-14');
  assert.deepEqual(evening.toStay, {day: 1, place: '鳴門の宿'});
  assert.equal(evening.next.templeId, 3);
  const morning = outingProgress({...s, dates: ['2026-11-14', '2026-11-15']}, [visit(1, '2026-11-14'), visit(2, '2026-11-14')], '2026-11-15');
  assert.equal(morning.toStay, null, '翌朝は宿の案内を出さず次の札所へ');
  assert.equal(outingProgress(outing([1, 2]), [visit(1, '2026-11-14')], '2026-11-14').toStay, null, '区切りが無ければ出さない');
});
