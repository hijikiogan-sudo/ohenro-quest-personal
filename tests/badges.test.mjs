// node --test tests/badges.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeBadges, tierKeys, newlyEarned, badgeSummary, featuredBadges, DOJO} from '../badges.mjs';

const car = JSON.parse(readFileSync(new URL('../data/car.json', import.meta.url)));
const v = (templeId, date = '2026-10-25', extra = {}) => ({id: `${templeId}-${date}`, journeyId: 'j1', templeId, date, method: 'manual', deletedAt: null, createdAt: 0, ...extra});
const get = (list, id) => list.find(b => b.id === id);

test('はじめは全バッジ未獲得、段階の合計が出る', () => {
  const list = computeBadges({journeyId: 'j1', carData: car});
  assert.ok(list.length >= 18);
  assert.equal(list.filter(b => b.earned).length, 0);
  const s = badgeSummary(list);
  assert.equal(s.earnedTiers, 0);
  assert.ok(s.totalTiers >= 40);
});

test('道場は札所番号の区分（1-23/24-39/40-65/66-88）で、1寺・半分・すべて', () => {
  assert.deepEqual(DOJO.map(d => [d.from, d.to]), [[1, 23], [24, 39], [40, 65], [66, 88]]);
  const visits = Array.from({length: 12}, (_, i) => v(i + 1));
  const list = computeBadges({visits, journeyId: 'j1', carData: car});
  const h = get(list, 'dojo-hosshin');
  assert.deepEqual(h.goals, [1, 12, 23]);
  assert.equal(h.tier, 2);
  assert.equal(h.tierName, '銀');
  assert.equal(get(list, 'dojo-shugyo').tier, 0);
  // 66番は所在地が徳島でも、道場は涅槃（讃岐）
  assert.equal(get(computeBadges({visits: [v(66)], journeyId: 'j1'}), 'dojo-nehan').tier, 1);
});

test('一日の最多・番号つなぎ・四季', () => {
  const g = {method: 'gps-self-reported'};
  const visits = [v(1, '2026-04-01', g), v(2, '2026-04-01', g), v(3, '2026-04-01', g), v(4, '2026-07-01'), v(5, '2026-07-01'), v(6, '2026-07-01'), v(7, '2026-10-01'), v(8, '2027-01-05')];
  const list = computeBadges({visits, journeyId: 'j1'});
  assert.equal(get(list, 'day').value, 3);
  assert.equal(get(list, 'day').tierName, '銅');
  assert.equal(get(list, 'run').value, 8);
  // 手動登録だけの日（7/1に3寺）は一日の最多に数えない
  assert.equal(get(computeBadges({visits: visits.map(x => ({...x, method: 'manual'})), journeyId: 'j1'}), 'day').value, 0);
  assert.equal(get(list, 'seasons').value, 4);
  assert.equal(get(list, 'seasons').complete, true);
  assert.equal(get(list, 'seasons').tierName, '金');
});

test('取り消した訪問・別の巡礼の札所は数えない（全巡礼のものは別）', () => {
  const visits = [v(1), v(2, '2026-10-25', {deletedAt: 1}), v(3, '2026-10-25', {journeyId: 'j2', method: 'gps-self-reported'})];
  const list = computeBadges({visits, journeyId: 'j1'});
  assert.equal(get(list, 'steps').value, 1);
  assert.equal(get(list, 'gps').value, 1);
});

test('結願・周回', () => {
  const visits = Array.from({length: 88}, (_, i) => v(i + 1));
  const list = computeBadges({visits, journeyId: 'j1'});
  assert.equal(get(list, 'kechigan').complete, true);
  assert.equal(get(list, 'steps').complete, true);
  assert.equal(get(list, 'laps').value, 1);
  assert.ok(DOJO.every(d => get(list, 'dojo-' + d.id).complete));
});

test('車遍路：ロープウェイ・林道・難所越え・駐車場・車メモ・共有', () => {
  const visits = [v(21), v(66), v(60), v(12)];
  const list = computeBadges({visits, journeyId: 'j1', carData: car, ratings: new Map([[12, 3], [20, 2], [60, 1]]), parkings: [{templeId: 60}], memos: [{}, {}], sharedCount: 1});
  assert.equal(get(list, 'ropeway').complete, true);
  assert.equal(get(list, 'ropeway').tierName, '金');
  assert.equal(get(list, 'rindo').complete, true);
  assert.equal(get(list, 'hard').value, 1); // 20番は未訪問、60番は評価1
  assert.equal(get(list, 'parking').tier, 1);
  assert.equal(get(list, 'memo').tier, 1);
  assert.equal(get(list, 'share').tierName, '銀');
});

test('写真の枚数が分からないときは写真バッジを出さない', () => {
  assert.equal(get(computeBadges({journeyId: 'j1'}), 'photos'), undefined);
  assert.equal(get(computeBadges({journeyId: 'j1', photoCount: 30}), 'photos').tierName, '銀');
});

test('新しく到達した段階だけを知らせる', () => {
  const before = computeBadges({visits: [v(1)], journeyId: 'j1'});
  const seen = tierKeys(before);
  assert.deepEqual(newlyEarned(before, seen), []);
  const after = computeBadges({visits: Array.from({length: 10}, (_, i) => v(i + 1)), journeyId: 'j1'});
  const names = newlyEarned(after, seen).map(f => f.name);
  assert.ok(names.includes('巡礼の歩み'));
  assert.ok(!names.includes('はじめの一歩'));
});

test('ホームの表示：あと少しのものを先に、6個まで', () => {
  const list = computeBadges({visits: Array.from({length: 9}, (_, i) => v(i + 1)), journeyId: 'j1'});
  const f = featuredBadges(list, 6);
  assert.equal(f.length, 6);
  assert.equal(f[0].id, 'steps'); // 9/10 で一番近い
});
