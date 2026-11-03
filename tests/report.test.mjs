// node --test tests/ で実行（Node 20以降、追加パッケージ不要）
import test from 'node:test';
import assert from 'node:assert/strict';
import {reportURL, reportReady, REPORT_FORM} from '../report.mjs';

const form = {url: 'https://docs.google.com/forms/d/e/1FAIpQLabc-DEF_123/viewform', fields: {temple: 'entry.11', item: 'entry.22', shown: 'entry.33', version: 'entry.44'}};

test('報告フォーム：事前入力つきのURL', () => {
  const u = new URL(reportURL({temple: '第12番 焼山寺', item: '駐車場の費用', shown: '駐車場：志納（500円ほど）', version: '個人テスト版 · v0.52'}, form));
  assert.equal(u.origin + u.pathname, form.url);
  assert.equal(u.searchParams.get('usp'), 'pp_url');
  assert.equal(u.searchParams.get('entry.11'), '第12番 焼山寺');
  assert.equal(u.searchParams.get('entry.22'), '駐車場の費用');
  assert.equal(u.searchParams.get('entry.44'), '個人テスト版 · v0.52');
  assert.equal(new URL(reportURL({temple: 'x'.repeat(500)}, form)).searchParams.get('entry.11').length, 300, '長すぎる文は切る');
  assert.equal(new URL(reportURL({temple: 'a', item: 'b'}, {...form, fields: {temple: 'entry.11', item: 'bad'}})).searchParams.has('bad'), false, '番号の形でない項目は入れない');
});

test('報告フォーム：Googleフォーム以外や未設定なら出さない', () => {
  assert.equal(reportReady({url: ''}), false);
  assert.equal(reportReady({url: 'https://example.com/forms/d/e/x/viewform'}), false);
  assert.equal(reportReady({url: 'http://docs.google.com/forms/d/e/x/viewform'}), false);
  assert.equal(reportURL({}, {url: ''}), '');
  assert.equal(reportReady(form), true);
  assert.equal(typeof REPORT_FORM.url, 'string');
});
