// 思い立ったときの「今から」。札所の詳細で1寺だけ、または札所一覧から何寺か選んで、今いる場所から何分・何時ごろかの目安を出す。
// 現在地はボタンを押したときだけ取り、保存しない。時間は直線距離×1.4の目安で、正確な時間はGoogleマップで見る。
import {estimateFromHere, nearestOrder, planSchedule, japanClock, formatMinutes} from './car-domain.mjs';
import {navigationSections} from './plan-domain.mjs';
import {routeUrl} from './domain.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PREFS=['徳島県','高知県','愛媛県','香川県'];

export function getHere({geolocation=globalThis.navigator?.geolocation,secure=globalThis.isSecureContext}={}){
  return new Promise((resolve,reject)=>{
    if(!secure||!geolocation){reject(new Error('この端末・接続では現在地を使えません。'));return;}
    geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lng:p.coords.longitude}),err=>reject(new Error({1:'位置情報が許可されていません。端末の設定で許可してください。',2:'現在地を取得できませんでした。屋外でもう一度お試しください。',3:'現在地の取得に時間がかかりました。もう一度お試しください。'}[err?.code]||'現在地を取得できませんでした。')),{enableHighAccuracy:false,maximumAge:120000,timeout:15000});
  });
}

export function createQuickTrip({document=globalThis.document,getTemples,getVisits,getParking=()=>null,getKmh=()=>35,getPace=()=>1,getPaceNote=()=>'',getSpeedLabel=()=>'',getJourney,plans,openDialog,closeDialog,toast,onStartToday=()=>{},here=getHere}){
  const $=s=>document.querySelector(s);
  const label=id=>{const t=getTemples().find(t=>t.id===id);return `第${id}番 ${t?.name||''}`;};
  const note=()=>`<p class="tiny">直線距離×1.4を${esc(getSpeedLabel())}で割った目安です。山道の札所は約1.5倍の長めに見積もっています。${esc(getPaceNote())}休憩や道の混み具合で変わるので、正確な時間はGoogleマップで確かめてください。現在地は保存しません。</p>`;
  const nokyo=r=>r.inTime?'<p class="car-plan-msg info">納経の受付（8時〜17時）に間に合いそうです。</p>':r.beforeOpen?'<p class="car-plan-msg warn">受付の始まる8時より前に着きそうです。</p>':'<p class="car-plan-msg warn">納経の受付（17時まで）に間に合わないかもしれません。</p>';

  // 1. 札所の詳細：「今から行くと何分？」
  const detailHTML=()=>'<div class="quick-here"><button type="button" class="secondary" id="quick-here-btn">今から行くと何分？</button><div id="quick-here-result" role="status"></div></div>';
  function bindDetail(t){
    const btn=$('#quick-here-btn');if(!btn)return;
    btn.onclick=async()=>{btn.disabled=true;btn.textContent='現在地を確かめています…';
      try{const at=await here(),park=getParking(t.id),r=estimateFromHere({here:at,to:park||t,kmh:getKmh(),templeId:t.id,pace:getPace()});
        if(!$('#quick-here-result'))return;
        $('#quick-here-result').innerHTML=`<p class="quick-here-main"><strong>約${r.roadKm}km・約${formatMinutes(r.minutes)}</strong><span>今から出ると ${r.arriveText}ごろ${r.nextDay?'（翌日）':''}に${park?'駐車場に':''}着く見込み${r.mountain?'（山道を含めて長めに計算）':''}</span></p>${nokyo(r)}<a class="secondary quick-here-nav" href="${esc(routeUrl(t,'google',park))}" target="_blank" rel="noopener noreferrer">Googleマップで正確な時間を見る・ナビ ↗</a>${note()}`;
        btn.textContent='もう一度調べる';
      }catch(e){if($('#quick-here-result'))$('#quick-here-result').innerHTML=`<p class="car-plan-msg warn">${esc(e.message)}</p>`;btn.textContent='今から行くと何分？';}
      finally{btn.disabled=false;}};
  }

  // 2. 札所一覧：何寺か選んで「今からめぐる」
  function pickDialog(preset=[]){
    const chosen=new Set(preset),done=new Set(getVisits().map(v=>v.templeId));
    openDialog('今からめぐる',`<p class="small">行きたい札所を選ぶと、今いる場所から何分・何時ごろ着くかの目安を出します。何寺か選ぶと近い順に並べます。</p><label class="qt-search"><input type="search" id="qt-q" placeholder="番号・札所名で探す" aria-label="番号・札所名で探す"></label><div class="selection-tools"><select id="qt-pref" aria-label="県で絞り込む"><option value="">四国全体</option>${PREFS.map(p=>`<option>${p}</option>`).join('')}</select><label class="inline"><input type="checkbox" id="qt-unvisited" checked>未訪問だけ</label><span id="qt-count"></span></div><div class="selection-grid" id="qt-list"></div><p id="qt-error" class="car-plan-msg warn" hidden></p><div class="dialog-actions"><button type="button" class="primary" id="qt-go">今からの時間を見る</button></div>`);
    const draw=()=>{const pref=$('#qt-pref').value,only=$('#qt-unvisited').checked,q=$('#qt-q').value.trim(),rows=getTemples().filter(t=>(!pref||t.prefecture===pref)&&(!only||!done.has(t.id)||chosen.has(t.id))&&(!q||(/^\d+$/.test(q)?String(t.id)===q:t.name.includes(q)||(t.address||'').includes(q))));
      $('#qt-list').innerHTML=rows.map(t=>`<label><input type="checkbox" data-qt="${t.id}"${chosen.has(t.id)?' checked':''}>${t.id}. ${esc(t.name)}${done.has(t.id)?' ✓':''}</label>`).join('')||'<p class="small">該当する札所がありません。</p>';
      $('#qt-list').querySelectorAll('[data-qt]').forEach(c=>c.onchange=()=>{const id=Number(c.dataset.qt);if(c.checked)chosen.add(id);else chosen.delete(id);count();});count();};
    const count=()=>{$('#qt-count').textContent=`${chosen.size}寺を選択`;$('#qt-error').hidden=true;};
    $('#qt-pref').onchange=draw;$('#qt-q').oninput=draw;$('#qt-unvisited').onchange=draw;draw();
    $('#qt-go').onclick=async e=>{if(!chosen.size){$('#qt-error').textContent='札所を1つ以上選んでください。';$('#qt-error').hidden=false;return;}
      if(chosen.size>30){$('#qt-error').textContent='一度に選べるのは30寺までです。';$('#qt-error').hidden=false;return;}
      e.target.disabled=true;e.target.textContent='現在地を確かめています…';
      try{const at=await here();resultDialog([...chosen].sort((a,b)=>a-b),at);}
      catch(err){if($('#qt-go')){$('#qt-error').textContent=err.message;$('#qt-error').hidden=false;e.target.disabled=false;e.target.textContent='今からの時間を見る';}}};
  }
  function resultDialog(ids,at){
    const origin={kind:'here',lat:at.lat,lng:at.lng},clock=japanClock(),kmh=getKmh();
    const sorted=nearestOrder({stops:ids.map(templeId=>({templeId,minutes:30})),temples:getTemples(),parkingFor:getParking,origin}).stops;
    const sc=planSchedule({stops:sorted,departAt:clock.departAt,temples:getTemples(),parkingFor:getParking,origin,kmh,pace:getPace()});
    const journey=getJourney(),one=sorted.length===1;
    // ナビと保存用の予定：出発地は「現在地（Googleマップで選ぶ）」、出発は今の時刻。
    const plan={id:'quick',journeyId:journey?.id||'',revision:0,name:`今からめぐる ${clock.date.slice(5).replace('-','/')} ${clock.hm}`,departAt:clock.departAt,origin:{kind:'current'},returnTo:{kind:'none'},stops:sorted};
    let sections=[];try{sections=navigationSections(plan,getTemples(),getParking);}catch{}
    openDialog('今からめぐる',`<div class="qt-total">${one?`<strong>約${sc.roadKm}km・約${formatMinutes(sc.driveMinutes)} · ${esc(sc.rows[0]?.arriveText||'')}ごろ着</strong><span>参拝30分として、${esc(sc.finishText)}ごろ${sc.overnight?'（翌日）':''}に出られる見込み</span>`:`<strong>${sorted.length}寺 · 回り終わるのは ${esc(sc.finishText)}ごろ${sc.overnight?'（翌日）':''}</strong><span>移動 約${sc.roadKm}km・${formatMinutes(sc.driveMinutes)} ／ 参拝 ${formatMinutes(sc.prayerMinutes)}（1寺30分）</span>`}</div>${sc.outsideCount?`<p class="car-plan-msg warn">${one?'納経の受付時間（8時〜17時）から外れそうです。':`${sc.outsideCount}か所で、納経の受付時間（8時〜17時）から外れそうです。札所を減らすか、別の日にしてください。`}</p>`:`<p class="car-plan-msg info">${one?'納経の受付（8時〜17時）に間に合いそうです。':'どの札所も納経の受付時間に間に合いそうです。'}</p>`}<ol class="qt-rows">${sc.rows.map(r=>`<li${r.outside?' class="out"':''}><strong>${esc(label(r.templeId))}</strong><span>${esc(r.arriveText)}ごろ着${r.leg?` · ${formatMinutes(r.leg.minutes)}${r.leg.fromHistory?'（実績）':r.leg.mountain?'（山道）':''}`:''}${r.outside?' · 受付時間外':''}</span></li>`).join('')}</ol><div class="qt-actions">${sections.map((s,i)=>`<a class="primary" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${sections.length>1?`Googleマップでナビ（${i+1}/${sections.length}）`:'Googleマップでナビ'} ↗</a>`).join('')}<button type="button" class="secondary" id="qt-today">この順番で今日の巡礼を始める</button><button type="button" class="quiet" id="qt-save">予定として保存</button><button type="button" class="quiet" id="qt-back">選び直す</button></div>${note()}`);
    // 「予定として保存」のあとに「今日の巡礼を始める」を押しても、同じ予定を2つ作らない。
    let saved=null;
    const save=async()=>{if(saved)return saved;if(!journey)throw new Error('巡礼の記録を読み込んでからお試しください。');saved=await plans.save({...plan,id:crypto.randomUUID(),journeyId:journey.id});return saved;};
    $('#qt-back').onclick=()=>pickDialog(ids);
    $('#qt-save').onclick=async e=>{e.target.disabled=true;try{const p=await save();toast(`予定「${p.name}」を保存しました。`);e.target.textContent='保存しました';}catch(err){toast(err.message);e.target.disabled=false;}};
    $('#qt-today').onclick=async e=>{e.target.disabled=true;try{const p=await save();closeDialog();onStartToday(p);}catch(err){toast(err.message);e.target.disabled=false;}};
  }
  return {detailHTML,bindDetail,pickDialog};
}
