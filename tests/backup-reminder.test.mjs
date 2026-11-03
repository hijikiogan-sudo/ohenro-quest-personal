// node --test tests/ で実行（Node 20以降、追加パッケージ不要）
import test from 'node:test';
import assert from 'node:assert/strict';
import {backupReminder, reminderText} from '../backup-reminder.mjs';

const DAY = 24 * 60 * 60 * 1000, now = Date.UTC(2026, 10, 20);
const v = at => ({createdAt: at});

test('バックアップのお知らせ：保存していない記録があるときだけ出す', () => {
  assert.equal(backupReminder({now}), null, '記録が無ければ出さない');
  assert.equal(backupReminder({visits: [v(now)], now})?.reason, 'never');
  assert.equal(backupReminder({lastExportAt: now - DAY, visits: [v(now - 2 * DAY)], now: now + 30 * DAY}), null, '保存の後に増えていなければ出さない');
  assert.equal(backupReminder({lastExportAt: now - 3 * DAY, visits: [v(now - DAY)], now}), null, '保存から日が浅ければ出さない');
  const stale = backupReminder({lastExportAt: now - 15 * DAY, visits: [v(now - DAY), v(now - 20 * DAY)], photos: [v(now - DAY)], now});
  assert.deepEqual(stale, {reason: 'stale', days: 15, newVisits: 1, newPhotos: 1});
  assert.equal(backupReminder({lastExportAt: now - 2 * DAY, visits: [v(now - DAY)], endedAt: now - DAY, now})?.reason, 'ended', '巡礼を終えたら日が浅くても出す');
  assert.equal(backupReminder({lastExportAt: now - 2 * DAY, visits: [v(now - DAY)], endedAt: now - 3 * DAY, now}), null, '保存より前に終えた巡礼では出さない');
  assert.equal(backupReminder({visits: [v(now)], snoozedUntil: now + DAY, now}), null, '「あとで」の間は出さない');
});

test('バックアップのお知らせ：文言', () => {
  assert.match(reminderText({reason: 'never', newVisits: 3, newPhotos: 0}).body, /^3寺の記録は、まだファイルに保存していません。/);
  const t = reminderText({reason: 'stale', days: 20, newVisits: 2, newPhotos: 5});
  assert.equal(t.head, '前回のバックアップから20日たちました');
  assert.match(t.body, /前回のあとに2寺の記録と写真5枚が増えています/);
});
