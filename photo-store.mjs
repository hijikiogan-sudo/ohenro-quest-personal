import {validDate} from './domain.mjs';
// 枚数・合計容量の上限は設けず、端末の空き容量まで保存する（空きが足りないときは QuotaExceededError で止まる）。
export const PHOTO_LIMITS={count:Infinity,total:Infinity,each:1024*1024,batch:10};
const fail=m=>{throw new Error(m);};
const idOK=v=>typeof v==='string'&&v.length>0&&v.length<=100;
const templeOK=v=>v===null||(Number.isInteger(v)&&v>=1&&v<=88);
const normalized=p=>({...p,favorite:p.favorite===undefined?false:p.favorite,revision:p.revision===undefined?0:p.revision});
const key=p=>`${p.journeyId}|${p.templeId??'unassigned'}|${p.digest}`;
const migrationError=()=>Object.assign(new Error('既存写真のバックアップとアルバム更新を先に行ってください。写真は変更していません。'),{code:'PHOTO_MIGRATION_REQUIRED'});
export const photoFingerprint=rows=>JSON.stringify(rows.map(p=>[p.id,p.journeyId,p.templeId,p.date,p.caption,p.digest,p.size,p.createdAt,p.favorite??false,p.revision??0]).sort((a,b)=>a[0].localeCompare(b[0])));
export function createPhotoStore({indexedDB=globalThis.indexedDB,scope='/',now=()=>Date.now(),uuid=()=>crypto.randomUUID(),limits=PHOTO_LIMITS}={}){
  let pending,upgrading;
  const name='ohenro-photos:'+scope;
  function storageError(e){
    if(e?.name==='QuotaExceededError')return new Error('写真を保存する空き容量が足りません。今回の変更は保存していません。写真をバックアップし、端末の空き容量を確認してください。');
    if(e?.name==='VersionError')return new Error('写真の形式が更新されています。新しいアプリで開き直してください。写真は変更していません。');
    return e instanceof Error?e:new Error('写真の保存領域を利用できません。通常のSafariで開いてください。');
  }
  function connect(version,confirmed=false,expected){
    if(!indexedDB)return Promise.reject(new Error('写真の端末内保存を利用できません。'));
    return new Promise((resolve,reject)=>{
      const r=version?indexedDB.open(name,version):indexedDB.open(name);let settled=false,failure;
      const rejectOnce=e=>{if(settled)return;settled=true;clearTimeout(timer);reject(storageError(e));};
      const timer=setTimeout(()=>rejectOnce(new Error('写真の保存領域の準備に時間がかかっています。別のタブを閉じて再読み込みしてください。')),6000);
      r.onupgradeneeded=()=>{
        if(settled){r.transaction.abort();return;}
        const db=r.result,tx=r.transaction;
        if(!db.objectStoreNames.contains('meta')){const s=db.createObjectStore('meta',{keyPath:'id'});s.createIndex('album',['journeyId','templeId']);s.createIndex('journey','journeyId');}
        if(!db.objectStoreNames.contains('images'))db.createObjectStore('images');
        if(version!==2)return;
        const meta=tx.objectStore('meta'),images=tx.objectStore('images'),all=meta.getAll();
        const abort=e=>{failure=e;tx.abort();};
        all.onsuccess=()=>{try{
          if(all.result.length&&!confirmed)throw migrationError();
          if(expected!==undefined&&photoFingerprint(all.result)!==expected)throw new Error('バックアップ後に写真が変更されました。もう一度バックアップしてから更新してください。');
          for(const original of all.result){
            const p=normalized(original);
            if(!idOK(p.id)||!idOK(p.journeyId)||!templeOK(p.templeId)||!validDate(p.date,now())||typeof p.caption!=='string'||p.caption.length>300||typeof p.favorite!=='boolean'||!Number.isInteger(p.revision)||p.revision<0||!Number.isFinite(p.createdAt)||!Number.isFinite(p.size)||p.size<=0||!/^[a-f0-9]{64}$/.test(p.digest??''))throw new Error('保存された写真の情報を確認できません。更新を中断し、元の写真を保持しました。');
            const image=images.get(p.id);image.onsuccess=()=>{try{validate({...p,...image.result});if(p.size!==image.result.blob.size+image.result.thumb.size)fail('写真の保存容量を確認できません。更新を中断しました。');meta.put(p);}catch(e){abort(e);}};
          }
        }catch(e){abort(e);}};
      };
      r.onsuccess=()=>{clearTimeout(timer);const db=r.result;if(settled){db.close();return;}if(db.version>2){db.close();rejectOnce(new Error('このアプリより新しい写真形式です。記録を初期化せず停止しました。'));return;}settled=true;db.onversionchange=()=>{db.close();pending=null;};resolve(db);};
      r.onerror=()=>rejectOnce(failure||r.error);
      r.onblocked=()=>rejectOnce(new Error('ほかのタブで写真を開いています。そのタブを閉じてから、もう一度更新してください。'));
    });
  }
  function open(){if(!pending)pending=connect().catch(e=>{pending=null;throw e;});return pending;}
  async function transaction(mode,run){const db=await open();return new Promise((resolve,reject)=>{
    let tx;try{tx=db.transaction(['meta','images'],mode);}catch(e){reject(storageError(e));return;}
    let result,failure;tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(storageError(failure||tx.error));tx.onerror=()=>{};
    try{run(tx,v=>result=v,e=>{failure=e;tx.abort();});}catch(e){failure=e;tx.abort();}
  });}
  function validate(p){
    if(!p||!idOK(p.journeyId)||!templeOK(p.templeId)||!validDate(p.date||'',now())||typeof(p.caption??'')!=='string'||(p.caption??'').length>300||(p.favorite!==undefined&&typeof p.favorite!=='boolean'))fail('写真の札所・巡礼・撮影日・メモを確認してください。');
    if(!(p.blob instanceof Blob)||p.blob.type!=='image/jpeg'||!p.blob.size||p.blob.size>limits.each||!(p.thumb instanceof Blob)||p.thumb.type!=='image/jpeg'||p.thumb.size>128*1024||!p.thumb.size)fail('保存できる写真の形式・サイズではありません。');
    if(!Number.isInteger(p.width)||!Number.isInteger(p.height)||p.width<1||p.height<1||Math.max(p.width,p.height)>1600||!/^[a-f0-9]{64}$/.test(p.digest??''))fail('写真の情報を確認できません。');
  }
  async function migrate({confirmed=false,expected}={}){
    if(upgrading)return upgrading;
    upgrading=(async()=>{const db=await open();if(db.version===2)return {ok:true};db.close();pending=null;pending=connect(2,confirmed,expected).catch(e=>{pending=null;throw e;});await pending;return {ok:true};})();
    try{return await upgrading;}finally{upgrading=null;}
  }
  async function writable(){const db=await open();if(db.version===2)return;await migrate();}
  const rowsFrom=(tx,journeyId)=>journeyId?tx.objectStore('meta').index('journey').getAll(journeyId):tx.objectStore('meta').getAll();
  const api={
    async status(){const db=await open(),s=await api.stats();return {...s,version:db.version,needsMigration:db.version<2&&s.count>0};},migrate,
    async list(journeyId,templeId){return transaction('readonly',(tx,done)=>{const r=templeId?tx.objectStore('meta').index('album').getAll([journeyId,templeId]):rowsFrom(tx,journeyId);r.onsuccess=()=>done(r.result.map(normalized).sort((a,b)=>b.createdAt-a.createdAt));});},
    async stats(){return transaction('readonly',(tx,done)=>{const r=tx.objectStore('meta').getAll();r.onsuccess=()=>done({count:r.result.length,bytes:r.result.reduce((s,p)=>s+p.size,0)});});},
    async get(id){return transaction('readonly',(tx,done,abort)=>{const r=tx.objectStore('meta').get(id);r.onsuccess=()=>{if(!r.result){done(null);return;}const image=tx.objectStore('images').get(id);image.onsuccess=()=>{if(!image.result){abort(new Error('写真の画像を読み取れません。保存データを初期化せず停止しました。'));return;}done({...normalized(r.result),...image.result});};};});},
    async snapshot(journeyId){return transaction('readonly',(tx,done,abort)=>{const r=rowsFrom(tx,journeyId);r.onsuccess=()=>{const rows=r.result.map(normalized);if(!rows.length){done([]);return;}let left=rows.length;const result=[];for(const p of rows){const image=tx.objectStore('images').get(p.id);image.onsuccess=()=>{if(!image.result){abort(new Error('写真の画像を読み取れません。バックアップを中断しました。'));return;}result.push({...p,...image.result});if(!--left)done(result.sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id)));};}};});},
    async add(values){
      if(!Array.isArray(values)||!values.length||values.length>limits.count)fail('追加する写真を選んでください。');values.forEach(validate);await writable();
      return transaction('readwrite',(tx,done,abort)=>{const meta=tx.objectStore('meta'),images=tx.objectStore('images'),r=meta.getAll();r.onsuccess=()=>{try{
        const rows=r.result,keys=new Set(rows.map(key));let bytes=rows.reduce((s,p)=>s+p.size,0),count=rows.length,added=0,skipped=0;
        for(const p of values){const k=key(p);if(keys.has(k)){skipped++;continue;}const size=p.blob.size+p.thumb.size;
          if(++count>limits.count||bytes+size>limits.total)fail('写真はこの端末で合計'+limits.count+'枚・'+Math.round(limits.total/1024/1024)+'MBまでです。写真をバックアップして整理してください。今回の追加はすべて保存していません。');
          bytes+=size;const id=uuid();meta.add({id,journeyId:p.journeyId,templeId:p.templeId,date:p.date||'',caption:(p.caption||'').trim(),favorite:p.favorite??false,revision:0,width:p.width,height:p.height,digest:p.digest,size,createdAt:now()});images.add({blob:p.blob,thumb:p.thumb},id);keys.add(k);added++;
        }done({added,skipped});
      }catch(e){abort(e);}};});
    },
    async update(changes){
      if(!Array.isArray(changes)||!changes.length||changes.length>limits.count||new Set(changes.map(c=>c.id)).size!==changes.length)fail('編集する写真を確認してください。');
      for(const c of changes){if(!idOK(c.id)||!idOK(c.journeyId)||!Number.isInteger(c.revision)||c.revision<0||!c.patch||!Object.keys(c.patch).length||Object.keys(c.patch).some(k=>!['templeId','date','caption','favorite'].includes(k)))fail('写真の編集内容を確認してください。');}
      await writable();return transaction('readwrite',(tx,done,abort)=>{const meta=tx.objectStore('meta'),r=meta.getAll();r.onsuccess=()=>{try{
        const rows=r.result.map(normalized),byId=new Map(rows.map(p=>[p.id,p])),keys=new Set(rows.map(key));let updated=0,skipped=0;
        const candidates=changes.map(c=>{const old=byId.get(c.id);if(!old||old.journeyId!==c.journeyId)fail('写真が見つかりません。再読み込みしてください。');if(old.revision!==c.revision)fail('別の画面で写真が変更されています。最新の内容を開き直してください。');const next={...old,...c.patch};if(!templeOK(next.templeId)||typeof next.date!=='string'||!validDate(next.date,now())||typeof next.caption!=='string'||next.caption.length>300||typeof next.favorite!=='boolean')fail('写真の撮影日・メモ・札所を確認してください。');next.caption=next.caption.trim();return {old,next};});
        for(const {old,next} of candidates){if(key(old)!==key(next)&&keys.has(key(next))){skipped++;continue;}if(['date','caption','templeId','favorite'].every(k=>old[k]===next[k]))continue;keys.delete(key(old));keys.add(key(next));meta.put({...next,revision:old.revision+1});updated++;}done({updated,skipped});
      }catch(e){abort(e);}};});
    },
    async remove(id,expected={}){await writable();return transaction('readwrite',(tx,done,abort)=>{const r=tx.objectStore('meta').get(id);r.onsuccess=()=>{const p=r.result&&normalized(r.result);if(!p){abort(new Error('写真が見つかりません。'));return;}if((expected.journeyId&&p.journeyId!==expected.journeyId)||(expected.revision!==undefined&&p.revision!==expected.revision)){abort(new Error('写真が変更されています。最新の内容を開き直してください。'));return;}tx.objectStore('meta').delete(id);tx.objectStore('images').delete(id);done({ok:true});};});},
    async close(){if(upgrading)try{await upgrading;}catch{}if(pending){(await pending).close();pending=null;}}
  };return api;
}
