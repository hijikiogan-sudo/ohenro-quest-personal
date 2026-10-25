import {createTodayStore} from './today-store.mjs';
import {createTodayUI} from './today-ui.mjs';
import {createPrayerUI,templePrayerCard} from './prayer.mjs';
import {createPlanStore} from './plan-store.mjs';
import {createPlanUI} from './plan-ui.mjs';
import {createPhotoStore} from './photo-store.mjs';
import {createPhotoUI} from './photo-ui.mjs';
import {groupNearby,templeGlyph} from './temple-marker.mjs';
import {attachTheme, fittedMapBox} from './display.mjs';
import {createRoadMap} from './road-map.mjs';
import {questTerrain,questTempleGlyph} from './quest-map.mjs';
import {progress, routeUrl, japanDate, assessGPS} from './domain.mjs';
import {createPersonalStore} from './personal-store.mjs';
import {createParkingStore} from './parking-store.mjs';
import {createCarUI} from './car-ui.mjs';
import {validateCarData, createParkingResolver} from './car-domain.mjs';

const $ = selector=>document.querySelector(selector);
const $$ = selector=>[...document.querySelectorAll(selector)];
const esc = value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalizeTerm=value=>value.normalize('NFKC').toLocaleLowerCase().replace(/[國寶佛圓瀧釋峯]/g,c=>({'國':'国','寶':'宝','佛':'仏','圓':'円','瀧':'滝','釋':'釈','峯':'峰'}[c]));
let carData=null,parkingPoints=[],parkingFor=()=>null;
let temples=[],coast=null,state=null,journeyId='',view='home',initialized=false,connected=false;
const personal=createPersonalStore({scope:new URL('.',import.meta.url).pathname,temples:()=>temples,parkingFor:id=>parkingFor(id)});
const parkingStore=createParkingStore({scope:new URL('.',import.meta.url).pathname});
async function reloadParkings(){try{parkingPoints=await parkingStore.list();}catch{parkingPoints=[];}parkingFor=createParkingResolver(carData,parkingPoints);}
let toastTimer,installPrompt=null,mapBox=[0,0,800,480];
let mapPref='',positionStyle='quest',questBackground='';
attachTheme({scope:new URL('.',import.meta.url).pathname});
const roadMap=createRoadMap({scope:new URL('.',import.meta.url).pathname,onTemple:id=>detailDialog(id),onCluster:ids=>clusterDialog(ids),onPositionStyle:style=>{positionStyle=style;if(coast)drawMap(new Set(currentVisits().map(v=>v.templeId)));}});
let dialogEpoch=0;
const photos=createPhotoStore({scope:new URL('.',import.meta.url).pathname});
const photoUI=createPhotoUI({store:photos,getJourney:()=>currentJourney(),getJourneys:()=>state?.journeys||[],getTemples:()=>temples,openDialog,closeDialog,getEpoch:()=>dialogEpoch,showError,toast});
const plans=createPlanStore({scope:new URL('.',import.meta.url).pathname});
const planUI=createPlanUI({store:plans,getJourney:()=>currentJourney(),getTemples:()=>temples,getVisits:()=>currentVisits(),toast,onStart:plan=>todayUI.startDialog(plan),getParking:id=>parkingFor(id)});
const prayerUI=createPrayerUI({document,openDialog,getEpoch:()=>dialogEpoch,backToTemple:id=>detailDialog(id)});
const todayStore=createTodayStore({scope:new URL('.',import.meta.url).pathname});
const todayUI=createTodayUI({document,store:todayStore,plans,getJourney:()=>currentJourney(),getVisits:()=>state?.visits||[],getTemples:()=>temples,openDialog,closeDialog,getEpoch:()=>dialogEpoch,showError,toast,onPlans:()=>setView('plan'),onStarted:()=>setView('home'),onPrayer:t=>requireAuth(()=>prayerUI.open(t)),onPhotos:t=>requireAuth(()=>photoUI.album(t)),onGPS:t=>requireAuth(()=>gpsDialog(t)),onManual:t=>requireAuth(()=>manualDialog([t.id])),getParking:id=>parkingFor(id)});
const carUI=createCarUI({document,store:parkingStore,getCarData:()=>carData,getParkings:()=>parkingPoints,getParkingFor:id=>parkingFor(id),openDialog,closeDialog,getEpoch:()=>dialogEpoch,showError,toast,onChanged:async()=>{await reloadParkings();if($('#parking-settings'))carUI.renderSettings($('#parking-settings'));},backToTemple:id=>detailDialog(id),japanDate});
function toast(message,action) {
  clearTimeout(toastTimer);const el=$('#toast');el.replaceChildren(document.createTextNode(message));
  if(action) {const b=document.createElement('button');b.textContent=action.label;b.onclick=action.run;el.append(b);}
  el.hidden=false;toastTimer=setTimeout(()=>{el.hidden=true;},action?15000:5500);
}
function showError(e) {const el=$('#dialog-error');if($('#dialog').open){el.textContent=e.message;el.hidden=false;}else toast(e.message);}
async function api(route,data){return personal.call(route,data);}
async function refresh({silent=false}={}) {
  try {state=await api('state');initialized=true;connected=true;
    if(state && !state.journeys.some(j=>j.id===journeyId))journeyId=state.journeys[0]?.id||'';
  }catch(e){connected=false;state=null;if(!silent)toast(e.message);}
  render();
}
function currentVisits(){return state?.visits.filter(v=>v.journeyId===journeyId)||[];}
function currentJourney(){return state?.journeys.find(j=>j.id===journeyId);}
function openDialog(title,html) {prayerUI.cleanup();photoUI.cleanup();dialogEpoch++;$('#dialog-title').textContent=title;$('#dialog-content').inert=false;$('#dialog-content').innerHTML=html;$('#dialog-error').hidden=true;if(!$('#dialog').open)$('#dialog').showModal();return dialogEpoch;}
function closeDialog() {prayerUI.cleanup();photoUI.cleanup();dialogEpoch++;$('#dialog-content').inert=false;$('#dialog').close();}
$('#dialog-close').onclick=closeDialog;
$('#dialog').addEventListener('cancel',()=>{prayerUI.cleanup();photoUI.cleanup();dialogEpoch++;});
$('#dialog').addEventListener('close',()=>{photoUI.dialogClosed();if(!$('#dialog').open)prayerUI.cleanup();});
function requireAuth(callback){if(!state||!connected){toast('端末の保存領域を利用できません。通常のSafariで再読み込みしてください。');return false;}callback?.();return true;}
function setView(next){if(view==='home'&&next!=='home')todayUI.leave();if(view==='plan'&&next!=='plan'){if(!planUI.canLeave())return;planUI.leave();}if(next!=='album')photoUI.leaveLibrary();view=next;$$('.view').forEach(el=>el.hidden=el.id!=='view-'+view);$$('[data-view]').forEach(el=>{el.classList.toggle('active',el.dataset.view===view);el.setAttribute('aria-current',el.dataset.view===view?'page':'false');});render();window.scrollTo({top:0,behavior:'instant'});}
$$('[data-view]').forEach(el=>el.onclick=()=>setView(el.dataset.view));
$$('[data-action=manual]').forEach(el=>el.onclick=()=>requireAuth(()=>manualDialog()));
$$('[data-action=history]').forEach(el=>el.onclick=()=>setView('history'));
$('#account').onclick=()=>setView('family');
$('#journey').onchange=e=>{journeyId=e.target.value;render();};

