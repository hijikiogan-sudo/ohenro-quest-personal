const fail=message=>{throw new Error(message);};
const text=(s,max)=>typeof s==='string'&&s.length<=max&&!/[\u0000-\u001f]/.test(s);
// 泊まりがけ：nights は [{after:その日の最後の札所の位置（0始まり）, place:宿の名前・住所（空でもよい）}]。
// dayStart は2日目以降の出発時刻。どちらも無い予定は1日の予定として扱う（古い版の予定・バックアップもそのまま読める）。
export const DAY_START='08:00';
const hhmmOK=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export function validatePlan(p){
  if(!p||!text(p.id,100)||!p.id||!text(p.journeyId,100)||!p.journeyId||!text(p.name,80)||!p.name.trim()||!Number.isInteger(p.revision)||p.revision<0)fail('予定の情報を確認してください。');
  if(typeof p.departAt!=='string'||(p.departAt&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(p.departAt)))fail('出発日時を確認してください。');
  if(p.departAt){const [date,time]=p.departAt.split('T'),[y,m,day]=date.split('-').map(Number),[h,min]=time.split(':').map(Number);if(y<1900||y>2100||m<1||m>12||day<1||day>new Date(Date.UTC(y,m,0)).getUTCDate()||h>23||min>59)fail('出発日時を確認してください。');}
  for(const field of ['createdAt','updatedAt'])if(p[field]!==undefined&&(!text(p[field],40)||!Number.isFinite(Date.parse(p[field]))))fail('予定の保存日時を確認してください。');
  for(const [end,types] of [[p.origin,['current','temple','address']],[p.returnTo,['none','temple','address']]]){
    if(!end||!types.includes(end.kind))fail('出発地・帰着地を確認してください。');
    if(end.kind==='temple'&&(!Number.isInteger(end.templeId)||end.templeId<1||end.templeId>88))fail('出発地・帰着地の札所を確認してください。');
    if(end.kind==='address'&&(!text(end.address,120)||!end.address.trim()))fail('住所・地点名は120文字以内で入力してください。');
  }
  if(!Array.isArray(p.stops)||p.stops.length>88||new Set(p.stops.map(s=>s?.templeId)).size!==p.stops.length)fail('札所の重複・件数を確認してください。');
  for(const s of p.stops)if(!s||!Number.isInteger(s.templeId)||s.templeId<1||s.templeId>88||!Number.isInteger(s.minutes)||s.minutes<0||s.minutes>480)fail('参拝時間は0〜480分で入力してください。');
  if(p.nights!==undefined){if(!Array.isArray(p.nights)||p.nights.length>30)fail('泊まる日の区切りを確認してください。');let last=-1;for(const n of p.nights){if(!n||!Number.isInteger(n.after)||n.after<=last||n.after>p.stops.length-2)fail('泊まる日の区切りを確認してください。');if(!text(n.place,120))fail('宿の名前・住所は120文字以内で入力してください。');last=n.after;}}
  if(p.dayStart!==undefined&&!hhmmOK(p.dayStart))fail('2日目からの出発時刻を確認してください。');
  return p;
}
export function planLocation(value,temples,parkingFor=()=>null){
  if(value.kind==='none'||value.kind==='current')return null;
  if(value.kind==='address')return {label:value.address,query:value.address};
  const t=temples.find(t=>t.id===value.templeId);if(!t)fail('札所データを読み込めません。');
  // 駐車場の座標が分かる札所は駐車場を経由地にする。
  const p=parkingFor(t.id);
  if(p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng))return {label:`第${t.id}番 ${t.name}（駐車場）`,query:`${p.lat.toFixed(6)},${p.lng.toFixed(6)}`,templeId:t.id,parking:true};
  return {label:`第${t.id}番 ${t.name}`,query:`${t.name} ${t.address}`,templeId:t.id};
}
export function mapsURL(origin,targets){
  if(!targets.length)fail('行き先を選んでください。');
  const u=new URL('https://www.google.com/maps/dir/');u.searchParams.set('api','1');u.searchParams.set('travelmode','driving');
  if(origin)u.searchParams.set('origin',origin.query);
  u.searchParams.set('destination',targets.at(-1).query);
  if(targets.length>1)u.searchParams.set('waypoints',targets.slice(0,-1).map(t=>t.query).join('|'));
  return u.href;
}
// 日ごとの範囲。stay はその日の宿（最終日は null、宿を入れていない日は ''）。
export function planDays(plan){const days=[];let from=0;(plan.nights||[]).forEach((n,i)=>{days.push({day:i+1,from,to:n.after,stay:n.place.trim()});from=n.after+1;});days.push({day:days.length+1,from,to:plan.stops.length-1,stay:null});return days;}
export const stayLocation=place=>place?{label:`宿（${place}）`,query:place,stay:true}:null;
// ↑↓で札所を動かす。日の境目をまたぐときは入れ替えずに区切りをずらし、その札所を隣の日へ移す（日が空になるときだけ入れ替える）。
export function moveStop(stops,nights=[],i,dir){
  const s=stops.slice(),ns=nights.map(n=>({...n})),j=i+dir;if(j<0||j>=s.length)return {stops:s,nights:ns};
  const k=ns.findIndex(n=>n.after===(dir>0?i:j));
  if(k>=0){const after=ns[k].after-dir,lower=k?ns[k-1].after:-1,upper=k<ns.length-1?ns[k+1].after:s.length-1;if(after>lower&&after<upper){ns[k].after=after;return {stops:s,nights:ns};}}
  [s[i],s[j]]=[s[j],s[i]];return {stops:s,nights:ns};
}
// 札所を外したあとの区切り（length は外したあとの札所の数）。空になった日は区切りごと消す。
export function nightsAfterRemove(nights=[],index,length){const out=[];for(const n of nights){const after=n.after>=index?n.after-1:n.after;if(after<0||after>length-2||out.some(o=>o.after===after))continue;out.push({...n,after});}return out;}
export function navigationSections(plan,temples,parkingFor=()=>null){
  validatePlan(plan);if(!plan.stops.length)return [];
  const days=planDays(plan),result=[];
  days.forEach((d,k)=>{
  // 2日目からは前の日の宿から（宿を入れていなければ現在地から）。最終日以外の終点はその日の宿。
  let origin=k?stayLocation(days[k-1].stay):planLocation(plan.origin,temples,parkingFor),remaining=plan.stops.slice(d.from,d.to+1).map(s=>planLocation({kind:'temple',templeId:s.templeId},temples,parkingFor));
  const end=k===days.length-1?planLocation(plan.returnTo,temples,parkingFor):stayLocation(d.stay);if(end)remaining.push(end);
  while(remaining.length){let count=Math.min(4,remaining.length);while(count>1&&mapsURL(origin,remaining.slice(0,count)).length>2048)count--;
    const targets=remaining.slice(0,count),url=mapsURL(origin,targets);if(url.length>2048)fail('住所・地点名が長すぎるためナビを作成できません。短くして再保存してください。');
    result.push({origin,targets,url,day:d.day});origin=targets.at(-1);remaining=remaining.slice(count);
  }
  });
  return result;
}
export function planSummary(plan){return {temples:plan.stops.length,prayerMinutes:plan.stops.reduce((sum,s)=>sum+s.minutes,0),distanceKm:null,drivingMinutes:null,arrivalAt:null};}
export function exportPlans(plans){plans.forEach(validatePlan);return JSON.stringify({format:'ohenro-quest-plans',version:1,plans},null,2);}
export function readPlansJSON(value){
  if(typeof value!=='string'||value.length>1024*1024)fail('予定JSONは1MB以内にしてください。');
  let data;try{data=JSON.parse(value);}catch{fail('JSONファイルを読み込めません。');}
  if(data?.format!=='ohenro-quest-plans'||data.version!==1||!Array.isArray(data.plans)||data.plans.length>50)fail('対応する予定バックアップではありません。');
  data.plans.forEach(validatePlan);return data.plans;
}
