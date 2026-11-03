// 道の難しさ・駐車場の費用のデータの見直し用：node scripts/check-data.mjs
// 1. 2つのデータファイルがアプリで読める形か確かめる
// 2. 調べた日から何日たったかを出す（1年以上なら見直しの時期）
// 3. 出典のURLを開いて、開けなかったものを一覧にする（--no-net で省く）
// 見直しの手順は DATA-SOURCES.md の「年に1回の見直し」。
import {readFileSync} from 'node:fs';
import {readRoadData, STALE_DAYS} from '../road-level.mjs';
import {readFeeData} from '../parking-fee.mjs';

const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));
const files = [['data/road.json', readRoadData, '道の難しさ'], ['data/parking-fee.json', readFeeData, '駐車場の費用']];
const days = d => Math.floor((Date.now() - Date.parse(`${d}T00:00:00+09:00`)) / 86400000);
let problems = 0;
const urls = new Map();
for (const [path, read, name] of files) {
  try {
    const {checkedAt, temples} = read(load(path));
    const age = days(checkedAt);
    console.log(`${name}（${path}）：${temples.size}寺、${checkedAt}調べ（${age}日前）${age > STALE_DAYS ? ' ← 見直しの時期です' : ''}`);
    const low = [...temples].filter(([, r]) => r.confidence === 'low').map(([id]) => id);
    if (low.length) console.log(`  確からしさが低い札所：${low.join('・')}番`);
    if (temples.size !== 88) { problems++; console.log('  88寺そろっていません。'); }
    for (const [id, r] of temples) for (const s of r.sources) urls.set(s.url, [...(urls.get(s.url) || []), `${id}番`]);
  } catch (e) { problems++; console.log(`${name}（${path}）：読めません。${e.message}`); }
}
if (!process.argv.includes('--no-net')) {
  console.log(`\n出典のURL ${urls.size}件を確かめています…`);
  const bad = [];
  const list = [...urls.keys()];
  for (let i = 0; i < list.length; i += 8) {
    await Promise.all(list.slice(i, i + 8).map(async u => {
      try {
        const r = await fetch(u, {redirect: 'follow', signal: AbortSignal.timeout(15000), headers: {'user-agent': 'Mozilla/5.0'}});
        if (!r.ok) bad.push(`${r.status} ${u}（${urls.get(u).join('・')}）`);
      } catch (e) { bad.push(`開けない ${u}（${urls.get(u).join('・')}）`); }
    }));
  }
  console.log(bad.length ? `開けなかった出典 ${bad.length}件（4travel などは自動の確認を受け付けないので、ブラウザーで開いて確かめる）：\n  ${bad.join('\n  ')}` : 'すべての出典を開けました。');
}
process.exitCode = problems ? 1 : 0;
