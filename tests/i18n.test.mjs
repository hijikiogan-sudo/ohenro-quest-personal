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
