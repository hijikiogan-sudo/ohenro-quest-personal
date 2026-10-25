// 設定画面の「まとめてバックアップ」：1つのZIPに保存し、1つのZIPから新しい巡礼として復元する。
import {buildBackupJSON, makeAllBackup, readAllBackup, collectSettings, applySettings} from './all-backup.mjs';
import {createPhotoArchive} from './photo-archive.mjs';
import {readPhotoZip} from './photo-zip.mjs';
import {prepareRestoredPhoto} from './photo-image.mjs';
import {readPlansJSON, exportPlans, validatePlan} from './plan-domain.mjs';
import {readParkingsJSON, exportParkings, validateSharedPack} from './car-domain.mjs';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

export function createBackupUI({document = globalThis.document, storage = globalThis.localStorage, scope, api, plans, photos, parkingStore, getJourneys, getCar, openDialog, closeDialog, getEpoch, showError, toast, afterRestore, japanDate}) {
  const $ = s => document.querySelector(s);

  async function save() {
    const epoch = openDialog('まとめてバックアップ', `<p>訪問記録・写真・行き先予定・車のデータ（駐車場・評価・車メモ・共有データ）・設定を、1つのファイルに保存します。</p><p id="all-backup-status" role="status">内容を確認しています…</p><button class="primary" id="all-backup-go" disabled>ファイルに保存する</button><p class="tiny">写真が多いとファイルが大きくなり、作成に時間がかかります（1つ4GBまで）。保存したファイルは「ファイル」アプリやiCloud Driveなど、この端末の外にも保管してください。</p>`);
    const live = () => epoch === getEpoch();
    try {
      const journeys = getJourneys(), status = await photos.status();
      if (status.needsMigration) throw new Error('写真アルバムの更新が済んでいません。先に「写真」を開いてアルバムを更新してから保存してください。');
      const counts = [];
      for (const j of journeys) counts.push((await photos.list(j.id)).length);
      if (!live()) return;
      const total = counts.reduce((a, b) => a + b, 0);
      $('#all-backup-status').textContent = `巡礼${journeys.length}件・写真${total}枚・車メモ${getCar().memos.length}件などを保存します。`;
      $('#all-backup-go').disabled = false;
      $('#all-backup-go').onclick = async e => {
        e.target.disabled = true;
        try {
          $('#all-backup-status').textContent = '記録をまとめています…';
          const records = await api('export');
          const allPlans = [];
          for (const j of journeys) allPlans.push(...await plans.list(j.id));
          const car = getCar();
          // 書き出し前に各形式の検証を通す（壊れたデータを保存しない）。
          allPlans.forEach(validatePlan);
          readParkingsJSON(exportParkings(car.points, car.ratings, car.memos));
          const archives = [];
          for (const [i, j] of journeys.entries()) {
            if (!counts[i]) continue;
            $('#all-backup-status').textContent = `写真をまとめています… ${j.name}`;
            const rows = await photos.snapshot(j.id);
            archives.push({path: `photos/journey-${String(archives.length + 1).padStart(4, '0')}.zip`, journeyId: j.id, journeyName: j.name, count: rows.length, blob: await createPhotoArchive(rows, j.name)});
          }
          if (!live()) return;
          const json = buildBackupJSON({records, plans: allPlans, car, settings: collectSettings(storage, scope), photos: archives});
          const blob = await makeAllBackup({json, photoArchives: archives});
          const url = URL.createObjectURL(blob), a = document.createElement('a');
          a.href = url; a.download = `ohenro-all-${japanDate()}.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
          await api('backup/exported', {});
          closeDialog(); await afterRestore({silent: true});
          toast(`まとめてバックアップを保存しました（${(blob.size / 1024 / 1024).toFixed(1)}MB）。保存先をご確認ください。`);
        } catch (err) { if (live()) { showError(err); e.target.disabled = false; } }
      };
    } catch (err) { if (live()) showError(err); }
  }

  async function restore(file) {
    const epoch = openDialog('まとめてバックアップから復元', '<p role="status">ファイルを確認しています…</p>');
    const live = () => epoch === getEpoch();
    try {
      const {data, photoBlob} = await readAllBackup(file);
      if (!live()) return;
      const r = data.records, car = data.car, photoCount = data.photos.reduce((n, p) => n + p.count, 0);
      $('#dialog-content').innerHTML = `<p>${esc(file.name)}（${esc(String(data.exportedAt).slice(0, 10))}保存）</p><div class="preview-list">巡礼 ${r.journeys.length}件（${r.journeys.map(j => esc(j.name)).join('、')}）<br>訪問記録 ${r.visits.length}件・写真 ${photoCount}枚・行き先予定 ${data.plans.length}件<br>駐車場 ${car.points.length}か所・評価 ${car.ratings.length}か所・車メモ ${car.memos.length}件・共有データ ${car.shared.length}件</div><label class="inline"><input type="checkbox" id="all-restore-settings" checked>設定（乗っていく車・速さ・地図・表示モード）も戻す</label><p class="small">巡礼は「（復元）」を付けた新しい巡礼として追加し、写真と予定はその巡礼に入れます。今ある記録・写真・予定は消したり上書きしたりしません。駐車場・評価は、すでに登録がある札所はそのままです。</p><p id="all-restore-status" class="small" role="status"></p><div class="dialog-actions"><button class="quiet" id="all-restore-cancel">やめる</button><button class="primary" id="all-restore-go">復元する</button></div>`;
      $('#all-restore-cancel').onclick = closeDialog;
      $('#all-restore-go').onclick = async e => {
        e.target.disabled = true; $('#all-restore-cancel').disabled = true;
        const say = t => { if (live()) $('#all-restore-status').textContent = t; };
        const done = [];
        try {
          say('訪問記録を復元しています…');
          const res = await api('import', {backup: r, restoreJourneys: true});
          const map = new Map(r.journeys.map((j, i) => [j.id, res.journeyIds[i]]));
          done.push(`訪問記録${res.added}件`);
          // 予定：元の巡礼ごとに、復元した巡礼へコピー
          let planN = 0;
          for (const [oldId, newId] of map) {
            const rows = data.plans.filter(p => p.journeyId === oldId);
            for (let i = 0; i < rows.length; i += 50) { const chunk = readPlansJSON(exportPlans(rows.slice(i, i + 50))); await plans.import(chunk, newId); planN += chunk.length; }
          }
          if (planN) done.push(`予定${planN}件`);
          // 車のデータ
          const parsed = readParkingsJSON(exportParkings(car.points, car.ratings, car.memos));
          const cr = await parkingStore.importPoints(parsed.points, parsed.ratings, parsed.memos);
          const sharedIds = new Set((await parkingStore.listShared()).map(p => p.id));
          let sharedN = 0;
          for (const pack of car.shared) { const v = validateSharedPack(pack); if (!sharedIds.has(v.id)) { await parkingStore.saveShared(v); sharedN++; } }
          done.push(`駐車場${cr.added}か所・評価${cr.ratingsAdded}か所・車メモ${cr.memosAdded}件${sharedN ? `・共有データ${sharedN}件` : ''}`);
          // 写真
          let photoN = 0, photoSkip = 0;
          if (data.photos.length) {
            if ((await photos.status()).needsMigration) done.push('写真は未復元（先にアルバムの更新が必要です）');
            else for (const p of data.photos) {
              const zip = await readPhotoZip(photoBlob(p.path)), journeyId = map.get(p.journeyId) || res.journeyIds[0];
              const prepared = [];
              for (const [i, ph] of zip.manifest.photos.entries()) {
                say(`写真を復元しています… ${p.journeyName} ${i + 1} / ${zip.manifest.photos.length}`);
                const image = await prepareRestoredPhoto(zip.entries.get(ph.path));
                prepared.push({...image, journeyId, templeId: ph.templeId, date: ph.date, caption: ph.caption, favorite: ph.favorite});
              }
              const ar = await photos.add(prepared); photoN += ar.added; photoSkip += ar.skipped;
            }
            if (photoN || photoSkip) done.push(`写真${photoN}枚${photoSkip ? `（同じ写真${photoSkip}枚は登録済み）` : ''}`);
          }
          let reload = false;
          if ($('#all-restore-settings')?.checked && applySettings(storage, scope, data.settings)) reload = true;
          closeDialog();
          await afterRestore({journeyId: res.journeyIds[0], reload});
          toast(`復元しました：${done.join('、')}。${reload ? '設定を反映するため画面を読み込み直します。' : ''}`);
        } catch (err) {
          if (live()) { showError(new Error(`${err.message}${done.length ? `（ここまでに復元：${done.join('、')}）` : ''}`)); $('#all-restore-cancel').disabled = false; }
        }
      };
    } catch (err) { if (live()) showError(err); }
  }

  return {save, restore};
}
