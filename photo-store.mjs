import {validDate} from './domain.mjs';

export const PHOTO_LIMITS={count:200,total:100*1024*1024,each:1024*1024,batch:10};
const fail=m=>{throw new Error(m);};
const idOK=v=>typeof v==='string'&&v.length>0&&v.length<=100;
export function createPhotoStore({indexedDB=globalThis.indexedDB,scope='/',now=()=>Date.now(),uuid=()=>crypto.randomUUID(),limits=PHOTO_LIMITS}={}){
  let pending;
  function storageError(e){return e?.name==='QuotaExceededError'?new Error('写真を保存する空き容量が足りません。今回の写真は保存していません。写真をバックアップし、端末の空き容量を確認してください。'):e instanceof Error?e:new Error('写真の保存領域を利用できません。通常のSafariで開いてください。');}
  function open(){
    if(!indexedDB)return Promise.reject(new Error('写真の端末内保存を利用できません。'));
    if(!pending)pending=new Promise((resolve,reject)=>{
      const r=indexedDB.open('ohenro-photos:'+scope,1);let settled=false;
      const timer=setTimeout(()=>{settled=true;pending=null;reject(new Error('写真の保存領域の準備に時間がかかっています。別のタブを閉じて再読み込みしてください。'));},6000);
      r.onupgradeneeded=()=>{const s=r.result.createObjectStore('meta',{keyPath:'id'});s.createIndex('album',['journeyId','templeId']);s.createIndex('journey','journeyId');r.result.createObjectStore('images');};
      r.onsuccess=()=>{clearTimeout(timer);const db=r.result;if(settled){db.close();return;}settled=true;db.onversionchange=()=>{db.close();pending=null;};resolve(db);};
      r.onerror=()=>{clearTimeout(timer);settled=true;pending=null;reject(storageError(r.error));};r.onblocked=()=>{clearTimeout(timer);settled=true;pending=null;reject(new Error('ほかのアプリのタブを閉じて再読み込みしてください。'));};
    });return pending;
  }
  async function transaction(mode,run){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(['meta','images'],mode);let result,failure;tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(storageError(failure||tx.error));tx.onerror=()=>{};try{run(tx,v=>result=v,e=>{failure=e;tx.abort();});}catch(e){failure=e;tx.abort();}});}
  function validate(p){
    if(!p||!idOK(p.journeyId)||!Number.isInteger(p.templeId)||p.templeId<1||p.templeId>88||!validDate(p.date||'',now())||typeof(p.caption??'')!=='string'||(p.caption??'').length>300)fail('写真の札所・巡礼・撮影日・メモを確認してください。');
    if(!(p.blob instanceof Blob)||p.blob.type!=='image/jpeg'||!p.blob.size||p.blob.size>limits.each||!(p.thumb instanceof Blob)||p.thumb.type!=='image/jpeg'||p.thumb.size>128*1024||!p.thumb.size)fail('保存できる写真の形式・サイズではありません。');
    if(!Number.isInteger(p.width)||!Number.isInteger(p.height)||p.width<1||p.height<1||Math.max(p.width,p.height)>1600||! /^[a-f0-9]{64}$/.test(p.digest??''))fail('写真の情報を確認できません。');
  }
  return {
    async list(journeyId,templeId){return transaction('readonly',(tx,done)=>{const s=tx.objectStore('meta'),r=templeId?s.index('album').getAll([journeyId,templeId]):s.index('journey').getAll(journeyId);r.onsuccess=()=>done(r.result.sort((a,b)=>b.createdAt-a.createdAt));});},
    async stats(){return transaction('readonly',(tx,done)=>{const r=tx.objectStore('meta').getAll();r.onsuccess=()=>done({count:r.result.length,bytes:r.result.reduce((s,p)=>s+p.size,0)});});},
    async get(id){return transaction('readonly',(tx,done)=>{const r=tx.objectStore('meta').get(id);r.onsuccess=()=>{if(!r.result){done(null);return;}const image=tx.objectStore('images').get(id);image.onsuccess=()=>{if(!image.result){tx.abort();return;}done({...r.result,...image.result});};};});},
    async add(values){
      if(!Array.isArray(values)||!values.length||values.length>limits.count)fail('追加する写真を選んでください。');values.forEach(validate);
      return transaction('readwrite',(tx,done,abort)=>{const meta=tx.objectStore('meta'),images=tx.objectStore('images'),r=meta.getAll();r.onsuccess=()=>{try{
        const rows=r.result,keys=new Set(rows.map(p=>p.journeyId+'|'+p.templeId+'|'+p.digest));let bytes=rows.reduce((s,p)=>s+p.size,0),count=rows.length,added=0,skipped=0;
        for(const p of values){const key=p.journeyId+'|'+p.templeId+'|'+p.digest;if(keys.has(key)){skipped++;continue;}
          const size=p.blob.size+p.thumb.size;if(++count>limits.count||bytes+size>limits.total)fail('写真はこの端末で合計'+limits.count+'枚・'+Math.round(limits.total/1024/1024)+'MBまでです。写真をバックアップして整理してください。今回の追加はすべて保存していません。');
          bytes+=size;const id=uuid();const record={id,journeyId:p.journeyId,templeId:p.templeId,date:p.date||'',caption:(p.caption||'').trim(),width:p.width,height:p.height,digest:p.digest,size,createdAt:now()};
          meta.add(record);images.add({blob:p.blob,thumb:p.thumb},id);keys.add(key);added++;
        }done({added,skipped});
      }catch(e){abort(e);}};});
    },
    async remove(id){return transaction('readwrite',(tx,done,abort)=>{const r=tx.objectStore('meta').get(id);r.onsuccess=()=>{if(!r.result){abort(new Error('写真が見つかりません。'));return;}tx.objectStore('meta').delete(id);tx.objectStore('images').delete(id);done({ok:true});};});},
    async close(){if(pending){(await pending).close();pending=null;}}
  };
}