function render(){
  const visits=currentVisits(),done=new Set(visits.map(v=>v.templeId)),p=progress(temples,visits);
  $('#connection').textContent=connected?(navigator.onLine===false?'● オフラインで記録可':'● この端末に保存'):'● 保存領域を確認';$('#connection').classList.toggle('offline',!connected);
  $('#account').textContent='設定';
  $('#notice').hidden=false;
  $('#notice').textContent=connected?'個人用テスト版です。記録はこの端末だけに保存されます。ホーム画面に追加して使い、設定からバックアップしてください。':'端末の保存領域を利用できません。記録を初期化せず停止しました。通常のSafariで開き直してください。';
  $('#journey').innerHTML=state?state.journeys.map(j=>`<option value="${esc(j.id)}">${esc(j.name)}</option>`).join(''):'<option>はじめての巡礼</option>';
  if(state)$('#journey').value=journeyId;$('#journey').disabled=!state;
  $('#group-label').textContent='自分の巡礼 · この端末だけに保存';
  $('#journey-label').textContent=currentJourney()?.name||'はじめての巡礼';
  $('#achievement').textContent=`達成率 ${p.percent}%`;
  $('#traveler-title').textContent=p.title;$('#remaining').textContent=p.count===88?'八十八の出会い、おめでとうございます。':`あと${88-p.count}の出会いが待っています。`;
  $('#level').textContent='Lv. '+p.level;$('#xp').textContent=p.xp.toLocaleString()+' XP';
  // SVGの円弧を使用。CSSのインラインスタイルを必要としない。
  $('#ring').innerHTML=`<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true"><circle cx="50" cy="50" r="44" fill="none" stroke="#00a5bb" stroke-width="4" stroke-dasharray="${p.count/88*276.46} 276.46" transform="rotate(-90 50 50)"/><text x="50" y="51" text-anchor="middle" font-size="31" fill="#143c50">${p.count}</text><text x="50" y="67" text-anchor="middle" font-size="8" fill="#536c7a">/ 88 寺</text></svg>`;
  $('#pref-progress').innerHTML=['徳島県','高知県','愛媛県','香川県'].map(pref=>{const ts=temples.filter(t=>t.prefecture===pref),n=ts.filter(t=>done.has(t.id)).length;return `<div><div class="pref-name">${pref.slice(0,-1)}<small>${n} / ${ts.length}</small></div><div class="track"><svg viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true"><rect width="${ts.length?n/ts.length*100:0}" height="4" fill="#00a5bb"/></svg></div></div>`;}).join('');
  const next=temples.find(t=>!done.has(t.id));
  $('#next-temple').innerHTML=next?`<div class="next-top"><div class="temple-number">${next.id.toString().padStart(2,'0')}</div><div><small>${esc(next.prefecture)} · 第${next.id}番札所</small><h2>${esc(next.name)}</h2></div></div><p>${esc(next.address)}<br>未訪問の番号が小さい札所を表示しています。</p><button class="primary" id="next-detail">札所の詳細・チェックイン →</button><a class="text-button" href="${esc(routeUrl(next,'google',parkingFor(next.id)))}" target="_blank" rel="noopener noreferrer">${parkingFor(next.id)?'駐車場へのルートをGoogleマップで開く ↗':'車のルートをGoogleマップで開く ↗'}</a>`:'<div class="next-top"><div class="temple-number">祝</div><h2>結願</h2></div><p>すべての札所をめぐりました。<br>グループ・設定から新しい巡礼を始められます。</p>';
  if(next)$('#next-detail').onclick=()=>detailDialog(next.id);
  const badgeList=[['はじめの一歩','✧'],['十寺巡礼','❀'],['結願','♧']];
  $('#badges').innerHTML=badgeList.map(([name,icon])=>`<div class="badge ${p.badges.includes(name)?'earned':''}"><span class="badge-icon" aria-hidden="true">${icon}</span><span>${name}</span><span>${p.badges.includes(name)?'獲得済み':'未獲得'}</span></div>`).join('')+p.badges.filter(b=>!badgeList.some(([name])=>name===b)).map(b=>`<div class="badge earned"><span class="badge-icon">❀</span><span>${esc(b)}</span><span>獲得済み</span></div>`).join('');
  drawMap(done);renderMapPanel(done);renderTemples();renderHistory();renderFamily();photoUI.stats();if(view==='album')photoUI.library({soft:true});if(view==='plan')planUI.render({soft:true});if(view==='home')todayUI.render();
  $('#install-note').textContent=window.isSecureContext?'この画面はPWA・位置情報が使える接続です（対応ブラウザ・端末の許可が必要）。':'この接続ではGPS・PWA機能に制限があります。iPhoneでの本利用には、信頼されたHTTPS接続が必要です。';
}
function renderTemples(){
  const done=new Set(currentVisits().map(v=>v.templeId)),term=normalizeTerm($('#search').value.trim()),pref=$('#pref-filter').value,status=state?$('#status-filter').value:'';
  const rows=temples.filter(t=>(!term||normalizeTerm(`${t.id} ${t.name} ${t.kana} ${t.address}`).includes(term))&&(!pref||t.prefecture===pref)&&(!status||(status==='visited'?done.has(t.id):!done.has(t.id))));
  $('#result-count').textContent=`${rows.length} 件の札所${!state?' · 保存領域を確認してください':''}`;
  $('#status-filter').disabled=!state;
  $('#temple-list').innerHTML=rows.length?rows.map(t=>`<button class="temple-card" data-temple="${t.id}"><span class="temple-number">${t.id.toString().padStart(2,'0')}</span>${done.has(t.id)?'<span class="status-tag">✓ 訪問済み</span>':''}<small>${esc(t.prefecture)} · 第${t.id}番</small><h2>${esc(t.name)}</h2><p>${esc(t.address)}</p></button>`).join(''):'<div class="empty">該当する札所がありません。検索条件を変えてください。</div>';
  $$('#temple-list [data-temple]').forEach(el=>el.onclick=()=>detailDialog(Number(el.dataset.temple)));
}
$('#search').oninput=renderTemples;$('#pref-filter').onchange=renderTemples;$('#status-filter').onchange=renderTemples;
function renderHistory(){
  const visits=currentVisits();$('#history-count').textContent=`${currentJourney()?.name||'巡礼の記録'} · ${visits.length}件`;
  $('#history-list').innerHTML=!state?'<div class="empty">このブラウザでは記録の保存領域を利用できません。通常のSafariで開いてください。</div>':!visits.length?'<div class="empty">まだ記録はありません。<br>過去の訪問も、まとめて登録できます。</div>':visits.map(v=>{const t=temples.find(t=>t.id===v.templeId);return `<article class="history-item"><button class="temple-number" data-temple="${t.id}" aria-label="第${t.id}番 ${esc(t.name)}の詳細">${t.id}</button><div class="content"><h3>${esc(t.name)}</h3><p>${esc(v.author)} · ${v.method==='gps-self-reported'?'GPS自己申告（近接判定）':v.method==='imported-manual'?'バックアップからの手動記録':'手動記録'}${v.accuracy!==null?` · 誤差${v.accuracy}m`:''}</p>${v.note?`<p>${esc(v.note)}</p>`:''}</div><time>${v.date?esc(v.date):'訪問日不明'}</time><button class="quiet" data-void="${esc(v.id)}">取り消す</button></article>`;}).join('');
  $$('#history-list [data-temple]').forEach(el=>el.onclick=()=>detailDialog(Number(el.dataset.temple)));
  $$('#history-list [data-void]').forEach(el=>el.onclick=()=>voidDialog(el.dataset.void));
}
function renderFamily(){
  const last=state?.lastExportAt?new Date(state.lastExportAt).toLocaleString('ja-JP'):'まだ書き出していません';
  $('#family-content').innerHTML=`<p>自分のペースで、八十八の出会いを。</p><p class="small">ログイン不要の個人版です。記録はこの端末・このブラウザに保存します。家族や別の端末とは自動共有しません。</p><button class="secondary" id="new-journey">新しい巡礼を作成</button><button class="quiet" id="settings-history">訪問の記録を見る</button><p class="small">前回のバックアップ書き出し：${esc(last)}</p><p class="tiny">プライベートブラウズは使わず、先にホーム画面へ追加してください。端末の容量不足・ブラウザのデータ削除・機種変更で記録が失われる場合があります。JSONバックアップを「ファイル」などに保存してください。</p>`;
  if($('#parking-settings'))carUI.renderSettings($('#parking-settings'));$('#new-journey').onclick=()=>requireAuth(()=>newJourneyDialog());$('#settings-history').onclick=()=>setView('history');
}
function detailDialog(id){
  const t=temples.find(t=>t.id===id),visits=currentVisits().filter(v=>v.templeId===id);
  openDialog(`${t.name}`,`<div class="detail-number">${esc(t.prefecture)} · 第${t.id}番札所</div><div class="detail-name">${esc(t.kana)}</div><div class="detail-meta">${esc(t.address)}<br>${visits.length?`✓ ${visits.length}回の訪問を記録`:'この巡礼では未訪問'}</div><div class="detail-actions"><button class="primary" id="gps-start">現在地でチェックイン</button><button class="secondary" id="single-manual">過去の訪問を記録</button><button class="secondary" id="add-to-plan">行き先予定に追加</button><a class="secondary" href="${esc(routeUrl(t,'google',parkingFor(t.id)))}" target="_blank" rel="noopener noreferrer">Googleマップで${parkingFor(t.id)?'駐車場へ':'車ルート'} ↗</a><a class="secondary" href="${esc(routeUrl(t,'apple',parkingFor(t.id)))}" target="_blank" rel="noopener noreferrer">Appleマップで${parkingFor(t.id)?'駐車場へ':'車ルート'} ↗</a></div><p class="small">${parkingFor(t.id)?'ルート先は登録された駐車場の位置です。':'ルート先は札所名・住所で検索します。'}入口や通行規制は公式案内で確認し、安全な場所に停車して操作してください。</p>${carUI.card(t)}${templePrayerCard(t)}<section class="temple-album-card"><div class="album-section-title"><span>この札所の写真</span><span id="album-count">確認中</span></div><div id="album-preview" class="album-preview"></div><button class="secondary" id="open-album">写真を撮る・アルバムを開く →</button></section><details><summary>情報の出典・座標を確認</summary><div class="source-links"><p>緯度 ${t.lat} / 経度 ${t.lng}<br>公式公開地図と照合：${t.verifiedAt}<br>${esc(t.coordinateNote)}</p><a href="${esc(t.associationSourceUrl)}" target="_blank" rel="noopener noreferrer">霊場会の札所案内 ↗</a><br><a href="${esc(t.sourceUrl)}" target="_blank" rel="noopener noreferrer">日本遺産の札所案内 ↗</a>${t.addressSupplementSourceUrl?`<br><a href="${esc(t.addressSupplementSourceUrl)}" target="_blank" rel="noopener noreferrer">所在地の補足確認 ↗</a>`:''}${t.address!==t.heritageAddress?`<p>所在地は出典間に表記差があります。日本遺産掲載値：${esc(t.heritageAddress)}。採用理由は検証記録を参照してください。</p>`:''}</div></details>`);
  $('#add-to-plan').onclick=()=>{if(!requireAuth())return;closeDialog();setView('plan');planUI.addTemple(id);};$('#prayer-open').onclick=()=>prayerUI.open(t);$('#single-manual').onclick=()=>requireAuth(()=>manualDialog([id]));$('#gps-start').onclick=()=>requireAuth(()=>gpsDialog(t));$('#open-album').onclick=()=>requireAuth()&&photoUI.album(t);carUI.bind(t);photoUI.cover(t);
}
function clusterDialog(ids){
  openDialog('この周辺の札所',`<p class="small">近い位置にある${ids.length}つの札所です。開きたい札所を選んでください。</p><div class="cluster-list">${ids.map(id=>{const t=temples.find(t=>t.id===id);return `<button class="cluster-temple" data-cluster-temple="${id}"><span>${templeGlyph(id)}</span><div><small>第${id}番 · ${esc(t.prefecture)}</small><strong>${esc(t.name)}</strong></div><span>→</span></button>`;}).join('')}</div>`);
  $$('[data-cluster-temple]').forEach(b=>b.onclick=()=>detailDialog(Number(b.dataset.clusterTemple)));
}
function manualDialog(selected=[]) {
  const choices=new Set(selected);
  openDialog('訪問を記録する',`<form id="manual-form" class="dialog-form"><p class="small">${esc(currentJourney()?.name)} に登録します。複数の札所を同じ訪問日でまとめて登録できます。</p><div class="selection-tools"><select id="bulk-pref" aria-label="まとめて選ぶ県"><option value="">県を選択</option><option value="徳島県">徳島県</option><option value="高知県">高知県</option><option value="愛媛県">愛媛県</option><option value="香川県">香川県</option></select><button type="button" class="quiet" id="select-pref">この県を選ぶ</button><button type="button" class="quiet" id="clear-selection">選択を解除</button><span id="selected-count"></span></div><div class="selection-grid">${temples.map(t=>`<label><input name="temple" type="checkbox" value="${t.id}" ${choices.has(t.id)?'checked':''}>${t.id}. ${esc(t.name)}</label>`).join('')}</div><label>訪問日<input name="date" type="date" min="1900-01-01" max="${japanDate()}" value="${japanDate()}" required></label><label class="inline"><input id="unknown-date" type="checkbox">日付を覚えていない</label><label>メモ（任意・500文字まで）<textarea name="note" maxlength="500" placeholder="家族との思い出など"></textarea></label><div class="actions"><button type="submit" class="primary">内容を確認する</button></div></form>`);
  const update=()=>{$('#selected-count').textContent=`${$$('[name=temple]:checked').length}寺を選択`;};update();
  $$('[name=temple]').forEach(el=>el.onchange=update);
  $('#select-pref').onclick=()=>{const pref=$('#bulk-pref').value;if(!pref)return;$$('[name=temple]').forEach(el=>{if(temples[Number(el.value)-1].prefecture===pref)el.checked=true;});update();};
  $('#clear-selection').onclick=()=>{$$('[name=temple]').forEach(el=>el.checked=false);update();};
  $('#unknown-date').onchange=e=>{const date=$('[name=date]');date.disabled=e.target.checked;date.required=!e.target.checked;};
  $('#manual-form').onsubmit=e=>{e.preventDefault();const ids=$$('[name=temple]:checked').map(el=>Number(el.value));if(!ids.length){showError(new Error('札所を1つ以上選択してください。'));return;}const date=$('#unknown-date').checked?'':$('[name=date]').value,note=$('[name=note]').value;confirmVisits(ids,date,note);};
}
function confirmVisits(ids,date,note){
  const target=journeyId;
  openDialog('登録内容を確認',`<p class="small">${esc(currentJourney()?.name)} に ${ids.length}寺を登録します。</p><div class="preview-list">${ids.map(id=>`${id}. ${esc(temples[id-1].name)}`).join('<br>')}</div><p>訪問日：${date?esc(date):'日付不明'}</p>${note?`<p>メモ：${esc(note)}</p>`:''}<p class="small">同じ巡礼・札所・日付の重複は自動で除きます。</p><div class="dialog-actions"><button class="quiet" id="back-manual">選び直す</button><button class="primary" id="save-manual">この内容で登録する</button></div>`);
  $('#back-manual').onclick=()=>{manualDialog(ids);$('[name=date]').value=date||japanDate();$('[name=note]').value=note;if(!date){$('#unknown-date').checked=true;$('#unknown-date').onchange({target:$('#unknown-date')});}};
  $('#save-manual').onclick=async e=>{e.target.disabled=true;try{const r=await api('visits',{journeyId:target,visits:ids.map(templeId=>({templeId,date,note}))});closeDialog();await refresh();toast(`${r.added}件を保存しました。${r.skipped?` 重複${r.skipped}件は登録済みです。`:''}`);}catch(err){showError(err);e.target.disabled=false;}};
}
function gpsDialog(t){
  openDialog('現地でチェックイン',`<p>第${t.id}番 ${esc(t.name)} にチェックインします。</p><p class="small">ボタンを押したときだけ位置情報を取得します。札所から誤差を含め300m以内${parkingFor(t.id)?'、または登録した駐車場から150m以内':''}、測位誤差100m以内で近接判定します。現在地の緯度・経度は記録に保存しません。</p><p class="small">GPSは端末の自己申告です。位置偽装を完全には防げず、参拝の証明にはなりません。</p><div id="gps-result" class="gps-result" hidden></div><div class="dialog-actions"><button class="secondary" id="gps-manual">手動で記録する</button><button class="primary" id="gps-measure">現在地を取得する</button></div>`);
  $('#gps-manual').onclick=()=>manualDialog([t.id]);
  $('#gps-measure').onclick=async e=>{
    if(!window.isSecureContext){showError(new Error('GPSはHTTPSまたはlocalhostで利用できます。手動登録をご利用ください。'));return;}
    if(!navigator.geolocation){showError(new Error('この端末では位置情報に対応していません。手動登録をご利用ください。'));return;}
    const epoch=dialogEpoch,target=journeyId;e.target.disabled=true;e.target.textContent='測位しています…';
    try{
      const challenge=await api('gps/challenge',{templeId:t.id,journeyId:target});
      const result=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:20000}));
      if(epoch!==dialogEpoch)return;
      const position={lat:result.coords.latitude,lng:result.coords.longitude,accuracy:result.coords.accuracy,timestamp:result.timestamp};
      const assessment=assessGPS(position,t,Date.now(),parkingFor(t.id));if(!assessment.ok)throw new Error(assessment.message);
      $('#gps-result').hidden=false;$('#gps-result').textContent=assessment.near==='parking'?`駐車場まで約${assessment.parkingDistance}m（札所まで約${assessment.distance}m）/ 測位誤差 約${assessment.accuracy}m。駐車場での近接判定の範囲内です。`:`札所まで約${assessment.distance}m / 測位誤差 約${assessment.accuracy}m。近接判定の範囲内です。`;
      e.target.textContent='チェックインを保存';e.target.disabled=false;
      e.target.onclick=async event=>{event.target.disabled=true;try{const saved=await api('gps/checkin',{challengeId:challenge.id,position});closeDialog();await refresh();toast(saved.added?'GPS自己申告の訪問を保存しました。':'本日の訪問は登録済みです。');}catch(err){showError(err);event.target.disabled=false;}};
    }catch(err){if(epoch!==dialogEpoch)return;const messages={1:'位置情報が許可されていません。端末設定で許可するか、手動登録をご利用ください。',2:'現在地を取得できませんでした。屋外で再度お試しいただくか、手動登録をご利用ください。',3:'測位に時間がかかりました。再測位するか、手動登録をご利用ください。'};showError(new Error(messages[err.code]||err.message));e.target.disabled=false;e.target.textContent='現在地を取得する';}
  };
}
function voidDialog(id){const v=state.visits.find(v=>v.id===id),t=temples[v.templeId-1];openDialog('訪問記録を取り消す',`<p>${esc(t.name)} · ${esc(v.date||'訪問日不明')} の訪問を取り消します。</p><p class="small">この端末の記録から取り消します。直後に表示される「元に戻す」で復元できます。</p><div class="dialog-actions"><button class="quiet" id="cancel-void">戻る</button><button class="primary" id="confirm-void">この訪問を取り消す</button></div>`);$('#cancel-void').onclick=closeDialog;$('#confirm-void').onclick=async e=>{e.target.disabled=true;try{await api('visit/void',{id});closeDialog();await refresh();toast('訪問記録を取り消しました。',{label:'元に戻す',run:async()=>{try{await api('visit/undo',{id});await refresh();toast('記録を復元しました。');}catch(err){showError(err);}}});}catch(err){showError(err);e.target.disabled=false;}};}
function newJourneyDialog(){openDialog('新しい巡礼をつくる',`<form id="journey-form" class="dialog-form"><label>巡礼の名前<input name="name" required maxlength="60" placeholder="例：自分の2周目"></label><p class="small">訪問記録・XP・達成率は巡礼ごとに分かれます。今の記録は残ります。</p><div class="actions"><button class="primary">作成する</button></div></form>`);$('#journey-form').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{const r=await api('journeys',{name:new FormData(e.target).get('name')});journeyId=r.id;closeDialog();await refresh();setView('home');toast('新しい巡礼を作成しました。');}catch(err){showError(err);e.submitter.disabled=false;}};}
async function exportBackup(onlyCurrent=false){if(!requireAuth())return;try{const data=await api('export');if(onlyCurrent){data.journeys=data.journeys.filter(j=>j.id===journeyId);data.visits=data.visits.filter(v=>v.journeyId===journeyId);}const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`ohenro-${onlyCurrent?'journey':'all'}-${japanDate()}.json`;link.click();await api('backup/exported',{});await refresh({silent:true});setTimeout(()=>URL.revokeObjectURL(url),1000);toast('バックアップを保存しました。保存先をご確認ください。');}catch(e){showError(e);}}
$('#photos-export').onclick=()=>requireAuth(()=>photoUI.exportPhotos());
$('#photos-import').onchange=e=>{const file=e.target.files[0];e.target.value='';if(file)requireAuth(()=>photoUI.importPhotos(file));};
$('#export').onclick=()=>exportBackup();$('#export-current').onclick=()=>exportBackup(true);
$('#import').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';
  if(!file||!requireAuth())return;
  if(state.user.role!=='owner'){toast('バックアップの読込は管理者のみ利用できます。');return;}
  try{
    if(file.size>5*1024*1024)throw new Error('5MB以下のJSONファイルを選択してください。');
    const data=JSON.parse(await file.text());
    if(data.format!=='ohenro-quest'||data.version!==1||!Array.isArray(data.visits)||!Array.isArray(data.journeys)||!data.journeys.length)throw new Error('お遍路クエストのバックアップファイルを選択してください。');
    const target=journeyId;
    openDialog('バックアップを復元する',`<p>${esc(file.name)} の ${data.journeys.length}巡礼・${data.visits.length}件を読み込みます。</p><label class="dialog-form">復元方法<select id="import-mode"><option value="restore">新しい巡礼として復元（周回を維持）</option>${data.journeys.length===1?'<option value="merge">現在の巡礼に追加</option>':''}</select></label><div class="preview-list">${data.journeys.map(j=>esc(j.name)).join('<br>')}</div><p class="small">新しい巡礼には「（復元）」を付けます。現在の巡礼に追加する場合の追加先：${esc(currentJourney()?.name)}。</p><p class="small">既存の記録は置き換えません。同じ札所・日付の重複は除きます。元の作者・GPS判定は引き継がず、手動記録として保存します。</p><div class="dialog-actions"><button class="quiet" id="cancel-import">戻る</button><button class="primary" id="confirm-import">確認して読み込む</button></div>`);
    $('#cancel-import').onclick=closeDialog;
    $('#confirm-import').onclick=async event=>{
      event.target.disabled=true;
      try{
        const r=await api('import',{backup:data,targetJourneyId:target,restoreJourneys:$('#import-mode').value==='restore'});
        if(r.journeyIds?.length)journeyId=r.journeyIds[0];
        closeDialog();await refresh();toast(`${r.added}件を復元しました。重複${r.skipped}件はスキップしました。`);
      }catch(err){showError(err);event.target.disabled=false;}
    };
  }catch(err){showError(new Error(err instanceof SyntaxError?'JSONファイルを読み取れませんでした。':err.message));}
};

