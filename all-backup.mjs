// まとめてバックアップ：記録・予定・車のデータ・設定（backup.json）と、巡礼ごとの写真ZIPを1つのZIPに入れる。
// 写真ZIPは従来の写真バックアップ（v2）と同じ形式なので、取り出して従来の方法でも復元できる。
import {makePhotoZip, crc32} from './photo-zip.mjs';

export const SETTING_PREFIXES = ['ohenro-vehicle:', 'ohenro-speed:', 'ohenro-map-style:', 'ohenro-map-overlay:', 'ohenro-theme:', 'ohenro-text-size:'];
export const SETTING_KEYS = ['ohenro-share-name'];
const fail = m => { throw new Error(m); };

// localStorage から、このアプリの設定だけを集める（バッジの既読やルート選択などの一時的な状態は含めない）。
export function collectSettings(storage, scope) {
  const out = {};
  try {
    for (const p of SETTING_PREFIXES) { const v = storage.getItem(p + scope); if (v !== null) out[p] = v; }
    for (const k of SETTING_KEYS) { const v = storage.getItem(k); if (v !== null) out[k] = v; }
  } catch {}
  return out;
}
export function applySettings(storage, scope, settings) {
  let n = 0;
  for (const [k, v] of Object.entries(settings || {})) {
    if (typeof v !== 'string' || v.length > 2000) continue;
    try {
      if (SETTING_PREFIXES.includes(k)) { storage.setItem(k + scope, v); n++; }
      else if (SETTING_KEYS.includes(k)) { storage.setItem(k, v); n++; }
    } catch {}
  }
  return n;
}

export function buildBackupJSON({records, plans = [], car = {}, settings = {}, photos = [], now = new Date()}) {
  if (!records || records.format !== 'ohenro-quest') fail('訪問記録を書き出せませんでした。');
  return JSON.stringify({format: 'ohenro-quest-all', version: 1, exportedAt: now.toISOString(), records, plans,
    car: {points: car.points || [], ratings: car.ratings || [], memos: car.memos || [], shared: car.shared || []},
    settings, photos: photos.map(({path, journeyId, journeyName, count}) => ({path, journeyId, journeyName, count}))}, null, 2);
}

export async function makeAllBackup({json, photoArchives = []}) {
  const entries = [{name: 'backup.json', blob: new Blob([json], {type: 'application/json'})}];
  for (const a of photoArchives) entries.push({name: a.path, blob: a.blob});
  return makePhotoZip(entries);
}

// 自分で作ったZIP（無圧縮）だけを読む。
export async function readAllBackup(file) {
  if (!(file instanceof Blob) || file.size < 22 || file.size > 600 * 1024 * 1024) fail('600MB以下の「まとめてバックアップ」ZIPを選んでください。');
  const dec = new TextDecoder('utf-8', {fatal: true}), entries = new Map();
  let offset = 0;
  while (offset + 4 <= file.size) {
    const sig = new DataView(await file.slice(offset, offset + 4).arrayBuffer()).getUint32(0, true);
    if (sig === 0x02014b50 || sig === 0x06054b50) break;
    if (sig !== 0x04034b50 || offset + 30 > file.size) fail('「まとめてバックアップ」のZIPではありません。');
    const h = new DataView(await file.slice(offset, offset + 30).arrayBuffer());
    const size = h.getUint32(18, true), raw = h.getUint32(22, true), n = h.getUint16(26, true), extra = h.getUint16(28, true);
    if (h.getUint16(8, true) !== 0 || size !== raw || n < 1 || n > 100 || entries.size > 60) fail('このZIPには対応していない形式のファイルがあります。');
    const start = offset + 30 + n + extra; if (start + size > file.size) fail('バックアップが途中で切れています。');
    const name = dec.decode(await file.slice(offset + 30, offset + 30 + n).arrayBuffer());
    if (!/^(backup\.json|photos\/journey-\d{4}\.zip)$/.test(name) || entries.has(name)) fail('バックアップ内のファイル名を確認できません。');
    const blob = file.slice(start, start + size, name.endsWith('.json') ? 'application/json' : 'application/zip');
    if (name === 'backup.json' && crc32(new Uint8Array(await blob.arrayBuffer())) !== h.getUint32(14, true)) fail('バックアップが壊れています。');
    entries.set(name, blob); offset = start + size;
  }
  const jsonBlob = entries.get('backup.json'); if (!jsonBlob) fail('バックアップの情報がありません。');
  let data; try { data = JSON.parse(await jsonBlob.text()); } catch { fail('バックアップの情報を読み取れません。'); }
  if (data?.format !== 'ohenro-quest-all' || data.version !== 1 || data.records?.format !== 'ohenro-quest' || !Array.isArray(data.plans) || !data.car || !Array.isArray(data.photos)) fail('お遍路クエストの「まとめてバックアップ」ではありません。');
  for (const p of data.photos) if (!entries.has(p.path)) fail('バックアップに写真ZIPが足りません。');
  return {data, photoBlob: path => entries.get(path)};
}
