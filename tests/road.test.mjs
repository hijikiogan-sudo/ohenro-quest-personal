// node --test tests/ で実行（Node 20以降、追加パッケージ不要）
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {readRoadData, roadChipHTML, roadCardHTML} from '../road-level.mjs';

const row = (id, extra = {}) => ({id, level: 2, reason: '山道が続く。', sources: [{label: '霊場会', url: 'https://88shikokuhenro.jp/'}], confidence: 'medium', ...extra});
const data = temples => ({format: 'kuruma-henro-road', version: 1, checkedAt: '2026-11-03', temples});

test('道の難しさ：データの確認', () => {
  const r = readRoadData(data([row(1), row(2, {level: 0})]));
  assert.equal(r.temples.get(2).level, 0);
  assert.equal(r.checkedAt, '2026-11-03');
  for (const bad of [[row(1, {level: 4})], [row(1, {sources: []})], [row(1, {sources: [{label: 'x', url: 'http://a'}]})], [row(1, {sources: [{label: 'x', url: 'javascript:alert(1)'}]})], [row(1), row(1)], [row(89)], [row(1, {confidence: 'x'})], [row(1, {reason: ''})]])
    assert.throws(() => readRoadData(data(bad)), JSON.stringify(bad));
  assert.throws(() => readRoadData({...data([]), format: 'x'}));
});

test('道の難しさ：表示（文字は書き出し前にエスケープ）', () => {
  const r = readRoadData(data([row(1, {reason: '<b>狭い</b>', level: 3, confidence: 'low'})])).temples.get(1);
  assert.equal(roadChipHTML(r), '<span class="road-chip lv3">道：難所</span>');
  const card = roadCardHTML(r, '2026-11-03');
  assert.match(card, /&lt;b&gt;狭い/);
  assert.match(card, /確からしさは低め/);
  assert.equal(roadChipHTML(undefined), '');
});

test('道の難しさ：同梱の data/road.json は88寺そろっていて読める', {skip: !existsSync(new URL('../data/road.json', import.meta.url))}, () => {
  const r = readRoadData(JSON.parse(readFileSync(new URL('../data/road.json', import.meta.url))));
  assert.equal(r.temples.size, 88);
});
