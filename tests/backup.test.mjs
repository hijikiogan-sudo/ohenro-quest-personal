// node --test tests/backup.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBackupJSON, makeAllBackup, readAllBackup, collectSettings, applySettings} from '../all-backup.mjs';
import {makePhotoZip} from '../photo-zip.mjs';

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return {getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), m}; };
const records = {format: 'ohenro-quest', version: 1, exportedAt: '2026-10-25T00:00:00Z', groupName: '個人の巡礼', journeys: [{id: 'j1', name: 'はじめての巡礼'}], visits: [{journeyId: 'j1', templeId: 1, date: '2026-10-25', note: '', method: 'manual'}]};

test('設定：このアプリの設定だけを集めて戻す（バッジ既読などは含めない）', () => {
  const s = mem({'ohenro-vehicle:/': 'kei', 'ohenro-speed:/': 'slow', 'ohenro-badges-seen:/': '[]', 'ohenro-theme:/': 'dark', 'ohenro-share-name': '父', 'other': 'x'});
  const got = collectSettings(s, '/');
  assert.deepEqual(Object.keys(got).sort(), ['ohenro-share-name', 'ohenro-speed:', 'ohenro-theme:', 'ohenro-vehicle:'].sort());
  const t = mem();
  assert.equal(applySettings(t, '/app/', {...got, 'evil': 'x', 'ohenro-badges-seen:': '[]'}), 4);
  assert.equal(t.getItem('ohenro-vehicle:/app/'), 'kei');
  assert.equal(t.getItem('evil'), null);
});

test('まとめてバックアップ：1つのZIPに入れて、読み戻せる', async () => {
  const photoZip = await makePhotoZip([{name: 'manifest.json', blob: new Blob(['{}'])}]);
  const photos = [{path: 'photos/journey-0001.zip', journeyId: 'j1', journeyName: 'はじめての巡礼', count: 1, blob: photoZip}];
  const json = buildBackupJSON({records, plans: [], car: {memos: [{id: 'm'}]}, settings: {'ohenro-vehicle:': 'kei'}, photos});
  const zip = await makeAllBackup({json, photoArchives: photos});
  const {data, photoBlob} = await readAllBackup(zip);
  assert.equal(data.format, 'ohenro-quest-all');
  assert.equal(data.records.visits.length, 1);
  assert.deepEqual(data.photos, [{path: 'photos/journey-0001.zip', journeyId: 'j1', journeyName: 'はじめての巡礼', count: 1}]);
  assert.equal(data.car.memos.length, 1);
  assert.equal((await photoBlob('photos/journey-0001.zip').arrayBuffer()).byteLength, photoZip.size);
});

test('ほかのZIP・壊れたファイルは拒否する', async () => {
  const other = await makePhotoZip([{name: 'manifest.json', blob: new Blob(['{}'])}]);
  await assert.rejects(readAllBackup(other), /ファイル名|まとめて/);
  const json = buildBackupJSON({records, photos: [{path: 'photos/journey-0001.zip', journeyId: 'j1', journeyName: 'x', count: 1}]});
  const missing = await makeAllBackup({json, photoArchives: []});
  await assert.rejects(readAllBackup(missing), /写真ZIPが足りません/);
  assert.throws(() => buildBackupJSON({records: {format: 'x'}}));
});

test('写真ZIP：200枚を超えても作って読み戻せる（v0.21で上限をなくした）', async () => {
  const {readPhotoZip, blobCRC32, crc32} = await import('../photo-zip.mjs');
  const {createPhotoArchive} = await import('../photo-archive.mjs');
  const {PHOTO_LIMITS} = await import('../photo-store.mjs');
  assert.equal(PHOTO_LIMITS.count, Infinity);
  assert.equal(PHOTO_LIMITS.total, Infinity);
  const rows = [];
  for (let i = 0; i < 250; i++) {
    const bytes = new Uint8Array([0xff, 0xd8, i & 255, i >> 8, 0xff, 0xd9]);
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
    rows.push({templeId: 1 + i % 88, date: '2026-10-25', caption: '', digest, favorite: false, blob: new Blob([bytes], {type: 'image/jpeg'})});
  }
  const zip = await createPhotoArchive(rows, 'はじめての巡礼');
  const {manifest, entries} = await readPhotoZip(zip);
  assert.equal(manifest.photos.length, 250);
  assert.equal(entries.size, 251);
  const big = new Uint8Array(3 * 1024 + 7).map((_, i) => i * 31);
  assert.equal(await blobCRC32(new Blob([big]), 1024), crc32(big));
});
