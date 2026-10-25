// node --test tests/map.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readMapKind, isTileKind, routePoints, routeZigzag, GSI, MAP_KINDS} from '../map-route.mjs';
import {distanceMeters} from '../domain.mjs';

const temples = JSON.parse(readFileSync(new URL('../data/temples.json', import.meta.url)));
const store = v => ({getItem: () => v});

test('地図の種類：旧設定を読み替える（冒険の地図→全体図、OSM→標準地図）', () => {
  assert.deepEqual(MAP_KINDS, ['overview', 'pale', 'std', 'photo']);
  assert.equal(readMapKind(store('quest'), 'k'), 'overview');
  assert.equal(readMapKind(store('plain'), 'k'), 'overview');
  assert.equal(readMapKind(store('road'), 'k'), 'std');
  assert.equal(readMapKind(store('pale'), 'k'), 'pale');
  assert.equal(readMapKind(store('photo'), 'k'), 'photo');
  assert.equal(readMapKind(store(null), 'k'), 'overview');
  assert.equal(readMapKind({getItem() { throw new Error(); }}, 'k'), 'overview');
  assert.equal(isTileKind('overview'), false);
  assert.equal(isTileKind('photo'), true);
});

test('地図タイルは国土地理院のみ、写真はズーム14以上', () => {
  for (const url of [GSI.pale, GSI.std, GSI.photo]) assert.match(url, /^https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\//);
  assert.equal(GSI.photoMinZoom, 14);
  const src = readFileSync(new URL('../road-map.mjs', import.meta.url), 'utf8');
  assert.equal(src.includes('openstreetmap.org'), false);
});

test('ルート：順番の番号と、最初の未訪問を「つぎ」にする', () => {
  const pts = routePoints([{templeId: 3}, {templeId: 1}, {templeId: 2}], temples, new Set([3]));
  assert.deepEqual(pts.map(p => [p.order, p.templeId, p.status]), [[1, 3, 'visited'], [2, 1, 'next'], [3, 2, 'pending']]);
  const today = routePoints([{templeId: 1, status: 'visited'}, {templeId: 2, status: 'skipped'}, {templeId: 3, status: 'pending'}], temples);
  assert.deepEqual(today.map(p => p.status), ['visited', 'skipped', 'next']);
  assert.equal(routePoints([{templeId: 999}], temples).length, 0);
});

test('行ったり来たりの目安：徳島→高知→徳島→高知は検出、番号順は検出しない', () => {
  const d = (a, b) => distanceMeters(a, b);
  const zig = routePoints([1, 24, 2, 25, 3].map(templeId => ({templeId})), temples);
  assert.equal(routeZigzag(zig, d), true);
  const straight = routePoints([1, 2, 3, 4, 5].map(templeId => ({templeId})), temples);
  assert.equal(routeZigzag(straight, d), false);
});

import {parkingWalkNote} from '../mini-map.mjs';
test('札所のまわり：駐車場からチェックイン範囲までの目安', () => {
  const t = temples.find(t => t.id === 60);
  assert.match(parkingWalkNote(t, null), /登録すると/);
  const near = {lat: t.lat + 200 / 111320, lng: t.lng, label: '自分で登録した駐車場'};
  assert.match(parkingWalkNote(t, near), /約(199|200)m.*範囲（300m）の中/);
  const far = {lat: t.lat + 500 / 111320, lng: t.lng, label: '自分で登録した駐車場'};
  assert.match(parkingWalkNote(t, far), /約(499|500)m（直線）.*約(199|200)m先/);
});

import {spreadBadges, groupByKey} from '../map-route.mjs';
import {groupNearby} from '../temple-marker.mjs';
import {DOJO} from '../badges.mjs';
test('番号札：近いものだけ右へずらす', () => {
  assert.deepEqual(spreadBadges([[0, 0], [5, 3], [8, 2], [100, 0]], 22), [0, 22, 44, 0]);
});
test('道場の色分け：同じ道場どうしだけまとめ、まとまりが道場をまたがない', () => {
  const dojoOf = id => DOJO.find(d => id >= d.from && id <= d.to).id;
  const project = t => [t.lng * 20, -t.lat * 20]; // 四国全体ほどの縮尺
  const mixed = groupNearby(temples, project, 48);
  assert.ok(mixed.some(g => new Set(g.map(t => dojoOf(t.id))).size > 1));
  const split = groupByKey(temples, t => dojoOf(t.id), rows => groupNearby(rows, project, 48));
  assert.ok(split.every(g => new Set(g.map(t => dojoOf(t.id))).size === 1));
  assert.equal(split.flat().length, 88);
});
