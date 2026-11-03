// バックアップのお知らせ。記録と写真は端末の中だけにあるので、まだ保存していない記録が増えたらホームで一言知らせる。
// 出すのは「一度も保存していない」「巡礼を終えた」「前回から14日以上たった」のどれかで、前回の保存より後に記録や写真が増えたときだけ。
const DAY=24*60*60*1000;
export const STALE_DAYS=14,SNOOZE_DAYS=3;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function backupReminder({lastExportAt=null,visits=[],photos=[],endedAt=null,snoozedUntil=0,now=Date.now()}){
  if(snoozedUntil>now)return null;
  const after=t=>Number.isFinite(t)&&(lastExportAt===null||t>lastExportAt);
  const newVisits=visits.filter(v=>after(v.createdAt)).length,newPhotos=photos.filter(p=>after(p.createdAt)).length;
  if(!newVisits&&!newPhotos)return null;
  const days=lastExportAt===null?null:Math.floor((now-lastExportAt)/DAY);
  const reason=lastExportAt===null?'never':after(endedAt)?'ended':days>=STALE_DAYS?'stale':null;
  return reason&&{reason,days,newVisits,newPhotos};
}

export function reminderText(r){
  const added=[r.newVisits&&`${r.newVisits}寺の記録`,r.newPhotos&&`写真${r.newPhotos}枚`].filter(Boolean).join('と');
  const head={never:'まだ一度もバックアップしていません',ended:'巡礼おつかれさまでした',stale:`前回のバックアップから${r.days}日たちました`}[r.reason];
  return {head,body:`${r.reason==='never'?`${added}は、まだファイルに保存していません。`:`前回のあとに${added}が増えています。`}記録と写真はこの端末の中だけにあるので、アイコンの削除や機種変更で消えないよう、ファイルに保存しておきましょう。`};
}

export function createBackupReminder({document=globalThis.document,storage=globalThis.localStorage,scope='',getState,getJourneys,photos,todayStore,onSave,now=Date.now}){
  const key='ohenro-backup-snooze:'+scope;
  const snoozed=()=>{try{return Number(storage.getItem(key))||0;}catch{return 0;}};
  let token=0;
  async function render(){
    const root=document.querySelector('#backup-reminder');if(!root)return;const mine=++token;
    try{
      const state=getState();if(!state){root.hidden=true;return;}
      const journeys=getJourneys(),rows=[];let endedAt=null;
      for(const j of journeys){rows.push(...await photos.list(j.id));const s=await todayStore.get(j.id).catch(()=>null);if(s?.status==='ended'&&(endedAt===null||s.endedAt>endedAt))endedAt=s.endedAt;}
      if(mine!==token)return;
      const r=backupReminder({lastExportAt:state.lastExportAt??null,visits:state.visits,photos:rows,endedAt,snoozedUntil:snoozed(),now:now()});
      if(!r){root.hidden=true;root.innerHTML='';return;}
      const t=reminderText(r);
      root.innerHTML=`<div><strong>${esc(t.head)}</strong><span>${esc(t.body)}</span></div><div class="backup-reminder-actions"><button type="button" class="primary" id="backup-reminder-save">今すぐバックアップ</button><button type="button" class="quiet" id="backup-reminder-later">あとで</button></div>`;
      root.hidden=false;
      document.querySelector('#backup-reminder-save').onclick=onSave;
      document.querySelector('#backup-reminder-later').onclick=()=>{try{storage.setItem(key,String(now()+SNOOZE_DAYS*DAY));}catch{}root.hidden=true;};
    }catch{if(mine===token)root.hidden=true;}
  }
  return {render};
}
