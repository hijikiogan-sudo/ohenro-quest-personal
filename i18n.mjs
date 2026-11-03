// 英語表記。画面の文言は日本語のまま作り、英語のときだけ表示中の文字を辞書で置き換える（各画面の作りは変えない）。
// 辞書に無い文言は日本語のまま出す。お経・自分で入力した文字（メモ・予定名など）は辞書に載せないので置き換わらない。
// 札所名は読みからローマ字を作り「Ryozenji 霊山寺」のように漢字を残す（現地の看板と照らし合わせられるように）。
import {DICT, PATTERNS} from './i18n-en.mjs';

const ROMAJI = {あ:'a',い:'i',う:'u',え:'e',お:'o',か:'ka',き:'ki',く:'ku',け:'ke',こ:'ko',さ:'sa',し:'shi',す:'su',せ:'se',そ:'so',た:'ta',ち:'chi',つ:'tsu',て:'te',と:'to',な:'na',に:'ni',ぬ:'nu',ね:'ne',の:'no',は:'ha',ひ:'hi',ふ:'fu',へ:'he',ほ:'ho',ま:'ma',み:'mi',む:'mu',め:'me',も:'mo',や:'ya',ゆ:'yu',よ:'yo',ら:'ra',り:'ri',る:'ru',れ:'re',ろ:'ro',わ:'wa',を:'o',が:'ga',ぎ:'gi',ぐ:'gu',げ:'ge',ご:'go',ざ:'za',じ:'ji',ず:'zu',ぜ:'ze',ぞ:'zo',だ:'da',ぢ:'ji',づ:'zu',で:'de',ど:'do',ば:'ba',び:'bi',ぶ:'bu',べ:'be',ぼ:'bo',ぱ:'pa',ぴ:'pi',ぷ:'pu',ぺ:'pe',ぽ:'po'};
const YOON = {ゃ:'a',ゅ:'u',ょ:'o'};
// ひらがなの読み → ヘボン式ローマ字（長音は書かない：りょうぜんじ → Ryozenji、おおくぼじ → Okuboji）。
export function romaji(kana) {
  const k = String(kana || '').trim();
  let out = '', double = false;
  for (let i = 0; i < k.length; i++) {
    const c = k[i], next = k[i + 1];
    if (c === 'っ') { double = true; continue; }
    if (c === 'ん') { out += /^[あいうえおやゆよ]/.test(next || '') ? "n'" : 'n'; continue; }
    let r = ROMAJI[c];
    if (!r) continue;
    if (YOON[next]) { r = (r === 'shi' ? 'sh' : r === 'chi' ? 'ch' : r === 'ji' ? 'j' : r.slice(0, -1) + 'y') + YOON[next]; i++; }
    if (double) { out += r[0] === 'c' ? 't' : r[0]; double = false; }
    out += r;
  }
  out = out.replace(/ou/g, 'o').replace(/uu/g, 'u').replace(/oo/g, 'o');
  return out.charAt(0).toUpperCase() + out.slice(1);
}

const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
const SKIP = 'script,style,[data-no-tr],.prayer-kana,.prayer-word,.sutra-text,.sutra-lines,.sutra-reading';

