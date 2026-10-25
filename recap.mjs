// 振り返りカード：今日／この巡礼の記録を1枚の画像（1080×1350）にする。外部への送信はしない。
import {DOJO} from './badges.mjs';

export const RECAP_W = 1080, RECAP_H = 1350;

// 画像に描く内容（純粋関数。テスト用に描画と分ける）。
export function recapData({mode, journeyName, temples, visits, badges, date}) {
  const live = visits.filter(v => !v.deletedAt);
  const ids = new Set(live.map(v => v.templeId));
  const todayIds = [...new Set(live.filter(v => v.date === date).map(v => v.templeId))].sort((a, b) => a - b);
  const name = id => temples.find(t => t.id === id)?.name || '';
  const earned = badges.filter(b => b.earned).sort((a, b) => (b.tier / b.max) - (a.tier / a.max) || b.tier - a.tier);
  return {
    mode, journeyName, date,
    headline: mode === 'today' ? `${todayIds.length}寺` : `${ids.size} / 88寺`,
    sub: mode === 'today' ? '今日めぐった札所' : 'この巡礼でめぐった札所',
    list: mode === 'today' ? todayIds.map(id => `第${id}番 ${name(id)}`) : [],
    dojo: DOJO.map(d => ({name: d.name, seal: d.seal, done: [...ids].filter(id => id >= d.from && id <= d.to).length, total: d.to - d.from + 1})),
    tiers: badges.reduce((n, b) => n + b.tier, 0), totalTiers: badges.reduce((n, b) => n + b.max, 0),
    seals: earned.slice(0, 6).map(b => ({seal: b.seal, name: b.name, tier: 3 - b.max + b.tier})),
  };
}

const COLORS = {bg: '#f3f7f6', ink: '#173b4c', muted: '#5b7180', line: '#d5e2e6', accent: '#0f7d8c', paper: '#ffffff', tiers: ['#b7c3c9', '#a8683a', '#7f8f9c', '#c08f1e']};
const FONT = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",sans-serif';
const SERIF = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif';

export function drawRecap(ctx, d) {
  const W = RECAP_W, H = RECAP_H, c = COLORS;
  ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = c.paper; roundRect(ctx, 60, 60, W - 120, H - 120, 40); ctx.fill();
  ctx.textBaseline = 'alphabetic'; ctx.fillStyle = c.accent; ctx.font = `700 34px ${FONT}`;
  ctx.fillText('お遍路クエスト · 振り返り', 120, 160);
  ctx.fillStyle = c.muted; ctx.font = `500 30px ${FONT}`;
  ctx.fillText(`${d.journeyName} · ${d.date}`, 120, 210);
  ctx.fillStyle = c.ink; ctx.font = `800 150px ${SERIF}`; ctx.fillText(d.headline, 120, 390);
  ctx.fillStyle = c.muted; ctx.font = `500 34px ${FONT}`; ctx.fillText(d.sub, 124, 445);
  let y = 520;
  if (d.mode === 'today') {
    ctx.fillStyle = c.ink; ctx.font = `600 36px ${FONT}`;
    const shown = d.list.slice(0, 8);
    shown.forEach((line, i) => ctx.fillText(line, 124, y + i * 56));
    if (d.list.length > shown.length) { ctx.fillStyle = c.muted; ctx.font = `500 30px ${FONT}`; ctx.fillText(`ほか${d.list.length - shown.length}寺`, 124, y + shown.length * 56); }
    y += Math.max(1, shown.length + (d.list.length > shown.length ? 1 : 0)) * 56 + 30;
    if (!d.list.length) { ctx.fillStyle = c.muted; ctx.font = `500 32px ${FONT}`; ctx.fillText('今日の記録はまだありません', 124, 520); y = 600; }
  } else {
    for (const g of d.dojo) {
      ctx.fillStyle = c.ink; ctx.font = `600 34px ${FONT}`; ctx.fillText(g.name, 124, y);
      ctx.fillStyle = c.muted; ctx.font = `500 30px ${FONT}`; const label = `${g.done} / ${g.total}`; ctx.fillText(label, W - 124 - ctx.measureText(label).width, y);
      ctx.fillStyle = c.line; roundRect(ctx, 124, y + 18, W - 248, 16, 8); ctx.fill();
      ctx.fillStyle = c.accent; if (g.done) { roundRect(ctx, 124, y + 18, (W - 248) * g.done / g.total, 16, 8); ctx.fill(); }
      y += 100;
    }
  }
  y = Math.max(y, 960);
  ctx.strokeStyle = c.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(120, y - 40); ctx.lineTo(W - 120, y - 40); ctx.stroke();
  ctx.fillStyle = c.ink; ctx.font = `700 32px ${FONT}`; ctx.fillText(`旅のしるし ${d.tiers} / ${d.totalTiers} 段階`, 120, y + 10);
  d.seals.forEach((s, i) => {
    const cx = 170 + i * 150, cy = y + 120, color = c.tiers[s.tier] || c.tiers[0];
    ctx.beginPath(); ctx.arc(cx, cy, 52, 0, Math.PI * 2); ctx.fillStyle = c.paper; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = color; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 42, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = color; ctx.font = `800 44px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s.seal, cx, cy + 2);
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  });
  if (!d.seals.length) { ctx.fillStyle = c.muted; ctx.font = `500 30px ${FONT}`; ctx.fillText('最初の札所を記録するとバッジが付きます', 120, y + 130); }
  ctx.fillStyle = c.muted; ctx.font = `500 26px ${FONT}`; ctx.fillText('四国八十八ヶ所 · 車でめぐる記録', 120, H - 110);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
