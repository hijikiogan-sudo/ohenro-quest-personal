// 道の難しさ（目安）：札所の駐車場までの道と、駐車場から本堂までを、普通車で行くときの4段階。
// data/road.json は霊場会の案内・自治体の案内・走った人の記録などを調べてまとめたもので、公式の格付けではない。
// 自分で走って付けた「自分の評価」とは別に出す（自分の評価は car-ui.mjs）。
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const ROAD_LEVELS = [
  {level: 0, label: 'やさしい', note: '平地や町なかの道で、駐車場もすぐ'},
  {level: 1, label: 'ふつう', note: '狭い道や短い坂が少しあるが、困るほどではない'},
  {level: 2, label: 'やや難しい', note: '狭い山道・すれ違いに気を使う区間・急坂がある'},
  {level: 3, label: '難所', note: '狭い山道が長く続き、すれ違いが難しい・急カーブが多い・冬期通行止めなど'},
];
const fail = m => { throw new Error(m); };
const urlOK = u => typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u) && u.length <= 500;

// 読み込んだデータを確かめて、札所番号 → {level, reason, sources, confidence} にする。壊れた行があれば全体を使わない。
export function readRoadData(json) {
  if (!json || json.format !== 'kuruma-henro-road' || json.version !== 1 || !Array.isArray(json.temples)) fail('道の難しさのデータを読めません。');
  const map = new Map();
  for (const r of json.temples) {
    if (!Number.isInteger(r?.id) || r.id < 1 || r.id > 88 || map.has(r.id)) fail('道の難しさのデータの札所番号を確認できません。');
    if (![0, 1, 2, 3].includes(r.level) || typeof r.reason !== 'string' || !r.reason.trim() || r.reason.length > 200) fail(`第${r.id}番の道の難しさを確認できません。`);
    if (!['high', 'medium', 'low'].includes(r.confidence)) fail(`第${r.id}番の確からしさを確認できません。`);
    if (!Array.isArray(r.sources) || !r.sources.length || r.sources.some(s => typeof s?.label !== 'string' || !s.label.trim() || s.label.length > 80 || !urlOK(s.url))) fail(`第${r.id}番の出典を確認できません。`);
    map.set(r.id, {level: r.level, reason: r.reason.trim(), sources: r.sources.map(s => ({label: s.label.trim(), url: s.url})), confidence: r.confidence});
  }
  return {checkedAt: typeof json.checkedAt === 'string' ? json.checkedAt : '', temples: map};
}

// 調べた日から1年以上たったら、画面で知らせる（道や料金は変わるため。見直しの手順は DATA-SOURCES.md）。
export const STALE_DAYS = 365;
export function isStale(checkedAt, now = Date.now()) {
  const t = Date.parse(`${checkedAt}T00:00:00+09:00`);
  return Number.isFinite(t) && now - t > STALE_DAYS * 24 * 60 * 60 * 1000;
}
export const staleHTML = (checkedAt, now) => isStale(checkedAt, now) ? `<p class="stale-note">調べてから1年以上たっています（${esc(checkedAt)}調べ）。変わっているかもしれないので、出典や現地の案内で確かめてください。</p>` : '';
export const roadLabel = level => ROAD_LEVELS[level]?.label || '';
// 札所の一覧のカードに付ける印
export const roadChipHTML = r => r ? `<span class="road-chip lv${r.level}">道：${esc(roadLabel(r.level))}</span>` : '';
// 札所の詳細「車」タブのいちばん上に出す説明
export function roadCardHTML(r, checkedAt = '', now = Date.now()) {
  if (!r) return '';
  return `<section class="road-card lv${r.level}"><div class="road-card-head"><span>道の難しさ（目安）</span><strong>${esc(roadLabel(r.level))}</strong><span class="road-meter" aria-hidden="true">${[1, 2, 3].map(n => `<i${n <= r.level ? ' class="on"' : ''}></i>`).join('')}</span></div><p>${esc(r.reason)}</p>${staleHTML(checkedAt, now)}${r.confidence === 'low' ? '<p class="tiny">調べた範囲では詳しい記録が少なく、目安の確からしさは低めです。</p>' : ''}<p class="tiny">普通車で駐車場まで行く道と、駐車場から本堂までの目安です。公式の格付けではありません。道の状態は変わるので、出発前に通行止めも確認してください。${checkedAt ? `（${esc(checkedAt)}調べ）` : ''}</p><p class="road-sources">${r.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a>`).join('')}</p></section>`;
}