export function createI18n({document = globalThis.document, storage = globalThis.localStorage, scope = '', temples = () => []} = {}) {
  const key = 'ohenro-lang:' + scope;
  let lang = 'ja';
  try { lang = storage.getItem(key) === 'en' ? 'en' : 'ja'; } catch {}
  const textOrig = new WeakMap(), attrOrig = new WeakMap();
  let names = new Map(), observer = null, busy = false;

  const buildNames = () => {
    names = new Map();
    for (const t of temples()) { names.set(t.name, `${romaji(t.kana)} ${t.name}`); names.set(t.kana.trim(), romaji(t.kana)); }
  };
  // 1つの文言を英語に。辞書 → 札所名を含む決まった形 → その他の決まった形（数字入り）の順に探す。
  function en(text, split = true) {
    const s = text.trim();
    if (!s || !/[぀-ヿ一-鿿]/.test(s)) return null;
    if (Object.hasOwn(DICT, s)) return DICT[s];
    if (!names.size) buildNames();
    if (names.has(s)) return names.get(s);
    const no = s.match(/^第(\d+)番 (.+)$/);
    if (no && names.has(no[2])) return `No.${no[1]} ${names.get(no[2])}`;
    for (const [re, to] of PATTERNS) { const m = s.match(re); if (m) return typeof to === 'function' ? to(m, x => en(x) ?? x) : s.replace(re, to); }
    // 長い説明は「。」で文に分け、訳せる文だけ置き換える（全部訳せなくても、訳せた文は英語にする）。
    const parts = split ? s.split(/(?<=。)/).map(p => p.trim()).filter(Boolean) : [];
    if (parts.length > 1) { let hit = false; const out = parts.map(p => { const r = en(p, false); if (r !== null) hit = true; return r ?? p; }); if (hit) return out.join(' '); }
    return null;
  }
  const skip = el => !!el?.closest?.(SKIP);
  // 置き換えた文字は {orig: 元の日本語, out: 置き換えた文字} で覚える。今の文字が out と違えば、画面側が書き換えたので新しい元として扱う。
  function textNode(n) {
    if (skip(n.parentElement)) return;
    const saved = textOrig.get(n), base = saved && n.nodeValue === saved.out ? saved.orig : n.nodeValue;
    if (lang === 'ja') { textOrig.delete(n); if (saved && n.nodeValue === saved.out) n.nodeValue = saved.orig; return; }
    const out = en(base);
    if (out === null) { textOrig.delete(n); return; }
    const v = base.match(/^\s*/)[0] + out + base.match(/\s*$/)[0];
    textOrig.set(n, {orig: base, out: v});
    if (n.nodeValue !== v) n.nodeValue = v;
  }
  function element(el) {
    if (skip(el)) return;
    const saved = attrOrig.get(el) || {};
    for (const a of ATTRS) {
      const cur = el.getAttribute(a), prev = saved[a];
      if (cur === null) { delete saved[a]; continue; }
      const base = prev && cur === prev.out ? prev.orig : cur;
      if (lang === 'ja') { if (prev && cur === prev.out) el.setAttribute(a, prev.orig); delete saved[a]; continue; }
      const out = en(base);
      if (out === null) { delete saved[a]; continue; }
      saved[a] = {orig: base, out};
      // 同じ値を書き直すと変更の知らせが来て止まらなくなるので、違うときだけ書く。
      if (cur !== out) el.setAttribute(a, out);
    }
    if (Object.keys(saved).length) attrOrig.set(el, saved); else attrOrig.delete(el);
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { textNode(root); return; }
    if (root.nodeType !== 1) return;
    element(root);
    const w = document.createTreeWalker(root, 5);
    for (let n = w.nextNode(); n; n = w.nextNode()) n.nodeType === 3 ? textNode(n) : element(n);
  }
  function apply() {
    busy = true;
    try { document.documentElement.lang = lang; walk(document.body); const title = document.querySelector('title'); if (title) walk(title); }
    finally { busy = false; }
  }
  function start() {
    buildNames(); apply();
    observer = new MutationObserver(list => {
      if (busy || lang === 'ja') return;
      busy = true;
      try { for (const m of list) { if (m.type === 'characterData') textNode(m.target); else if (m.type === 'attributes') element(m.target); else m.addedNodes.forEach(walk); } }
      finally { busy = false; }
    });
    observer.observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS});
  }
  // 札所データを読み込んだあとに呼ぶ（札所名のローマ字を作り直して全体を置き換える）。
  function refresh() { buildNames(); apply(); }
  function set(next) { lang = next === 'en' ? 'en' : 'ja'; try { storage.setItem(key, lang); } catch {} apply(); }
  // 画面のコードから直接使う言い方（toast など、置き換えより先に文を作りたいとき）。
  const t = text => lang === 'en' ? (en(text) ?? text) : text;
  return {start, refresh, set, get lang() { return lang; }, t, en};
}
