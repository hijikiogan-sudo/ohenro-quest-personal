// node --test tests/ で実行（Node 20以降、追加パッケージ不要）
import test from 'node:test';
import assert from 'node:assert/strict';
import {saveFile, canShareFile} from '../save-file.mjs';

const blob = new Blob(['x'], {type: 'application/zip'});
const fakeDoc = () => { const clicks = []; return {clicks, createElement: () => ({click() { clicks.push(this.download); }})}; };

test('ファイルの保存：共有メニューが使えれば共有メニューで、閉じたら「やめた」と返す', async () => {
  const sent = [];
  const nav = {canShare: ({files}) => files[0].name.endsWith('.zip'), share: async d => { sent.push(d.files[0].name); }};
  const doc = fakeDoc();
  assert.equal(await saveFile(blob, 'a.zip', {nav, document: doc}), 'shared');
  assert.deepEqual(sent, ['a.zip']);
  assert.deepEqual(doc.clicks, [], '共有できたらダウンロードしない');
  const abort = {canShare: () => true, share: async () => { throw Object.assign(new Error('x'), {name: 'AbortError'}); }};
  assert.equal(await saveFile(blob, 'a.zip', {nav: abort, document: doc}), 'cancelled');
  assert.deepEqual(doc.clicks, [], '閉じたときもダウンロードしない');
});

test('ファイルの保存：共有メニューが使えない・失敗したときはダウンロード', async () => {
  const doc = fakeDoc();
  assert.equal(canShareFile(new File([blob], 'a.zip'), {}), false);
  assert.equal(await saveFile(blob, 'b.zip', {nav: {}, document: doc}), 'downloaded');
  const denied = {canShare: () => true, share: async () => { throw Object.assign(new Error('x'), {name: 'NotAllowedError'}); }};
  assert.equal(await saveFile(blob, 'c.zip', {nav: denied, document: doc}), 'downloaded');
  assert.deepEqual(doc.clicks, ['b.zip', 'c.zip']);
});
