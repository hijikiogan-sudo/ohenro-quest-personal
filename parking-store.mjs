// 自分で登録した駐車場地点の端末内保存。訪問記録・写真・予定とは別の保存領域。
import {validateUserParking, validateRating, validateMemo} from './car-domain.mjs';

export function createParkingStore({indexedDB = globalThis.indexedDB, scope = '/'} = {}) {
  let db, pending;
  function open() {
    if (!indexedDB) return Promise.reject(new Error('このブラウザーでは駐車場地点を保存できません。通常のSafariで開いてください。'));
    if (db) return Promise.resolve(db);
    if (pending) return pending;
    pending = new Promise((resolve, reject) => {
      let abandoned = false;
      const r = indexedDB.open('ohenro-parking:' + scope, 3);
      r.onupgradeneeded = () => { if (abandoned) { r.transaction.abort(); return; } const names = r.result.objectStoreNames; if (!names.contains('points')) r.result.createObjectStore('points', {keyPath: 'templeId'}); if (!names.contains('ratings')) r.result.createObjectStore('ratings', {keyPath: 'templeId'}); if (!names.contains('memos')) r.result.createObjectStore('memos', {keyPath: 'id'}); };
      r.onsuccess = () => { if (abandoned) { r.result.close(); return; } db = r.result; db.onversionchange = () => { db.close(); db = null; pending = null; }; resolve(db); };
      r.onerror = () => { pending = null; reject(new Error('駐車場地点を読み込めません。ほかの記録は変更していません。')); };
      r.onblocked = () => { abandoned = true; pending = null; reject(new Error('ほかのタブを閉じて再読み込みしてください。')); };
    });
    return pending;
  }
  async function transact(write, run, name = 'points') {
    const connection = await open();
    return new Promise((resolve, reject) => {
      const tx = connection.transaction(name, write ? 'readwrite' : 'readonly'), store = tx.objectStore(name);
      let value, error;
      try { value = run(store); } catch (e) { error = e; tx.abort(); }
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(error || (tx.error?.name === 'QuotaExceededError' ? new Error('空き容量不足で駐車場地点を保存できません。') : new Error('駐車場地点を保存できません。')));
    });
  }
  async function readAll(name, validate) {
    const connection = await open();
    return new Promise((resolve, reject) => {
      const r = connection.transaction(name, 'readonly').objectStore(name).getAll();
      r.onsuccess = () => {
        const rows = [];
        for (const p of r.result) { try { rows.push(validate(p)); } catch { /* 形式が崩れた行は使わない（削除もしない） */ } }
        resolve(rows.sort((a, b) => a.templeId - b.templeId));
      };
      r.onerror = () => reject(new Error('駐車場地点を読み込めません。'));
    });
  }
  const list = () => readAll('points', validateUserParking);
  const listRatings = () => readAll('ratings', validateRating);
  const listMemos = async () => (await readAll('memos', validateMemo)).sort((a, b) => b.date.localeCompare(a.date) || b.savedAt - a.savedAt);
  async function saveMemo(memo) {
    const value = validateMemo(memo);
    if ((await listMemos()).filter(m => m.id !== value.id).length >= 5000) throw new Error('車メモは5000件までです。古いメモを整理してください。');
    await transact(true, store => store.put(value), 'memos');
    return value;
  }
  async function removeMemo(id) {
    if (typeof id !== 'string' || !id) throw new Error('車メモを確認できません。');
    await transact(true, store => store.delete(id), 'memos');
  }
  async function saveRating(rating) {
    const value = validateRating(rating);
    await transact(true, store => store.put(value), 'ratings');
    return value;
  }
  async function removeRating(templeId) {
    if (!Number.isInteger(templeId)) throw new Error('札所を確認できません。');
    await transact(true, store => store.delete(templeId), 'ratings');
  }
  async function save(point) {
    const value = validateUserParking(point);
    await transact(true, store => store.put(value));
    return value;
  }
  async function remove(templeId) {
    if (!Number.isInteger(templeId)) throw new Error('札所を確認できません。');
    await transact(true, store => store.delete(templeId));
  }
  // 復元は追加のみ。すでに登録がある札所は上書きしない。
  async function importPoints(points, ratings = [], memos = []) {
    const memoIds = new Set((await listMemos()).map(m => m.id));
    const mValues = memos.map(validateMemo).filter(m => !memoIds.has(m.id));
    if (mValues.length) await transact(true, store => mValues.forEach(v => store.put(v)), 'memos');
    const existing = new Set((await list()).map(p => p.templeId)), rated = new Set((await listRatings()).map(r => r.templeId));
    const values = points.map(validateUserParking).filter(p => !existing.has(p.templeId));
    const rValues = ratings.map(validateRating).filter(r => !rated.has(r.templeId));
    if (values.length) await transact(true, store => values.forEach(v => store.put(v)));
    if (rValues.length) await transact(true, store => rValues.forEach(v => store.put(v)), 'ratings');
    return {added: values.length, skipped: points.length - values.length, ratingsAdded: rValues.length, ratingsSkipped: ratings.length - rValues.length, memosAdded: mValues.length, memosSkipped: memos.length - mValues.length};
  }
  return {list, save, remove, importPoints, listRatings, saveRating, removeRating, listMemos, saveMemo, removeMemo};
}
