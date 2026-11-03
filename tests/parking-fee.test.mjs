// node --test tests/ で実行（Node 20以降、追加パッケージ不要）
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {readFeeData, feeShort, feeChipHTML, feeCardHTML, feeTotal} from '../parking-fee.mjs';

const src = [{label: '霊場会', url: 'https://88shikokuhenro.jp/'}];
const row = (id, extra = {}) => ({id, fee: 'free', yen: null, detail: '無料、普通車50台。', extra: '', sources: src, confidence: 'medium', ...extra});
const data = temples => ({format: 'kuruma-henro-parking-fee', version: 1, checkedAt: '2026-11-03', temples});

test('駐車場の費用：データの確認', () => {
  const r = readFeeData(data([row(1), row(2, {fee: 'paid', yen: 300})]));
  assert.equal(r.temples.get(2).yen, 300);
  for (const bad of [[row(1, {fee: 'x'})], [row(1, {yen: 300})], [row(1, {fee: 'paid', yen: -1})], [row(1, {fee: 'paid', yen: 1.5})], [row(1, {sources: []})], [row(1, {sources: [{label: 'a', url: 'http://a'}]})], [row(1), row(1)], [row(1, {detail: ''})], [row(1, {confidence: 'x'})]])
    assert.throws(() => readFeeData(data(bad)), JSON.stringify(bad));
});

test('駐車場の費用：表示と予定の合計', () => {
  const t = readFeeData(data([row(1), row(2, {fee: 'paid', yen: 300}), row(3, {fee: 'donation'}), row(4, {fee: 'paid'}), row(5, {fee: 'none', yen: 500}), row(6, {fee: 'donation', yen: 200}), row(7, {fee: 'unknown'})])).temples;
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(i => feeShort(t.get(i))), ['無料', '300円', '志納', '有料', '近くの駐車場500円', '志納（200円ほど）', '料金不明']);
  assert.equal(feeChipHTML(t.get(2)), '<span class="fee-chip paid">駐車場：300円</span>');
  assert.match(feeCardHTML({...t.get(2), detail: '<b>x</b>'}), /&lt;b&gt;x/);
  assert.deepEqual(feeTotal([1, 2, 2, 3, 4, 5, 6, 7, 99], t), {yen: 1000, unknown: 3, free: 1, donation: 1}, '同じ札所は1回、分からない札所は数えて合計に入れない');
});

test('駐車場の費用：同梱の data/parking-fee.json は88寺そろっていて読める', {skip: !existsSync(new URL('../data/parking-fee.json', import.meta.url))}, () => {
  assert.equal(readFeeData(JSON.parse(readFileSync(new URL('../data/parking-fee.json', import.meta.url)))).temples.size, 88);
});

import {readLocalFees, writeLocalFees, withLocal, localDiffs} from '../parking-fee.mjs';
import {isStale, roadCardHTML} from '../road-level.mjs';
test('現地の料金の記録：読み書き・優先・調べた料金との違い', () => {
  const m = readLocalFees(JSON.stringify({2: {fee: 'paid', yen: 500, date: '2027-04-01', note: '値上げ'}, 3: {fee: 'free', yen: 100, date: '2027-04-01'}, 99: {fee: 'free', date: '2027-04-01'}, 4: {fee: 'x', date: '2027-04-01'}, 5: {fee: 'paid', yen: -1, date: '2027-04-01'}}));
  assert.deepEqual([...m.keys()], [2, 3], '番号・種類・金額がおかしい記録は使わない');
  assert.equal(m.get(3).yen, null, '無料なら金額は持たない');
  assert.deepEqual(readLocalFees('{壊れた'), new Map());
  assert.deepEqual(readLocalFees(writeLocalFees(m)), m);
  const official = readFeeData(data([row(2, {fee: 'paid', yen: 300}), row(3)])).temples;
  const f = withLocal(official.get(2), m.get(2));
  assert.equal(f.yen, 500); assert.equal(f.own, true); assert.equal(f.detail, official.get(2).detail, '説明と出典は調べたものを残す');
  assert.equal(withLocal(official.get(3), undefined), official.get(3));
  assert.deepEqual(localDiffs(official, m).map(d => d.id), [2], '同じ料金なら違いに出さない');
  assert.equal(feeChipHTML(f), '<span class="fee-chip paid own">駐車場：500円（自分の記録）</span>');
});

test('調べた日から1年以上たったら知らせる', () => {
  const day = 24 * 60 * 60 * 1000, at = Date.parse('2026-11-03T00:00:00+09:00');
  assert.equal(isStale('2026-11-03', at + 300 * day), false);
  assert.equal(isStale('2026-11-03', at + 366 * day), true);
  assert.equal(isStale('', at), false);
  const r = {level: 1, reason: 'x', sources: [{label: 'a', url: 'https://a'}], confidence: 'high'};
  assert.match(roadCardHTML(r, '2026-11-03', at + 400 * day), /1年以上たっています/);
  assert.doesNotMatch(roadCardHTML(r, '2026-11-03', at + 10 * day), /1年以上/);
  assert.match(feeCardHTML(official1(), '2026-11-03', {now: at + 400 * day}), /1年以上たっています/);
});
function official1() { return readFeeData(data([row(1)])).temples.get(1); }
