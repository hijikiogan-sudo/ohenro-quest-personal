// node --test tests/ で実行（Node 20以降、追加パッケージ不要）
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {romaji, createI18n} from '../i18n.mjs';
import {dur} from '../i18n-en.mjs';

const temples = JSON.parse(readFileSync(new URL('../data/temples.json', import.meta.url)));
const store = () => { const m = new Map(); return {getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v)}; };

test('英語表記：札所名の読みをローマ字に（長音は書かない）', () => {
  assert.deepEqual(['りょうぜんじ', 'しょうざんじ', 'たいりゅうじ', 'おおくぼじ', 'かんおんじ', 'しゅっしゃかじ', ' こんぞうじ', 'せっけいじ'].map(romaji),
    ['Ryozenji', 'Shozanji', 'Tairyuji', 'Okuboji', "Kan'onji", 'Shusshakaji', 'Konzoji', 'Sekkeiji']);
  assert.equal(romaji('こうおんじ'), 'Koonji', '香園寺：こう・おん の お は省かない');
  assert.equal(romaji('やくおうじ'), 'Yakuoji');
  assert.equal(romaji('こうのみねじ'), 'Konomineji');
  for (const t of temples) assert.match(romaji(t.kana), /^[A-Z][a-z']+$/, `${t.id} ${t.kana}`);
});

test('英語表記：辞書・札所名・数字入りの文・文ごとの置き換え', () => {
  const i = createI18n({document: null, storage: store(), temples: () => temples});
  const en = i.en;
  assert.equal(en('札所'), 'Temples');
  assert.equal(en('今からめぐる'), 'Go now');
  assert.equal(en('お経・真言'), null, '辞書に無い文言は訳さない');
  assert.equal(en('Google'), null, '日本語でなければ触らない');
  assert.equal(dur('1時間30分'), '1 h 30 min');
  assert.equal(dur('35分'), '35 min');
  assert.equal(en('約13km・約35分'), 'About 13 km · about 35 min');
  assert.equal(en('達成率 3%'), 'Progress 3%');
  assert.equal(en('焼山寺'), 'Shozanji 焼山寺');
  assert.equal(en('第12番 焼山寺'), 'No.12 Shozanji 焼山寺');
  assert.equal(en('12. 焼山寺'), '12. Shozanji 焼山寺');
  assert.equal(en('4寺の記録と写真1枚は、まだファイルに保存していません。'), '4 temple visits and 1 photo not yet saved to a file.');
  assert.equal(en('徳島県 · 第12番札所'), 'Tokushima · No.12');
  assert.equal(en('19:12ごろ着 · 35分（山道） · 受付時間外'), 'Arrive ~19:12 · 35 min (mountain) · outside hours');
  assert.match(en('直線距離×1.4をふつう（時速35km）で割った目安です。山道の札所は約1.5倍の長めに見積もっています。現在地は保存しません。'), /^Estimated from straight-line distance × 1\.4 at Normal \(35 km\/h\)\. Mountain temples .+ Your location is not saved\.$/);
});

test('英語表記：決まった形が呼び合っても止まる・2回目の画面', () => {
  const en = createI18n({document: null, storage: store(), temples: () => temples}).en;
  assert.equal(en('第3番 金泉寺、撮影日未設定'), 'No.3 Konsenji 金泉寺, No date');
  assert.equal(en('第5番 地蔵寺 → 第11番 藤井寺 …'), 'No.5 Jizoji 地蔵寺 → No.11 Fujiidera 藤井寺 …');
  assert.equal(en('2. 第2番 極楽寺へ ↗'), '2. To No.2 Gokurakuji 極楽寺 ↗');
  assert.equal(en('現在地（Googleマップで選択） → 第1番 霊山寺 → 宿（鳴門の宿）'), 'Current location (chosen in Google Maps) → No.1 Ryozenji 霊山寺 → Inn (鳴門の宿)');
  assert.equal(en('いま 3寺 · 銅 · 次は6寺（あと3）'), 'Now 3 · Bronze · next at 6 (3 to go)');
  assert.equal(en('前回の実績 1時間5分（2026-11-03・前の札所の参拝込み）'), 'Last time 1 h 5 min (2026-11-03, incl. previous visit)');
  // どんな文でも必ず終わる（止まらなくなる組み合わせが無い）
  for (const t of temples) for (const x of [`第${t.id}番 ${t.name}`, `${t.id}. ${t.name}`, `第${t.id}番 ${t.name}、${t.name}`, `${t.name} · ${t.name}`, `第${t.id}番 ${t.name}の写真の詳細`]) assert.doesNotThrow(() => en(x), x);
});
