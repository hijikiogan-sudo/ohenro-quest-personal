const fail=message=>{throw new Error(message);};
const text=(s,max)=>typeof s==='string'&&s.length<=max&&!/[\u0000-\u001f]/.test(s);
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
  return p;
}
export function planLocation(value,temples){
  if(value.kind==='none'||value.kind==='current')return null;
  if(value.kind==='address')return {label:value.address,query:value.address};
  const t=temples.find(t=>t.id===value.templeId);if(!t)fail('札所データを読み込めません。');
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
export function navigationSections(plan,temples){
  validatePlan(plan);if(!plan.stops.length)return [];
  let origin=planLocation(plan.origin,temples),remaining=plan.stops.map(s=>planLocation({kind:'temple',templeId:s.templeId},temples));
  const end=planLocation(plan.returnTo,temples);if(end)remaining.push(end);
  const result=[];
  while(remaining.length){let count=Math.min(4,remaining.length);while(count>1&&mapsURL(origin,remaining.slice(0,count)).length>2048)count--;
    const targets=remaining.slice(0,count),url=mapsURL(origin,targets);if(url.length>2048)fail('住所・地点名が長すぎるためナビを作成できません。短くして再保存してください。');
    result.push({origin,targets,url});origin=targets.at(-1);remaining=remaining.slice(count);
  }
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
