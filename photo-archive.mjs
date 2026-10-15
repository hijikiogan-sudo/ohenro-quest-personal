import {makePhotoZip} from './photo-zip.mjs';
export async function createPhotoArchive(rows,journeyName,{version=2}={}){
  if(!rows.length)throw new Error('この巡礼には写真がありません。');
  if(![1,2].includes(version))throw new Error('写真バックアップの形式を確認してください。');
  const entries=[],photos=[];
  for(const [i,p] of rows.entries()){
    if(version===1&&p.templeId===null)throw new Error('未分類の写真は新しい写真ZIPに保存してください。');
    const path=`photos/temple-${p.templeId===null?'unassigned':String(p.templeId).padStart(2,'0')}-${String(i+1).padStart(4,'0')}.jpg`;
    entries.push({name:path,blob:p.blob});
    photos.push({path,templeId:p.templeId,date:p.date,caption:p.caption,digest:p.digest,...(version===2?{favorite:p.favorite??false}:{})});
  }
  entries.unshift({name:'manifest.json',blob:new Blob([JSON.stringify({format:'ohenro-quest-photos',version,journeyName,exportedAt:new Date().toISOString(),photos},null,2)],{type:'application/json'})});
  return makePhotoZip(entries);
}
export async function createLegacyBundle(rows,journeys){
  if(!rows.length)throw new Error('バックアップする写真がありません。');
  const entries=[],manifest=[];
  for(const id of new Set(rows.map(p=>p.journeyId))){
    const name=journeys.find(j=>j.id===id)?.name||'巡礼名不明',photos=rows.filter(p=>p.journeyId===id);
    const path=`journeys/journey-${String(manifest.length+1).padStart(4,'0')}.zip`;
    entries.push({name:path,blob:await createPhotoArchive(photos,name,{version:1})});manifest.push({path,journeyName:name,count:photos.length});
  }
  entries.unshift({name:'manifest.json',blob:new Blob([JSON.stringify({format:'ohenro-quest-legacy-photo-bundle',version:1,journeys:manifest},null,2)],{type:'application/json'})});
  return makePhotoZip(entries);
}
