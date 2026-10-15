import {validatePlan} from './plan-domain.mjs';
import {japanDate} from './domain.mjs';
const fail=message=>{throw new Error(message);};
const idOK=v=>typeof v==='string'&&v.length>0&&v.length<=100;
const dateOK=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function validateOuting(s){
  if(!s||s.version!==1||!idOK(s.id)||!idOK(s.journeyId)||!idOK(s.planId)||typeof s.name!=='string'||!s.name.trim()||s.name.length>80||!Number.isInteger(s.revision)||s.revision<1||!['active','ended'].includes(s.status))fail('巡礼の進行情報を確認できません。初期化せず停止しました。');
  if(!Array.isArray(s.dates)||!s.dates.length||s.dates.length>366||s.dates.some(d=>!dateOK(d))||new Set(s.dates).size!==s.dates.length||[...s.dates].sort().join()!==s.dates.join())fail('巡礼の日付を確認できません。');
  if(!Number.isFinite(s.startedAt)||!Number.isFinite(s.updatedAt)||s.updatedAt<s.startedAt||(s.status==='active'?s.endedAt!==null:(!Number.isFinite(s.endedAt)||s.endedAt<s.startedAt||s.endedAt>s.updatedAt)))fail('巡礼の開始・終了情報を確認できません。');
  if(!Array.isArray(s.stops)||!s.stops.length||s.stops.length>88||new Set(s.stops.map(p=>p?.templeId)).size!==s.stops.length)fail('巡礼の札所を確認できません。');
  for(const p of s.stops)if(!p||!Number.isInteger(p.templeId)||p.templeId<1||p.templeId>88||!Number.isInteger(p.minutes)||p.minutes<0||p.minutes>480||typeof p.skipped!=='boolean')fail('巡礼の札所・参拝時間を確認できません。');
  return s;
}
export function outingProgress(s,visits,today=japanDate()){
  validateOuting(s);
  const current=visits.filter(v=>v.journeyId===s.journeyId&&s.dates.includes(v.date)&&!v.deletedAt),done=new Set(current.map(v=>v.templeId)),todayDone=new Set(current.filter(v=>v.date===today).map(v=>v.templeId));
  const rows=s.stops.map(p=>({...p,status:done.has(p.templeId)?'visited':p.skipped?'skipped':'pending',todayVisited:todayDone.has(p.templeId)}));
  return {rows,next:rows.find(p=>p.status==='pending')||null,done:rows.filter(p=>p.status==='visited').length,skipped:rows.filter(p=>p.status==='skipped').length,total:rows.length,todayDone:rows.filter(p=>p.todayVisited).length,needsResume:s.status==='active'&&!s.dates.includes(today)};
}
export function createTodayStore({indexedDB=globalThis.indexedDB,scope='/',now=()=>Date.now(),uuid=()=>crypto.randomUUID()}={}){
  let db,pending;
  function open(){if(!indexedDB)return Promise.reject(new Error('このブラウザーでは進行を保存できません。通常のSafariで開いてください。'));if(db)return Promise.resolve(db);if(pending)return pending;
    pending=new Promise((resolve,reject)=>{let abandoned=false;const r=indexedDB.open('ohenro-today:'+scope,1);
      r.onupgradeneeded=()=>{if(abandoned){r.transaction.abort();return;}const s=r.result.createObjectStore('outings',{keyPath:'id'});s.createIndex('journey','journeyId');};
      r.onsuccess=()=>{if(abandoned){r.result.close();return;}db=r.result;db.onversionchange=()=>{db.close();db=null;pending=null;};resolve(db);};
      r.onerror=()=>{pending=null;reject(new Error('巡礼の進行を読み込めません。既存記録は初期化していません。'));};
      r.onblocked=()=>{abandoned=true;pending=null;reject(new Error('ほかのタブを閉じて再読み込みしてください。'));};});return pending;
  }
  async function transact(journeyId,write,run){const connection=await open();return new Promise((resolve,reject)=>{const tx=connection.transaction('outings',write?'readwrite':'readonly'),s=tx.objectStore('outings'),r=s.index('journey').getAll(journeyId);let value,error;
    r.onsuccess=()=>{try{r.result.forEach(validateOuting);value=run(r.result,s);}catch(e){error=e;tx.abort();}};
    tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(error?.name==='QuotaExceededError'||tx.error?.name==='QuotaExceededError'?new Error('空き容量不足で進行を保存できません。元の進行は維持しています。'):error||new Error('進行を保存できません。元の進行は維持しています。'));});}
  async function get(journeyId){return transact(journeyId,false,rows=>{if(rows.filter(s=>s.status==='active').length>1)fail('進行中の巡礼に不整合があります。初期化せず停止しました。');return rows.find(s=>s.status==='active')||rows.sort((a,b)=>b.updatedAt-a.updatedAt||b.id.localeCompare(a.id))[0]||null;});}
  async function start(plan){const copy=structuredClone(plan);validatePlan(copy);if(!copy.stops.length)fail('予定に札所を1つ以上選んで保存してください。');return transact(copy.journeyId,true,(rows,store)=>{
    if(rows.some(s=>s.status==='active'))fail('進行中の巡礼があります。先に終了するか、続きから再開してください。');
    if(rows.length>=500)fail('この巡礼の進行履歴は500件までです。新しい巡礼の記録をご利用ください。');
    const at=now(),s={version:1,id:uuid(),journeyId:copy.journeyId,planId:copy.id,name:copy.name,status:'active',revision:1,dates:[japanDate(at)],startedAt:at,updatedAt:at,endedAt:null,stops:copy.stops.map(p=>({templeId:p.templeId,minutes:p.minutes,skipped:false}))};validateOuting(s);store.add(s);return s;
  });}
  async function update(ref,action){const expected=structuredClone(ref),op=structuredClone(action);if(!idOK(expected.id)||!idOK(expected.journeyId)||!Number.isInteger(expected.revision))fail('進行の参照を確認してください。');return transact(expected.journeyId,true,(rows,store)=>{
    const original=rows.find(s=>s.id===expected.id);if(!original||original.revision!==expected.revision)fail('別の画面で進行が更新されています。閉じてホームを開き直してください。');
    const s=structuredClone(original),at=now();
    if(op.type==='resume'){
      if(rows.some(r=>r.id!==s.id&&r.status==='active'))fail('ほかの巡礼が進行中です。');
      const date=japanDate(at);if(date<s.dates[0])fail('端末の日付が開始日より前になっています。日付を確認してください。');
      s.status='active';s.endedAt=null;if(!s.dates.includes(date))s.dates.push(date);s.dates.sort();
    }else{if(s.status!=='active')fail('巡礼は終了しています。先に続きから再開してください。');
      if(op.type==='end'){s.status='ended';s.endedAt=at;}
      else if(op.type==='skip'){const p=s.stops.find(p=>p.templeId===op.templeId);if(!p||typeof op.skipped!=='boolean')fail('見送る札所を確認してください。');p.skipped=op.skipped;}
      else if(op.type==='move'){const i=s.stops.findIndex(p=>p.templeId===op.templeId),j=i+op.delta;if(i<0||![-1,1].includes(op.delta)||j<0||j>=s.stops.length)fail('変更する順番を確認してください。');[s.stops[i],s.stops[j]]=[s.stops[j],s.stops[i]];}
      else fail('この操作には対応していません。');
    }
    s.updatedAt=at;s.revision++;validateOuting(s);store.put(s);return s;
  });}
  return {get,start,update,close(){db?.close();db=null;pending=null;}};
}
