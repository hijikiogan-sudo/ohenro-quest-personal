// 出典とライセンスの一覧（アプリ内の1画面）。App Store版でも同じ内容を表示する。
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const CREDITS = [
  {group: '地図', items: [
    {name: '地理院タイル（国土地理院）', use: '地図（淡色・標準）と航空写真。表示するときに読み込み、保存しません', url: 'https://maps.gsi.go.jp/development/ichiran.html'},
    {name: 'Natural Earth', use: '全体図の海岸線（パブリックドメイン）', url: 'https://www.naturalearthdata.com/about/terms-of-use/'},
  ]},
  {group: '札所の情報', items: [
    {name: '一般社団法人 四国八十八ヶ所霊場会', use: '札所の名称・所在地・本尊と真言・駐車場など車の情報（2026年10月確認）', url: 'https://88shikokuhenro.jp/shikoku88/'},
    {name: '四国遍路日本遺産協議会「聖地巡礼 四国遍路」', use: '札所の緯度・経度（公開地図のマーカー座標）', url: 'https://www.seichijunrei-shikokuhenro.jp/map/'},
  ]},
  {group: 'お経', items: [
    {name: '瀧谷不動明王寺「ご家庭でのお祈り」', use: '般若心経の本文と読み', url: 'https://takidanifudouson.or.jp/prayer/home/'},
    {name: '高野山真言宗 総本山金剛峯寺', use: 'ご宝号の本文と読み', url: 'https://www.koyasan.or.jp/experience/'},
    {name: '四国八十八ヶ所霊場会「お勤めの仕方」', use: '勤行の扱い・大師堂で本尊真言を省く案内', url: 'https://88shikokuhenro.jp/basic/reading/'},
    {name: '四国八十八ヶ所霊場会「お遍路の心得」', use: '納経の受付時間（基本的に8時〜17時）', url: 'https://88shikokuhenro.jp/basic/ohenro-no-kokoroe/'},
  ]},
  {group: '道路の情報', items: [
    {name: '国土交通省 四国地方整備局', use: '道路情報の確認先として案内されているサイトの一覧', url: 'https://www.skr.mlit.go.jp/pres/new/i9856/260629douro.pdf'},
  ]},
];
export const LEAFLET_LICENSE = `BSD 2-Clause License

Copyright (c) 2010-2023, Volodymyr Agafonkin
Copyright (c) 2010-2011, CloudMade
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`;
export function creditsHTML() {
  return `${CREDITS.map(g => `<h3 class="credit-group">${esc(g.group)}</h3><ul class="credit-list">${g.items.map(i => `<li><a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${esc(i.name)} ↗</a><small>${esc(i.use)}</small></li>`).join('')}</ul>`).join('')}<h3 class="credit-group">ソフトウェア</h3><ul class="credit-list"><li><span>Leaflet 1.9.4</span><small>地図の表示（BSD 2-Clause License）</small></li></ul><details><summary>Leafletのライセンス全文</summary><pre class="credit-license">${esc(LEAFLET_LICENSE)}</pre></details><p class="tiny">寺院の紹介文・写真・御詠歌・音声は収録していません。各寺院の案内やお手元の経本もご確認ください。</p>`;
}
// App Store版（Capacitor）などアプリの中で動いているか。
export function isNativeApp(win = globalThis.window) {
  try { return !!win.Capacitor?.isNativePlatform?.() || /^(capacitor|ionic):$/.test(win.location.protocol); } catch { return false; }
}
