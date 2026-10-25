// 札所詳細の「車でのアクセス」カード、駐車場地点の登録・解除、設定画面のバックアップ。
import {assessParkingRegistration, carInfoFor, exportParkings, readParkingsJSON, PARKING_RADIUS, PARKING_REGISTER_MAX_ACCURACY, RATINGS, VEHICLES, vehicleBlocked, vehicleLabel, carFlags} from './car-domain.mjs';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const fmtDate = ms => new Date(ms).toLocaleDateString('ja-JP', {timeZone: 'Asia/Tokyo'});

// 一覧・予定・今日の巡礼で使う小さなラベル。
export function chipsHTML(flags) {
  return flags.length ? `<span class="car-chips">${flags.map(f => `<span class="car-chip ${f.level === 'warn' ? 'warn' : ''}">${esc(f.label)}</span>`).join('')}</span>` : '';
}

export function createCarUI({document = globalThis.document, store, getCarData, getParkings, getParkingFor, getRatings = () => new Map(), getRatingRows = () => [], getVehicle = () => 'standard', setVehicle = () => {}, openDialog, closeDialog, getEpoch, showError, toast, onChanged, backToTemple, japanDate}) {
  const $ = s => document.querySelector(s);

  function rows(info) {
    const list = [];
    if (info.parking) list.push(['駐車場', info.parking]);
    if (info.walkToHondoMeters) list.push(['駐車場から本堂', `約${info.walkToHondoMeters}m`]);
    if (info.ropeway) list.push(['ロープウェイ', info.ropeway]);
    if (info.vehicleLimits.length) list.push(['車両の制限', info.vehicleLimits.join('、')]);
    if (info.seasonalClosure) list.push(['季節の通行止め', info.seasonalClosure]);
    for (const note of info.roadNotes) if (!list.some(([, v]) => v.includes(note))) list.push(['道路メモ', note]);
    return list;
  }

  // 札所詳細に差し込むカード（HTML文字列）。
  function card(t) {
    const info = carInfoFor(getCarData(), t.id), parking = getParkingFor(t.id);
    const warn = info && (info.seasonalClosure || info.vehicleLimits.length || info.ropeway);
    const dest = parking
      ? `<p class="car-dest ok">ナビは<strong>${esc(parking.label)}</strong>へ案内します。${parking.source === 'user' ? `<small>${esc(fmtDate(parking.savedAt))}に登録 · 測位誤差 約${parking.accuracy}m</small>` : ''}</p>`
      : `<p class="car-dest">駐車場の位置は未登録です。ナビは札所名・住所で検索するため、別の入口や細い道に案内されることがあります。</p>`;
    const body = info
      ? `<dl class="car-facts">${rows(info).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl><p class="tiny">出典：${info.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a>（${esc(s.checkedAt)}確認）`).join(' / ')}。料金・期間・台数は変わることがあります。</p>`
      : `<p class="small">この札所の車の情報はまだ確認していません。<a href="${esc(t.associationSourceUrl)}" target="_blank" rel="noopener noreferrer">霊場会の札所案内 ↗</a>で駐車場をご確認ください。</p>`;
    const user = parking?.source === 'user', vehicle = getVehicle(), rating = getRatings().get(t.id);
    const blocked = vehicleBlocked(info, vehicle) ? `<p class="car-alert">設定中の車（${esc(vehicleLabel(vehicle))}）は通行できないと案内されています。</p>` : '';
    const rate = `<div class="car-rating" role="group" aria-label="自分の評価"><div class="car-rating-head"><strong>自分の評価</strong><small>走ってみた感覚を記録（公式の格付けではありません）</small></div><div class="car-rating-buttons">${RATINGS.map(r => `<button type="button" class="car-rate${rating === r.level ? ' on' : ''}" data-rate="${r.level}" aria-pressed="${rating === r.level}" title="${esc(r.note)}"><b>${r.level}</b>${esc(r.label)}</button>`).join('')}</div>${rating !== undefined ? `<p class="tiny">${esc(RATINGS[rating].note)} · <button type="button" class="text-button car-rate-clear" id="car-rate-clear">評価を外す</button></p>` : '<p class="tiny">0 ふつう ／ 1 やや注意 ／ 2 注意 ／ 3 難所。一覧と行き先予定に表示します。</p>'}</div>`;
    return `<section class="car-card${warn || blocked ? ' car-warn' : ''}"><div class="car-card-label">車でのアクセス</div>${warn ? '<p class="car-alert">事前の確認が必要な札所です。</p>' : ''}${blocked}${dest}${body}${rate}<div class="car-actions"><button class="secondary" id="car-register">${user ? '駐車場の位置を登録し直す' : '現在地を駐車場として登録'}</button>${user ? '<button class="quiet" id="car-unregister">登録を解除</button>' : ''}</div><p class="tiny">駐車場に着いたら停車中に登録すると、次回からナビが駐車場へ案内し、駐車場から${PARKING_RADIUS}m以内でもチェックインできます。登録した位置はこの端末だけに保存します。</p></section>`;
  }

  function bind(t) {
    document.querySelectorAll('[data-rate]').forEach(b => b.addEventListener('click', async () => {
      try { await store.saveRating({templeId: t.id, level: Number(b.dataset.rate), savedAt: Date.now()}); await onChanged(); backToTemple(t.id); toast(`自分の評価を「${RATINGS[Number(b.dataset.rate)].label}」にしました。`); } catch (err) { showError(err); }
    }));
    $('#car-rate-clear')?.addEventListener('click', async () => {
      try { await store.removeRating(t.id); await onChanged(); backToTemple(t.id); toast('自分の評価を外しました。'); } catch (err) { showError(err); }
    });
    $('#car-register')?.addEventListener('click', () => registerDialog(t));
    $('#car-unregister')?.addEventListener('click', () => unregisterDialog(t));
  }

  function registerDialog(t) {
    openDialog('駐車場の位置を登録', `<p>第${t.id}番 ${esc(t.name)} の駐車場として、今いる場所を登録します。</p><p class="small">駐車場に停車してから操作してください。札所から3km以内・測位誤差${PARKING_REGISTER_MAX_ACCURACY}m以内のときに登録できます。位置はこの端末だけに保存し、外部へ送信しません。</p><div id="car-result" class="gps-result" hidden></div><div class="dialog-actions"><button class="quiet" id="car-back">戻る</button><button class="primary" id="car-measure">現在地を取得する</button></div>`);
    $('#car-back').onclick = () => backToTemple(t.id);
    $('#car-measure').onclick = async e => {
      if (!window.isSecureContext || !navigator.geolocation) { showError(new Error('この画面では位置情報を利用できません。HTTPSで開いたホーム画面のアプリからお試しください。')); return; }
      const epoch = getEpoch(); e.target.disabled = true; e.target.textContent = '測位しています…';
      try {
        const r = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {enableHighAccuracy: true, maximumAge: 0, timeout: 20000}));
        if (epoch !== getEpoch()) return;
        const position = {lat: r.coords.latitude, lng: r.coords.longitude, accuracy: r.coords.accuracy, timestamp: r.timestamp};
        const a = assessParkingRegistration(position, t);
        if (!a.ok) throw new Error(a.message);
        $('#car-result').hidden = false;
        $('#car-result').textContent = `本堂の地図上の位置から約${a.distance}m / 測位誤差 約${a.accuracy}m。この場所を駐車場として登録できます。`;
        e.target.textContent = 'この場所を登録'; e.target.disabled = false;
        e.target.onclick = async ev => {
          ev.target.disabled = true;
          try { await store.save({templeId: t.id, lat: position.lat, lng: position.lng, accuracy: position.accuracy, savedAt: Date.now(), note: ''}); await onChanged(); backToTemple(t.id); toast('駐車場の位置を登録しました。次回からナビが駐車場へ案内します。'); }
          catch (err) { showError(err); ev.target.disabled = false; }
        };
      } catch (err) {
        if (epoch !== getEpoch()) return;
        const messages = {1: '位置情報が許可されていません。端末の設定で許可してください。', 2: '現在地を取得できませんでした。屋外で再度お試しください。', 3: '測位に時間がかかりました。もう一度お試しください。'};
        showError(new Error(messages[err.code] || err.message)); e.target.disabled = false; e.target.textContent = '現在地を取得する';
      }
    };
  }

  function unregisterDialog(t) {
    openDialog('駐車場の登録を解除', `<p>第${t.id}番 ${esc(t.name)} に登録した駐車場の位置を、この端末から解除します。</p><p class="small">解除すると、ナビは札所名・住所での検索に戻ります。訪問記録・写真は変わりません。</p><div class="dialog-actions"><button class="quiet" id="car-back">戻る</button><button class="primary" id="car-confirm-remove">登録を解除する</button></div>`);
    $('#car-back').onclick = () => backToTemple(t.id);
    $('#car-confirm-remove').onclick = async e => {
      e.target.disabled = true;
      try { await store.remove(t.id); await onChanged(); backToTemple(t.id); toast('駐車場の登録を解除しました。'); }
      catch (err) { showError(err); e.target.disabled = false; }
    };
  }

  // 設定画面：登録件数・JSONバックアップ・復元。
  function renderSettings(root) {
    const points = getParkings(), ratings = [...getRatings()].map(([templeId, level]) => ({templeId, level}));
    root.innerHTML = `<label class="car-vehicle">乗っていく車<select id="car-vehicle">${VEHICLES.map(v => `<option value="${v.id}"${v.id === getVehicle() ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label><p class="tiny">通行できない車種が案内されている札所で、一覧と行き先予定に注意を出します。</p><hr><p>札所で登録した駐車場の位置と自分の評価を、JSONで保存・復元できます。訪問記録のJSONには含まれません。</p><p id="parking-count" class="small">駐車場の位置：${points.length}か所${points.length ? `（${points.map(p => `第${p.templeId}番`).join('・')}）` : ''}<br>自分の評価：${ratings.length}か所</p><button class="secondary" id="parking-export"${points.length || ratings.length ? '' : ' disabled'}>駐車場と評価を保存</button><label class="file-label">駐車場と評価を復元<input type="file" id="parking-import" accept=".json,application/json"></label><p class="tiny">復元は追加のみで、すでに登録がある札所は上書きしません。</p>`;
    $('#car-vehicle').onchange = e => { setVehicle(e.target.value); toast(`乗っていく車を「${vehicleLabel(e.target.value)}」にしました。`); };
    $('#parking-export').onclick = () => {
      try {
        const blob = new Blob([exportParkings(getParkings(), getRatingRows())], {type: 'application/json'}), url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = `ohenro-parkings-${japanDate()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('駐車場の位置を保存しました。保存先をご確認ください。');
      } catch (err) { toast(err.message); }
    };
    $('#parking-import').onchange = async e => {
      const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
      try { const data = readParkingsJSON(await file.text()), r = await store.importPoints(data.points, data.ratings); await onChanged(); renderSettings(root); toast(`駐車場${r.added}か所・評価${r.ratingsAdded}か所を復元しました。${r.skipped + r.ratingsSkipped ? `登録済みの${r.skipped + r.ratingsSkipped}件はそのままです。` : ''}`); }
      catch (err) { toast(err.message); }
    };
  }

  function flagsFor(templeId) {
    return carFlags(carInfoFor(getCarData(), templeId), {rating: getRatings().get(templeId) ?? null, vehicle: getVehicle()});
  }
  return {card, bind, renderSettings, flagsFor};
}