const svgNS='http://www.w3.org/2000/svg';
const mercator=lat=>180/Math.PI*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
const projection=([lng,lat])=>[130+(lng-131.9)*190,20+(mercator(34.55)-mercator(lat))*190];
function drawMap(done){if(!coast)return;const svg=$('#map');svg.setAttribute('viewBox',mapBox.join(' '));
  svg.dataset.style=positionStyle;
  let html='';if(positionStyle==='quest'){questBackground||=questTerrain(coast,projection);html=questBackground;}
  else for(const polygon of coast.geometry.coordinates){html+=`<path class="land" d="${polygon.map(ring=>ring.map((p,i)=>{const [x,y]=projection(p);return `${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`;}).join('')+'Z').join('')}"/>`;}
  html+='<text x="240" y="105" class="water-label">瀬戸内海</text><text x="470" y="385" class="water-label">太平洋</text>';
  for(const [name,coord] of [['徳島',[134.12,33.95]],['高知',[133.35,33.45]],['愛媛',[132.95,33.85]],['香川',[133.91,34.27]]]){const [x,y]=projection(coord);html+=`<text x="${x}" y="${y}" class="map-label">${name}</text>`;}
  const markerScale=mapBox[2]/(svg.clientWidth||600);
  const groups=groupNearby(mapTemples(),t=>projection([t.lng,t.lat]).map(v=>v/markerScale),48);
  html+=groups.map(group=>{const t=group[0],multiple=group.length>1,[x,y]=projection([group.reduce((s,t)=>s+t.lng,0)/group.length,group.reduce((s,t)=>s+t.lat,0)/group.length]);return `<g class="pin temple-position ${group.every(t=>done.has(t.id))?'visited':''}" transform="translate(${x},${y}) scale(${markerScale})" tabindex="0" role="button" aria-label="${multiple?'この周辺に'+group.length+'札所':'第'+t.id+'番 '+esc(t.name)}" ${multiple?`data-map-cluster="${group.map(t=>t.id).join(',')}"`:`data-map-temple="${t.id}"`}><g transform="translate(-22,-47)">${(positionStyle==='quest'?questTempleGlyph:templeGlyph)(multiple?group.length+'寺':t.id)}</g></g>`;}).join('');
  svg.innerHTML=html;$$('[data-map-temple],[data-map-cluster]').forEach(el=>{const activate=()=>el.dataset.mapCluster?clusterDialog(el.dataset.mapCluster.split(',').map(Number)):detailDialog(Number(el.dataset.mapTemple));el.onclick=activate;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();}};});
}
function mapTemples(){return temples.filter(t=>!mapPref||t.prefecture===mapPref);}
function fitMapCounty(){mapBox=mapPref?fittedMapBox(mapTemples().map(t=>projection([t.lng,t.lat]))):[0,0,800,480];}
function renderMapPanel(done,{fit=false}={}){
  const rows=mapTemples(),count=rows.filter(t=>done.has(t.id)).length;
  $('#map-pref-title').textContent=mapPref||'四国全体';
  $('#map-pref-count').textContent=`訪問 ${count} / ${rows.length}寺`;
  $$('[data-map-pref]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mapPref===mapPref)));
  $('#map-temple-list').innerHTML=rows.map(t=>`<button class="map-temple-chip ${done.has(t.id)?'visited':''}" data-map-list-temple="${t.id}"><span>${t.id}</span>${esc(t.name)}${done.has(t.id)?' ✓':''}</button>`).join('');
  $$('[data-map-list-temple]').forEach(b=>b.onclick=()=>detailDialog(Number(b.dataset.mapListTemple)));
  roadMap.update(rows,done,{fit});
}
$$('[data-map-pref]').forEach(b=>b.onclick=()=>{mapPref=b.dataset.mapPref;fitMapCounty();drawMap(new Set(currentVisits().map(v=>v.templeId)));renderMapPanel(new Set(currentVisits().map(v=>v.templeId)),{fit:true});});
function redrawMap(){const done=new Set(currentVisits().map(v=>v.templeId));drawMap(done);renderMapPanel(done);}
let mapResizeTimer;
window.addEventListener('resize',()=>{clearTimeout(mapResizeTimer);mapResizeTimer=setTimeout(()=>{if(view==='home')redrawMap();},120);});
function zoom(factor){const width=Math.max(100,Math.min(1000,mapBox[2]*factor));const ratio=width/mapBox[2];mapBox=[mapBox[0]+(mapBox[2]-width)/2,mapBox[1]+(mapBox[3]-mapBox[3]*ratio)/2,width,mapBox[3]*ratio];redrawMap();}
$('#map-in').onclick=()=>zoom(.65);$('#map-out').onclick=()=>zoom(1/.65);$('#map-reset').onclick=()=>{fitMapCounty();redrawMap();};
let drag=null;
$('#map').addEventListener('pointerdown',e=>{if(e.target.closest('[data-map-temple],[data-map-cluster]'))return;drag={x:e.clientX,y:e.clientY,box:[...mapBox]};$('#map').setPointerCapture(e.pointerId);});
$('#map').addEventListener('pointermove',e=>{if(!drag)return;const rect=$('#map').getBoundingClientRect(),scale=Math.min(rect.width/drag.box[2],rect.height/drag.box[3]);mapBox=[drag.box[0]-(e.clientX-drag.x)/scale,drag.box[1]-(e.clientY-drag.y)/scale,...drag.box.slice(2)];$('#map').setAttribute('viewBox',mapBox.join(' '));});
$('#map').addEventListener('pointerup',()=>{drag=null;});$('#map').addEventListener('pointercancel',()=>{drag=null;});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#install').hidden=false;});$('#install').onclick=async()=>{if(!installPrompt)return;await installPrompt.prompt();installPrompt=null;$('#install').hidden=true;};
window.addEventListener('offline',()=>render());window.addEventListener('online',()=>refresh({silent:true}));
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('#dialog').open)refresh({silent:true});});
setInterval(()=>{if(!document.hidden&&!$('#dialog').open)refresh({silent:true});},30000);
try{
  [temples,coast]=await Promise.all([fetch('./data/temples.json').then(r=>{if(!r.ok)throw new Error();return r.json();}),fetch('./data/japan-coast.geojson').then(r=>{if(!r.ok)throw new Error();return r.json();})]);
  try{carData=validateCarData(await fetch('./data/car.json').then(r=>{if(!r.ok)throw new Error();return r.json();}));}catch{carData=null;}
  await reloadParkings();
  await refresh({silent:true});
  if('serviceWorker' in navigator&&window.isSecureContext)navigator.serviceWorker.register('./sw.js').catch(()=>toast('オフライン用の画面を準備できませんでした。通信できる場所で再読み込みしてください。'));
}catch{$('#notice').hidden=false;$('#notice').textContent='札所データを読み込めませんでした。初回は通信できる場所で開いてください。端末内の記録は変更していません。';}
