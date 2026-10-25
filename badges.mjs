// バッジ（段階式：銅→銀→金）。DOMに依存しない純粋関数。
// 札所の巡りに関するものは「いま選んでいる巡礼」、記録の積み重ねに関するものは全巡礼で数える。

export const TIER_NAMES = ['銅', '銀', '金'];

// 四国の四つの道場（札所番号の区分。所在地の県別集計とは別）。
export const DOJO = [
  {id: 'hosshin', seal: '発', name: '発心の道場', area: '阿波', from: 1, to: 23},
  {id: 'shugyo', seal: '修', name: '修行の道場', area: '土佐', from: 24, to: 39},
  {id: 'bodai', seal: '菩', name: '菩提の道場', area: '伊予', from: 40, to: 65},
  {id: 'nehan', seal: '涅', name: '涅槃の道場', area: '讃岐', from: 66, to: 88},
];

const live = visits => visits.filter(v => !v.deletedAt);
const seasonOf = date => { const m = Number(date.slice(5, 7)); return m >= 3 && m <= 5 ? '春' : m >= 6 && m <= 8 ? '夏' : m >= 9 && m <= 11 ? '秋' : '冬'; };

function longestRun(ids) {
  let best = 0, run = 0;
  for (let n = 1; n <= 88; n++) { run = ids.has(n) ? run + 1 : 0; best = Math.max(best, run); }
  return best;
}

// 各バッジ：goals は段階ごとの目標値（1〜3段階）。value は現在の値。
export function computeBadges({visits = [], journeyId = '', carData = null, ratings = new Map(), parkings = [], memos = [], sharedCount = 0, photoCount = null} = {}) {
  const all = live(visits), mine = all.filter(v => v.journeyId === journeyId);
  const ids = new Set(mine.map(v => v.templeId));
  const perDay = new Map();
  // まとめて手動登録した過去の訪問で水増しされないよう、一日の最多はGPSチェックインだけで数える。
  for (const v of mine) if (v.date && v.method === 'gps-self-reported') { const s = perDay.get(v.date) || new Set(); s.add(v.templeId); perDay.set(v.date, s); }
  const maxDay = Math.max(0, ...[...perDay.values()].map(s => s.size));
  const seasons = new Set(all.filter(v => v.date).map(v => seasonOf(v.date)));
  const gps = all.filter(v => v.method === 'gps-self-reported').length;
  const byJourney = new Map();
  for (const v of all) { const s = byJourney.get(v.journeyId) || new Set(); s.add(v.templeId); byJourney.set(v.journeyId, s); }
  const laps = [...byJourney.values()].filter(s => s.size >= 88).length;
  const ropeway = [21, 66].filter(id => ids.has(id)).length;
  const closureTemples = (carData?.temples || []).filter(t => t.closure).map(t => t.id);
  const visitedEver = new Set(all.map(v => v.templeId));
  const hard = [...ratings].filter(([id, level]) => level >= 2 && visitedEver.has(id)).length;

  const defs = [
    {id: 'first', group: '巡礼の歩み', seal: '初', name: 'はじめの一歩', goals: [1], value: ids.size, unit: '寺', how: '最初の札所を記録する'},
    {id: 'steps', group: '巡礼の歩み', seal: '歩', name: '巡礼の歩み', goals: [10, 44, 88], value: ids.size, unit: '寺', how: 'この巡礼でめぐった札所の数'},
    ...DOJO.map(d => {
      const total = d.to - d.from + 1, n = [...ids].filter(id => id >= d.from && id <= d.to).length;
      return {id: 'dojo-' + d.id, group: '四つの道場', seal: d.seal, name: d.name, goals: [1, Math.ceil(total / 2), total], value: n, unit: '寺', how: `${d.area}（${d.from}〜${d.to}番）をめぐる。1寺・半分・すべて`};
    }),
    {id: 'kechigan', group: '巡礼の歩み', seal: '願', name: '結願', goals: [88], value: ids.size, unit: '寺', how: 'この巡礼で八十八ヶ所すべてをめぐる'},
    {id: 'day', group: '巡礼の歩み', seal: '日', name: '一日の巡礼', goals: [3, 6, 10], value: maxDay, unit: '寺', how: '同じ日にGPSチェックインした札所の最多数（この巡礼）'},
    {id: 'run', group: '巡礼の歩み', seal: '連', name: '番号つなぎ', goals: [5, 15, 30], value: longestRun(ids), unit: '寺', how: '番号が続けてそろった札所の最長（例：1〜5番）'},
    {id: 'laps', group: '巡礼の歩み', seal: '巡', name: '重ねる巡礼', goals: [1, 2, 4], value: laps, unit: '周', how: '結願した巡礼の数（全巡礼）'},
    {id: 'gps', group: '記録', seal: '証', name: '現地の証', goals: [1, 20, 88], value: gps, unit: '回', how: '本堂の近くでGPSチェックインした回数（全巡礼）'},
    {id: 'seasons', group: '記録', seal: '季', name: '四季の遍路', goals: [2, 3, 4], value: seasons.size, unit: '季節', how: '春・夏・秋・冬のうち、参拝した季節の数（全巡礼）'},
    ...(photoCount === null ? [] : [{id: 'photos', group: '記録', seal: '写', name: '旅の写真', goals: [1, 30, 100], value: photoCount, unit: '枚', how: 'この端末に保存した写真の枚数'}]),
    {id: 'ropeway', group: '車遍路', seal: '索', name: 'ロープウェイの札所', goals: [1, 2], value: ropeway, unit: '寺', how: '太龍寺（21番）・雲辺寺（66番）をめぐる（この巡礼）'},
    {id: 'rindo', group: '車遍路', seal: '林', name: '季節の林道', goals: [Math.max(1, closureTemples.length)], value: closureTemples.filter(id => ids.has(id)).length, unit: '寺', how: '冬期に通行止めがある札所（横峰寺）をめぐる（この巡礼）'},
    {id: 'hard', group: '車遍路', seal: '険', name: '難所越え', goals: [1, 5, 15], value: hard, unit: '寺', how: '自分の評価が「注意」以上で、訪れたことのある札所の数'},
    {id: 'parking', group: '車遍路', seal: '駐', name: '駐車場の地図', goals: [1, 10, 30], value: parkings.length, unit: 'か所', how: '駐車場の位置を登録した札所の数'},
    {id: 'memo', group: '車遍路', seal: '記', name: '車メモ', goals: [1, 20, 88], value: memos.length, unit: '件', how: '車メモを書いた数'},
    {id: 'share', group: '車遍路', seal: '友', name: '道しるべの仲間', goals: [1, 3], value: sharedCount, unit: '人', how: '家族・友人から共有ファイルを受け取った数'},
  ];
  return defs.map(d => {
    const tier = d.goals.filter(g => d.value >= g).length;
    const max = d.goals.length, next = tier < max ? d.goals[tier] : null;
    const prev = tier ? d.goals[tier - 1] : 0;
    const progress = next === null ? 1 : Math.max(0, Math.min(1, (d.value - prev) / (next - prev)));
    // 段階名：1段階だけのものは金、2段階は銀→金、3段階は銅→銀→金
    const tierName = tier ? TIER_NAMES[3 - max + tier - 1] : '';
    return {...d, tier, max, next, progress, tierName, earned: tier > 0, complete: tier === max};
  });
}

