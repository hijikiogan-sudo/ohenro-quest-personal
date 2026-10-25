// 道路の通行規制を確認するサイト。国土交通省 四国地方整備局の発表資料（2026年6月29日など）で案内されているもの。
export const ROAD_INFO_SOURCE = {label: '四国地方整備局の発表資料（2026年6月29日）', url: 'https://www.skr.mlit.go.jp/pres/new/i9856/260629douro.pdf', checkedAt: '2026-10-25'};
export const ROAD_INFO = [
  {name: '日本道路交通情報センター（JARTIC）', note: '国道・県道を含む規制・渋滞', url: 'https://www.jartic.or.jp/'},
  {name: '四国地方整備局 道路情報', note: '国が管理する国道', url: 'https://www.road-info-prvs.mlit.go.jp/roadinfo/pc/'},
  {name: 'アイハイウェイ（NEXCO西日本）', note: '四国の高速道路', url: 'https://ihighway.jp/'},
  {name: '本四高速', note: '瀬戸大橋・しまなみ海道・明石海峡大橋', url: 'https://www.jb-honshi.co.jp/customer_index/'},
];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export function roadInfoHTML({title = '出発前に通行止めを確認', compact = false} = {}) {
  return `<div class="road-info${compact ? ' compact' : ''}"><strong>${esc(title)}</strong><ul>${ROAD_INFO.map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.name)} ↗</a><small>${esc(r.note)}</small></li>`).join('')}</ul><p class="tiny">災害・工事・大雪の通行止めは、出発前と当日に確認してください。案内元：<a href="${esc(ROAD_INFO_SOURCE.url)}" target="_blank" rel="noopener noreferrer">${esc(ROAD_INFO_SOURCE.label)}</a></p></div>`;
}
