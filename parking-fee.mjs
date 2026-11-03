// 駐車場の費用：札所ごとの普通車の駐車料金（無料・有料・志納・寺の駐車場なし・不明）と、林道の通行料・ロープウェイなどほかにかかる車の費用。
// data/parking-fee.json は霊場会の案内・寺や自治体の案内・車遍路の案内・走った人の記録を調べてまとめたもの。料金は変わることがある。
import {staleHTML} from './road-level.mjs';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const FEE_TYPES = {free: '無料', paid: '有料', donation: '志納', none: '寺の駐車場なし', unknown: '料金不明'};
const fail = m => { throw new Error(m); };
const urlOK = u => typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u) && u.length <= 500;
const text = (v, max) => typeof v === 'string' && v.length <= max;

export function readFeeData(json) {
  if (!json || json.format !== 'kuruma-henro-parking-fee' || json.version !== 1 || !Array.isArray(json.temples)) fail('駐車場の費用のデータを読めません。');
  const map = new Map();
  for (const r of json.temples) {
    if (!Number.isInteger(r?.id) || r.id < 1 || r.id > 88 || map.has(r.id)) fail('駐車場の費用のデータの札所番号を確認できません。');
    if (!Object.hasOwn(FEE_TYPES, r.fee)) fail(`第${r.id}番の駐車場の種類を確認できません。`);
    if (r.yen !== null && (!Number.isInteger(r.yen) || r.yen < 0 || r.yen > 10000)) fail(`第${r.id}番の金額を確認できません。`);
    if (r.fee === 'free' && r.yen) fail(`第${r.id}番は無料なのに金額があります。`);
    if (!text(r.detail, 200) || !r.detail.trim() || !text(r.extra ?? '', 200)) fail(`第${r.id}番の説明を確認できません。`);
    if (!['high', 'medium', 'low'].includes(r.confidence)) fail(`第${r.id}番の確からしさを確認できません。`);
    if (!Array.isArray(r.sources) || !r.sources.length || r.sources.some(s => !text(s?.label, 80) || !s.label.trim() || !urlOK(s.url))) fail(`第${r.id}番の出典を確認できません。`);
    map.set(r.id, {fee: r.fee, yen: r.yen, detail: r.detail.trim(), extra: (r.extra || '').trim(), sources: r.sources.map(s => ({label: s.label.trim(), url: s.url})), confidence: r.confidence});
  }
  return {checkedAt: typeof json.checkedAt === 'string' ? json.checkedAt : '', temples: map};
}

// 「無料」「300円」「志納」「寺の駐車場なし」など、短い言い方
export function feeShort(f) {
  if (!f) return '';
  if (f.fee === 'paid') return f.yen ? `${f.yen.toLocaleString('ja-JP')}円` : '有料';
  if (f.fee === 'donation') return f.yen ? `志納（${f.yen.toLocaleString('ja-JP')}円ほど）` : '志納';
  if (f.fee === 'none' && f.yen) return `近くの駐車場${f.yen.toLocaleString('ja-JP')}円`;
  return FEE_TYPES[f.fee];
}
export const feeChipHTML = f => f ? `<span class="fee-chip ${f.fee}${f.own ? ' own' : ''}">駐車場：${esc(feeShort(f))}${f.own ? '（自分の記録）' : ''}</span>` : '';
export function feeCardHTML(f, checkedAt = '', {local = null, now = Date.now()} = {}) {
  if (!f) return '';
  const mine = local ? `<div class="fee-own"><strong>自分の記録：${esc(feeShort(local))}</strong><span>${esc(local.date)}${local.note ? ` · ${esc(local.note)}` : ''}</span><button type="button" class="text-button" id="fee-local-clear">記録を消す</button></div>` : '';
  return `<section class="fee-card"><div class="road-card-head"><span>駐車場の費用（普通車）</span><strong>${esc(feeShort(f))}</strong></div>${mine}<p>${esc(f.detail)}</p>${f.extra ? `<p class="fee-extra">ほかにかかる費用：${esc(f.extra)}</p>` : ''}${f.confidence === 'low' ? '<p class="tiny">調べた範囲では新しい記録が少なく、料金の確からしさは低めです。</p>' : ''}${staleHTML(checkedAt, now)}<p class="tiny">料金は変わることがあります。現地の案内に従ってください。${checkedAt ? `（${esc(checkedAt)}調べ）` : ''}</p><p class="road-sources">${f.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a>`).join('')}</p><button type="button" class="secondary fee-local-btn" id="fee-local-btn">${local ? '現地の料金を記録し直す' : '現地で払った料金を記録'}</button><p class="tiny">記録すると、この端末では自分の記録を優先して出します。次の見直しのときにも使えます。</p></section>`;
}
// 予定の札所の駐車場代の合計（分かっている金額だけ）と、金額が分からない札所の数
export function feeTotal(ids, temples) {
  let yen = 0, unknown = 0, free = 0, donation = 0;
  for (const id of new Set(ids)) {
    const f = temples.get(id);
    if (!f || f.fee === 'unknown' || ((f.fee === 'paid' || f.fee === 'none') && !f.yen)) unknown++;
    else if (f.fee === 'free') free++;
    else if (f.fee === 'donation' && !f.yen) donation++;
    else yen += f.yen || 0;
  }
  return {yen, unknown, free, donation};
}

// 現地で払った料金の記録（この端末だけ。まとめてバックアップの設定に入る）。調べた料金より優先して出す。
const LOCAL_MAX = 88;
export function readLocalFees(raw) {
  const out = new Map();
  try {
    const obj = JSON.parse(raw || '{}');
    for (const [k, v] of Object.entries(obj)) {
      const id = Number(k);
      if (!Number.isInteger(id) || id < 1 || id > 88 || !['free', 'paid', 'donation'].includes(v?.fee)) continue;
      if (v.yen !== null && (!Number.isInteger(v.yen) || v.yen < 0 || v.yen > 10000)) continue;
      if (typeof v.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) continue;
      out.set(id, {fee: v.fee, yen: v.fee === 'free' ? null : v.yen, date: v.date, note: typeof v.note === 'string' ? v.note.slice(0, 60) : ''});
    }
  } catch {}
  return out;
}
export const writeLocalFees = map => JSON.stringify(Object.fromEntries([...map].slice(0, LOCAL_MAX)));
// 自分の記録があれば、それを使った表示用の値（own: true）にする
export function withLocal(f, local) {
  if (!local) return f;
  return {...(f || {sources: [], detail: '', extra: '', confidence: 'medium'}), fee: local.fee, yen: local.yen, own: true};
}
// 調べた料金と自分の記録が違う札所（見直しに使う）
export function localDiffs(official, locals) {
  return [...locals].map(([id, l]) => ({id, local: l, official: official.get(id) || null})).filter(x => !x.official || x.official.fee !== x.local.fee || (x.official.yen ?? null) !== (x.local.yen ?? null)).sort((a, b) => a.id - b.id);
}