export const tierKeys = badges => badges.flatMap(b => Array.from({length: b.tier}, (_, i) => `${b.id}:${i + 1}`));

// 前回見たときから新しく到達した段階。
export function newlyEarned(badges, seenKeys) {
  const seen = new Set(seenKeys);
  return badges.filter(b => b.tier && !seen.has(`${b.id}:${b.tier}`)).map(b => ({id: b.id, name: b.name, tierName: b.tierName}));
}

export function badgeSummary(badges) {
  return {earnedTiers: badges.reduce((n, b) => n + b.tier, 0), totalTiers: badges.reduce((n, b) => n + b.max, 0), earnedBadges: badges.filter(b => b.earned).length, totalBadges: badges.length};
}

// ホームに出す数個：あと少しで次の段階に届くもの → 最近の高い段階のもの。
export function featuredBadges(badges, n = 6) {
  const close = badges.filter(b => !b.complete).sort((a, b) => b.progress - a.progress || a.next - b.next).slice(0, Math.ceil(n / 2));
  const done = badges.filter(b => b.earned && !close.includes(b)).sort((a, b) => (b.tier / b.max) - (a.tier / a.max) || b.tier - a.tier);
  return [...close, ...done, ...badges.filter(b => !close.includes(b) && !done.includes(b))].slice(0, n);
}

// XP：1寺100XP（従来どおり）に、バッジの段階1つにつき50XPを足す。レベルは500XPごと。
export const XP_PER_TIER = 50;
export function totalXp(templeXp, badges) { return templeXp + XP_PER_TIER * badges.reduce((n, b) => n + b.tier, 0); }
export const levelFor = xp => 1 + Math.floor(xp / 500);
