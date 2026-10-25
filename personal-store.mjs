import {assessGPS, japanDate, validDate} from './domain.mjs';

const MAX_JOURNEYS=50,MAX_VISITS=10000;
const nameOK=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=max;
const fail=message=>{throw new Error(message);};
const validID=v=>typeof v==='string'&&v.length>0&&v.length<=100;

export function createPersonalStore({indexedDB=globalThis.indexedDB,scope='/',temples,parkingFor=()=>null,now=()=>Date.now(),uuid=()=>crypto.randomUUID()}={}) {
  let dbPromise;
  const challenges=new Map();
  function fresh() {
    return {version:1,journeys:[{id:uuid(),name:'はじめての巡礼',createdAt:now()}],visits:[],lastExportAt:null,revision:0};
  }
  function storageError(e) {
    if(e?.name==='QuotaExceededError')return new Error('端末の保存容量が足りません。変更は保存されていません。記録をバックアップし、端末の空き容量を確認してください。');
    return e instanceof Error?e:new Error('このブラウザの保存領域を利用できません。通常のSafariで開き直してください。');
  }
  function open() {
    if(!indexedDB)return Promise.reject(new Error('このブラウザでは端末内保存を利用できません。通常のSafariで開いてください。'));
    if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
      let settled=false;
      const request=indexedDB.open('ohenro-personal:'+scope,1);
      const timeout=setTimeout(()=>{settled=true;reject(new Error('保存領域の準備に時間がかかっています。このアプリの別のタブを閉じて再読み込みしてください。'));},6000);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('records'))request.result.createObjectStore('records');};
      request.onsuccess=()=>{
        clearTimeout(timeout);
        if(settled){request.result.close();return;}
        settled=true;
        const db=request.result;
        db.onversionchange=()=>{db.close();dbPromise=null;};
        resolve(db);
      };
      request.onerror=()=>{clearTimeout(timeout);settled=true;reject(storageError(request.error));};
      request.onblocked=()=>{clearTimeout(timeout);settled=true;reject(new Error('このアプリの別のタブを閉じてから再読み込みしてください。'));};
    });
    return dbPromise;
  }
  function validVisit(v) {
    if(!v||!Number.isInteger(v.templeId)||!temples().some(t=>t.id===v.templeId)||!validDate(v.date,now())||typeof(v.note??'')!=='string'||(v.note??'').length>500)fail('札所・訪問日・メモを確認してください。未来の日付は登録できません。');
    return {templeId:v.templeId,date:v.date||'',note:(v.note||'').trim()};
  }
  function validate(saved) {
    if(!saved||saved.version!==1||!Array.isArray(saved.journeys)||saved.journeys.length<1||saved.journeys.length>MAX_JOURNEYS||!Array.isArray(saved.visits)||saved.visits.length>MAX_VISITS)fail('端末内の記録を読み取れませんでした。記録を自動で初期化せず停止しました。再読み込みしても直らない場合はご相談ください。');
    const ids=new Set();
    for(const j of saved.journeys){if(!validID(j.id)||ids.has(j.id)||!nameOK(j.name,60))fail('保存された巡礼の形式を確認できません。記録は変更していません。');ids.add(j.id);}
    const visits=new Set();
    for(const v of saved.visits){validVisit(v);if(!validID(v.id)||visits.has(v.id)||!ids.has(v.journeyId))fail('保存された訪問の形式を確認できません。記録は変更していません。');visits.add(v.id);}
    return saved;
  }
  async function withState(fn,write=false) {
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('records','readwrite'),store=tx.objectStore('records');
      let result,failure;
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(storageError(failure||tx.error));
      tx.onerror=()=>{};
      const get=store.get('state');
      get.onsuccess=()=>{
        try {
          const saved=get.result===undefined?fresh():validate(get.result);
          const draft=structuredClone(saved);
          result=fn(draft);
          if(write||get.result===undefined){if(write)draft.revision++;store.put(draft,'state');}
        }catch(e){failure=e;tx.abort();}
      };
    });
  }
  function ownJourney(s,id){if(!s.journeys.some(j=>j.id===id))fail('巡礼記録が見つかりません。画面を再読み込みしてください。');}
  function insert(s,journeyId,values,method='manual',gps={}) {
    ownJourney(s,journeyId);
    const live=new Set(s.visits.filter(v=>v.deletedAt===null).map(v=>`${v.journeyId}|${v.templeId}|${v.date}`));
    let added=0;
    for(const v of values){
      const key=`${journeyId}|${v.templeId}|${v.date}`;
      if(live.has(key))continue;
      if(s.visits.length>=MAX_VISITS)fail('この端末の記録は合計1万件までです。記録をバックアップしてください。');
      s.visits.unshift({id:uuid(),journeyId,...v,method,accuracy:gps.accuracy??null,distance:gps.distance??null,author:'自分',createdAt:now(),deletedAt:null});
      live.add(key);added++;
    }
    return {added,skipped:values.length-added};
  }
  return {
    async call(route,b={}) {
      if(route==='status')return {initialized:true};
      if(route==='state')return withState(s=>({user:{id:'personal',name:'設定',role:'owner'},group:{id:'personal',name:'この端末の巡礼'},members:[],csrf:'',journeys:s.journeys,visits:s.visits.filter(v=>v.deletedAt===null),lastExportAt:s.lastExportAt,revision:s.revision}));
      if(route==='journeys'){
        if(!nameOK(b.name,60))fail('巡礼名は1〜60文字で入力してください。');
        return withState(s=>{if(s.journeys.length>=MAX_JOURNEYS)fail('巡礼は50件までです。');const id=uuid();s.journeys.push({id,name:b.name.trim(),createdAt:now()});return {id};},true);
      }
      if(route==='visits'){
        if(!Array.isArray(b.visits)||b.visits.length<1||b.visits.length>88)fail('1〜88件の札所を選択してください。');
        const values=b.visits.map(validVisit);
        return withState(s=>insert(s,b.journeyId,values),true);
      }
      if(route==='visit/void'||route==='visit/undo')return withState(s=>{
        const v=s.visits.find(v=>v.id===b.id&&(route==='visit/void'?v.deletedAt===null:v.deletedAt!==null));
        if(!v)fail('訪問記録が見つかりません。');
        if(route==='visit/undo'&&s.visits.some(other=>other.id!==v.id&&other.deletedAt===null&&other.journeyId===v.journeyId&&other.templeId===v.templeId&&other.date===v.date))fail('同じ札所・日付の訪問があるため復元できません。');
        v.deletedAt=route==='visit/void'?now():null;return {ok:true};
      },true);
      if(route==='gps/challenge'){
        await withState(s=>ownJourney(s,b.journeyId));
        if(!temples().some(t=>t.id===b.templeId))fail('札所を選択してください。');
        for(const [id,c] of challenges)if(c.expires<now())challenges.delete(id);
        const id=uuid();challenges.set(id,{templeId:b.templeId,journeyId:b.journeyId,expires:now()+90000});return {id};
      }
      if(route==='gps/checkin'){
        const c=challenges.get(b.challengeId);
        if(!c||c.expires<now()||c.pending)fail('測位の有効期限が切れました。再度チェックインしてください。');
        const assessed=assessGPS(b.position,temples().find(t=>t.id===c.templeId),now(),parkingFor(c.templeId));
        if(!assessed.ok)fail(assessed.message);
        c.pending=true;
        try {const result=await withState(s=>insert(s,c.journeyId,[{templeId:c.templeId,date:japanDate(now()),note:''}],'gps-self-reported',assessed),true);challenges.delete(b.challengeId);return {...result,...assessed};}
        catch(e){c.pending=false;throw e;}
      }
      if(route==='export')return withState(s=>({format:'ohenro-quest',version:1,exportedAt:new Date(now()).toISOString(),groupName:'個人の巡礼',journeys:s.journeys.map(({id,name})=>({id,name})),visits:s.visits.filter(v=>v.deletedAt===null).map(({journeyId,templeId,date,note,method})=>({journeyId,templeId,date,note,method}))}));
      if(route==='backup/exported')return withState(s=>{s.lastExportAt=now();return {ok:true};},true);
      if(route==='import'){
        const data=b.backup;
        if(!data||data.format!=='ohenro-quest'||data.version!==1||!Array.isArray(data.journeys)||data.journeys.length<1||data.journeys.length>MAX_JOURNEYS||!Array.isArray(data.visits)||data.visits.length>MAX_VISITS||new TextEncoder().encode(JSON.stringify(data)).length>5*1024*1024)fail('対応するバックアップ形式ではありません（5MB・50巡礼・1万訪問まで）。');
        const sourceIds=new Set();
        for(const j of data.journeys){if(!validID(j?.id)||sourceIds.has(j.id)||!nameOK(j.name,60))fail('バックアップ内の巡礼名・IDが不正です。');sourceIds.add(j.id);}
        if(data.visits.some(v=>!sourceIds.has(v?.journeyId)))fail('バックアップ内の巡礼参照が不正です。');
        const values=data.visits.map(validVisit);
        if(b.restoreJourneys===true)return withState(s=>{
          if(s.journeys.length+data.journeys.length>MAX_JOURNEYS)fail('巡礼の合計は50件までです。');
          let added=0,skipped=0;const journeyIds=[];
          for(const j of data.journeys){const id=uuid();journeyIds.push(id);s.journeys.push({id,name:(j.name+'（復元）').slice(0,60),createdAt:now()});const r=insert(s,id,values.filter((_,i)=>data.visits[i].journeyId===j.id),'imported-manual');added+=r.added;skipped+=r.skipped;}
          return {added,skipped,journeyIds};
        },true);
        if(data.journeys.length!==1)fail('複数巡礼のバックアップは新しい巡礼として復元してください。');
        return withState(s=>insert(s,b.targetJourneyId,values,'imported-manual'),true);
      }
      fail('個人版ではこの操作を利用できません。');
    },
    async close(){if(dbPromise){(await dbPromise).close();dbPromise=null;}}
  };
}
