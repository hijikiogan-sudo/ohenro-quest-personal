import {preparePhoto,prepareRestoredPhoto} from './photo-image.mjs';
import {makePhotoZip,readPhotoZip} from './photo-zip.mjs';
import {japanDate} from './domain.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createPhotoUI({document=globalThis.document,store,getJourney,openDialog,closeDialog,getEpoch,showError,toast}){
  const $=s=>document.querySelector(s);let urls=[];
  const cleanup=()=>{urls.forEach(URL.revokeObjectURL);urls=[];};
  const imageURL=blob=>{const url=URL.createObjectURL(blob);urls.push(url);return url;};
  const active=epoch=>getEpoch()===epoch&&$('#dialog').open;
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('書き出しを開始しました。「ファイル」などへの保存をご確認ください。');}
  async function stats(){try{const s=await store.stats();$('#photo-storage').textContent=`この端末に ${s.count}枚 · ${(s.bytes/1024/1024).toFixed(1)} / 100MB（上限200枚）`;}catch(e){$('#photo-storage').textContent=e.message;}}
  async function cover(t){const epoch=getEpoch(),journey=getJourney();if(!journey)return;
    try{const rows=await store.list(journey.id,t.id);if(!active(epoch))return;$('#album-count').textContent=rows.length+'枚';
      const photos=await Promise.all(rows.slice(0,3).map(p=>store.get(p.id)));if(!active(epoch))return;
      $('#album-preview').innerHTML=photos.filter(Boolean).map(p=>`<img src="${imageURL(p.thumb)}" alt="${esc(t.name)}の保存写真" width="96" height="72">`).join('');
    }catch(e){if(active(epoch))$('#album-count').textContent='保存領域を確認';}
  }
  async function album(t,limit=24){
    const journey=getJourney();if(!journey){toast('巡礼記録を読み込んでから写真を開いてください。');return;}
    const epoch=openDialog(`${t.name}の写真`, `<div class="album-heading"><span class="album-temple">第${t.id}番</span><div><strong>この一寺の、思い出。</strong><p>${esc(journey.name)}のアルバム</p></div></div><div class="photo-add-actions"><label class="secondary photo-input">写真を撮る<input id="photo-camera" type="file" accept="image/*" capture="environment"></label><label class="primary photo-input">写真を追加<input id="photo-select" type="file" accept="image/*" multiple></label></div><p class="tiny">この端末だけに保存します。写真の追加では訪問済みになりません。長辺1600px以内に縮小し、位置情報などの付加情報を除いて保存します。原本は別途保管してください。</p><div id="photo-grid" class="photo-grid"><p>アルバムを開いています…</p></div><div id="photo-more"></div>`);
    const select=async e=>{const files=[...e.target.files];e.target.value='';if(!files.length)return;if(files.length>10){showError(new Error('一度に追加できる写真は10枚までです。'));return;}await preview(t,journey,files);};
    $('#photo-camera').onchange=select;$('#photo-select').onchange=select;
    try{const rows=await store.list(journey.id,t.id);const photos=await Promise.all(rows.slice(0,limit).map(p=>store.get(p.id)));if(!active(epoch))return;
      $('#photo-grid').innerHTML=rows.length?photos.filter(Boolean).map(p=>`<button class="photo-tile" data-photo="${esc(p.id)}"><img src="${imageURL(p.thumb)}" alt="${esc(p.caption||t.name+'の写真')}" width="320" height="240"><span>${p.date?esc(p.date):'撮影日未設定'}</span>${p.caption?`<small>${esc(p.caption)}</small>`:''}</button>`).join(''):'<div class="album-empty"><span aria-hidden="true">▧</span><strong>まだ写真はありません</strong><p>境内の景色や旅の一枚を、<br>この札所のアルバムに残しましょう。</p></div>';
      document.querySelectorAll('[data-photo]').forEach(b=>b.onclick=()=>showPhoto(t,b.dataset.photo));
      if(rows.length>limit){$('#photo-more').innerHTML='<button class="secondary" id="more-photos">もっと見る</button>';$('#more-photos').onclick=()=>album(t,limit+24);}
    }catch(e){if(active(epoch))showError(e);}
  }
  async function preview(t,journey,files){
    const epoch=openDialog('写真を追加する',`<p>第${t.id}番 ${esc(t.name)} · ${esc(journey.name)}</p><p id="photo-processing" role="status">写真を準備しています…</p><div id="photo-preview-grid" class="photo-grid"></div><form id="photo-save-form" class="dialog-form" hidden><label>撮影日（任意）<input id="photo-date" type="date" min="1900-01-01" max="${japanDate()}"></label><label>写真のメモ（任意・300文字）<textarea id="photo-caption" maxlength="300" placeholder="例：山門から見た景色"></textarea></label><p class="tiny">この札所の今の巡礼に追加します。撮影日とメモは選んだ写真すべてに設定します。</p><div class="dialog-actions"><button class="quiet" type="button" id="photo-back">戻る</button><button class="primary" id="photo-save">この写真を保存</button></div></form>`);
    const prepared=[];
    try{for(let i=0;i<files.length;i++){const p=await preparePhoto(files[i]);if(!active(epoch))return;prepared.push(p);$('#photo-processing').textContent=`写真を準備しています… ${i+1} / ${files.length}`;}
      $('#photo-processing').textContent=`${prepared.length}枚を追加します。内容を確認して保存してください。`;
      $('#photo-preview-grid').innerHTML=prepared.map(p=>`<img src="${imageURL(p.thumb)}" alt="追加予定の写真" width="320" height="240">`).join('');$('#photo-save-form').hidden=false;
      $('#photo-back').onclick=()=>album(t);$('#photo-save-form').onsubmit=async e=>{e.preventDefault();const button=$('#photo-save');button.disabled=true;
        try{const r=await store.add(prepared.map(p=>({...p,journeyId:journey.id,templeId:t.id,date:$('#photo-date').value,caption:$('#photo-caption').value})));if(!active(epoch))return;await album(t);stats();toast(`${r.added}枚を保存しました。${r.skipped?'同じ写真'+r.skipped+'枚は登録済みです。':''}`);}catch(err){if(active(epoch)){showError(err);button.disabled=false;}}
      };
    }catch(e){if(active(epoch)){$('#photo-processing').textContent='写真を保存していません。';showError(e);}}
  }
  async function showPhoto(t,id){const epoch=openDialog(`${t.name}の写真`,'<p>写真を開いています…</p>');try{const p=await store.get(id);if(!active(epoch))return;if(!p)throw new Error('写真が見つかりません。');
    $('#dialog-content').innerHTML=`<img class="photo-full" src="${imageURL(p.blob)}" alt="${esc(p.caption||t.name+'の写真')}"><p>${p.date?esc(p.date):'撮影日未設定'}${p.caption?'<br>'+esc(p.caption):''}</p><div class="dialog-actions"><button class="secondary" id="photo-return">アルバムに戻る</button><button class="quiet" id="photo-download">写真を書き出す</button><button class="quiet danger" id="photo-remove">写真を削除</button></div>`;
    $('#photo-return').onclick=()=>album(t);$('#photo-download').onclick=()=>download(p.blob,`ohenro-${t.id}-${p.id}.jpg`);
    $('#photo-remove').onclick=()=>{const confirmEpoch=openDialog('写真を削除する',`<p>第${t.id}番 ${esc(t.name)} のこの写真を、端末内のアルバムから削除します。元には戻せません。必要な写真は先に書き出してください。</p><p class="tiny">iPhoneの「写真」にある原本や訪問記録には影響しません。</p><div class="dialog-actions"><button class="secondary" id="photo-cancel-delete">戻る</button><button class="quiet danger" id="photo-confirm-delete">この写真を削除する</button></div>`);$('#photo-cancel-delete').onclick=()=>showPhoto(t,id);$('#photo-confirm-delete').onclick=async e=>{e.target.disabled=true;try{await store.remove(id);if(active(confirmEpoch)){await album(t);stats();toast('写真を削除しました。');}}catch(err){if(active(confirmEpoch)){showError(err);e.target.disabled=false;}}};};
  }catch(e){if(active(epoch))showError(e);}}
  async function exportPhotos(){const journey=getJourney();if(!journey)return;const epoch=openDialog('写真のバックアップ',`<p>${esc(journey.name)} の写真を、札所番号付きのZIPにまとめます。</p><p class="tiny">写真・撮影日・メモが含まれます。訪問記録は従来のJSONで別に保存してください。</p><p id="photo-export-status" role="status">枚数を確認しています…</p><button class="primary" id="photo-export-confirm" disabled>写真ZIPを書き出す</button>`);
    try{const rows=await store.list(journey.id);if(!active(epoch))return;$('#photo-export-status').textContent=rows.length?rows.length+'枚の写真があります。':'この巡礼には写真がありません。';$('#photo-export-confirm').disabled=!rows.length;
      $('#photo-export-confirm').onclick=async e=>{e.target.disabled=true;try{const entries=[],photos=[];
        for(let i=0;i<rows.length;i++){const p=await store.get(rows[i].id);if(!active(epoch))return;if(!p)throw new Error('写真が変更されました。もう一度バックアップしてください。');const path=`photos/temple-${String(p.templeId).padStart(2,'0')}-${String(i+1).padStart(4,'0')}.jpg`;entries.push({name:path,blob:p.blob});photos.push({path,templeId:p.templeId,date:p.date,caption:p.caption,digest:p.digest});$('#photo-export-status').textContent=`まとめています… ${i+1} / ${rows.length}`;}
        entries.unshift({name:'manifest.json',blob:new Blob([JSON.stringify({format:'ohenro-quest-photos',version:1,journeyName:journey.name,exportedAt:new Date().toISOString(),photos},null,2)],{type:'application/json'})});
        const zip=await makePhotoZip(entries);if(!active(epoch))return;download(zip,`ohenro-photos-${japanDate()}.zip`);closeDialog();
      }catch(err){if(active(epoch)){showError(err);e.target.disabled=false;}}};
    }catch(e){if(active(epoch))showError(e);}
  }
  async function importPhotos(file){const journey=getJourney();if(!journey)return;const epoch=openDialog('写真バックアップを読み込む','<p id="photo-import-status" role="status">写真ZIPを確認しています…</p>');
    try{const data=await readPhotoZip(file);if(!active(epoch))return;
      $('#dialog-content').innerHTML=`<p>元の巡礼：${esc(data.manifest.journeyName)}<br>追加先：<strong>${esc(journey.name)}</strong><br>${data.manifest.photos.length}枚を札所ごとに追加します。</p><p class="tiny">既存の写真・訪問記録は置き換えません。確認後にすべての写真を準備し、一括で保存します。</p><p id="photo-import-status" role="status"></p><button class="primary" id="photo-import-confirm">この巡礼に写真を追加</button>`;
      $('#photo-import-confirm').onclick=async e=>{e.target.disabled=true;try{const prepared=[];for(const [i,p] of data.manifest.photos.entries()){const image=await prepareRestoredPhoto(data.entries.get(p.path));if(!active(epoch))return;prepared.push({...image,journeyId:journey.id,templeId:p.templeId,date:p.date,caption:p.caption});$('#photo-import-status').textContent=`写真を準備しています… ${i+1} / ${data.manifest.photos.length}`;}
        const result=await store.add(prepared);if(!active(epoch))return;closeDialog();stats();toast(`${result.added}枚を復元しました。${result.skipped?'同じ写真'+result.skipped+'枚は登録済みです。':''}`);
      }catch(err){if(active(epoch)){showError(err);e.target.disabled=false;}}};
    }catch(e){if(active(epoch))showError(e);}
  }
  return {cleanup,cover,album,stats,exportPhotos,importPhotos};
}
