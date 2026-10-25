// 自分で登録した駐車場地点の端末内保存。訪問記録・写真・予定とは別の保存領域。
import {validateUserParking} from './car-domain.mjs';

export function createParkingStore({indexedDB = globalThis.indexedDB, scope = '/'} = {}) {
  let db, pending;
  function open() {
    if (!indexedDB) return Promise.reject(new Error('このブラウザーでは駐車場地点を保存できません。通常のSafariで開いてください。'));
    if (db) return Promise.resolve(db);
    if (pending) return pending;
    pending = new Promise((resolve, reject) => {
      let abandoned = false;
      const r = indexedDB.open('ohenro-parking:' + scope, 1);
      r.onupgradeneeded = () => { if (abandoned) { r.transaction.abort(); return; } r.result.createObjectStore('points', {keyPath: 'templeId'}); };
      r.onsuccess = () => { if (abandoned) { r.result.close(); return; } db = r.result; db.onversionchange = () => { db.close(); db = null; pending = null; }; resolve(db); };
      r.onerror = () => { pending = null; reject(new Error('駐車場地点を読み込めません。ほかの記録は変更していません。')); };
      r.onblocked = () => { abandoned = true; pending = null; reject(new Error('ほかのタブを閉じて再読み込みしてください。')); };
    });
    return pending;
  }
  async function transact(write, run) {
    const connection = await open();
    return new Promise((resolve, reject) => {
      const tx = connection.transaction('points', write ? 'readwrite' : 'readonly'), store = tx.objectStore('points');
      let value, error;
      try { value = run(store); } catch (e) { error = e; tx.abort(); }
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(error || (tx.error?.name === 'QuotaExceededError' ? new Error('空き容量不足で駐車場地点を保存できません。') : new Error('駐車場地点を保存できません。')));
    });
  }
  async function list() {
    const connection = await open();
    return new Promise((resolve, reject) => {
      const r = connection.transaction('points', 'readonly').objectStore('points').getAll();
      r.onsuccess = () => {
        const rows = [];
        for (const p of r.result) { try { rows.push(validateUserParking(p)); } catch { /* 形式が崩れた地点は使わない（削除もしない） */ } }
        resolve(rows.sort((a, b) => a.templeId - b.templeId));
      };
      r.onerror = () => reject(new Error('駐車場地点を読み込めません。'));
    });
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
  async function importPoints(points) {
    const existing = new Set((await list()).map(p => p.templeId));
    const values = points.map(validateUserParking).filter(p => !existing.has(p.templeId));
    if (values.length) await transact(true, store => values.forEach(v => store.put(v)));
    return {added: values.length, skipped: points.length - values.length};
  }
  return {list, save, remove, importPoints};
}
