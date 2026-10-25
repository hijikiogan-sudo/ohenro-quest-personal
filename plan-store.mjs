import {validatePlan} from './plan-domain.mjs';
export function createPlanStore({indexedDB=globalThis.indexedDB,scope='/'}={}){
  let db,pending;
  function open(){
    if(!indexedDB)return Promise.reject(new Error('このブラウザーでは予定を保存できません。通常のSafariで開いてください。'));
    if(db)return Promise.resolve(db);if(pending)return pending;
    pending=new Promise((resolve,reject)=>{
      let abandoned=false;const r=indexedDB.open('ohenro-plans:'+scope,1);
      r.onupgradeneeded=()=>{if(abandoned){r.transaction.abort();return;}r.result.createObjectStore('plans',{keyPath:'id'});};
      r.onsuccess=()=>{if(abandoned){r.result.close();return;}db=r.result;db.onversionchange=()=>{db.close();db=null;pending=null;};resolve(db);};
      r.onerror=()=>{pending=null;reject(new Error('予定の保存領域を開けません。既存記録は初期化していません。'));};
      r.onblocked=()=>{abandoned=true;pending=null;reject(new Error('ほかのタブを閉じて再読み込みしてください。'));};
    });return pending;
  }
  async function list(journeyId){const connection=await open();return new Promise((resolve,reject)=>{const tx=connection.transaction('plans','readonly'),r=tx.objectStore('plans').getAll();let rows; r.onsuccess=()=>{rows=r.result;};tx.oncomplete=()=>{try{rows.forEach(validatePlan);resolve(rows.filter(p=>!journeyId||p.journeyId===journeyId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));}catch(e){reject(new Error('保存済みの予定に不明な情報があります。初期化せず停止しました。'));}};tx.onabort=()=>reject(tx.error);});}
  async function saveMany(plans,{imported=false}={}){
    plans=structuredClone(plans);plans.forEach(validatePlan);if(new Set(plans.map(p=>p.id)).size!==plans.length)throw new Error('予定IDが重複しています。');
    const connection=await open();return new Promise((resolve,reject)=>{
      const tx=connection.transaction('plans','readwrite'),s=tx.objectStore('plans'),r=s.getAll();let error,saved=[];
      r.onsuccess=()=>{try{const rows=r.result;rows.forEach(validatePlan);const existing=new Map(rows.map(p=>[p.id,p]));
        if(rows.length+plans.filter(p=>!existing.has(p.id)).length>50)throw new Error('予定は50件まで保存できます。');
        for(const p of plans){const before=existing.get(p.id);if(imported&&before||before&&(before.revision!==p.revision||before.journeyId!==p.journeyId)||!before&&p.revision!==0)throw new Error('別の画面で予定が更新されています。保存済みの予定を開き直してください。');}
        const now=new Date().toISOString();saved=plans.map(p=>({...structuredClone(p),revision:p.revision+1,createdAt:existing.get(p.id)?.createdAt||now,updatedAt:now}));saved.forEach(p=>s.put(p));
      }catch(e){error=e;tx.abort();}};
      tx.oncomplete=()=>resolve(saved);tx.onabort=()=>reject(error?.name==='QuotaExceededError'?new Error('空き容量不足で予定を保存できません。'):error||new Error(tx.error?.name==='QuotaExceededError'?'空き容量不足で予定を保存できません。':'予定を保存できません。保存済みの予定は維持しました。'));
    });
  }
  async function remove(plan){
    const connection=await open();return new Promise((resolve,reject)=>{
      const tx=connection.transaction('plans','readwrite'),s=tx.objectStore('plans'),r=s.get(plan.id);let error;
      r.onsuccess=()=>{const before=r.result;if(!before||before.revision!==plan.revision||before.journeyId!==plan.journeyId){error=new Error('別の画面で予定が更新されています。保存済みの予定を開き直してください。');tx.abort();return;}s.delete(plan.id);};
      tx.oncomplete=()=>resolve();tx.onabort=()=>reject(error||new Error('予定を削除できません。保存済みの予定は維持しました。'));
    });
  }
  return {list,save:async p=>(await saveMany([p]))[0],import:async(plans,journeyId)=>saveMany(plans.map(p=>({...p,id:crypto.randomUUID(),journeyId,revision:0})),{imported:true}),remove,close(){db?.close();db=null;pending=null;}};
}
