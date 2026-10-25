import {validDate} from './domain.mjs';
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const table=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const update=(c,bytes)=>{for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return c;};
export function crc32(bytes){return(update(0xffffffff,bytes)^0xffffffff)>>>0;}
// 大きな写真ZIPを丸ごとメモリに載せないよう、8MBずつ読んで計算する。
export async function blobCRC32(blob,step=8*1024*1024){let c=0xffffffff;for(let i=0;i<blob.size;i+=step)c=update(c,new Uint8Array(await blob.slice(i,i+step).arrayBuffer()));return(c^0xffffffff)>>>0;}
// 無圧縮ZIP（ZIP64なし）で扱える大きさ。
export const ZIP_MAX_BYTES=0xffffffff,ZIP_MAX_ENTRIES=0xffff;
const header=n=>{const b=new Uint8Array(n);return {b,v:new DataView(b.buffer)};};
export async function makePhotoZip(entries){
  if(entries.length>ZIP_MAX_ENTRIES)throw new Error('写真が多く、1つのバックアップに入りきりません（65,535件まで）。巡礼を分けてバックアップしてください。');
  const chunks=[],directory=[];let offset=0;
  for(const {name,blob} of entries){
    if(!/^[a-zA-Z0-9_./-]+$/.test(name)||name.includes('..')||name.startsWith('/'))throw new Error('写真バックアップの名前を確認できません。');
    const path=encoder.encode(name),h=header(30);
    if(offset+30+path.length+blob.size+46+path.length+22>ZIP_MAX_BYTES)throw new Error('バックアップが4GBを超えるため作れません。巡礼を分けてバックアップしてください。');
    const crc=await blobCRC32(blob);
    h.v.setUint32(0,0x04034b50,true);h.v.setUint16(4,20,true);h.v.setUint16(6,0x800,true);h.v.setUint32(14,crc,true);h.v.setUint32(18,blob.size,true);h.v.setUint32(22,blob.size,true);h.v.setUint16(26,path.length,true);
    chunks.push(h.b,path,blob);const d=header(46);d.v.setUint32(0,0x02014b50,true);d.v.setUint16(4,20,true);d.v.setUint16(6,20,true);d.v.setUint16(8,0x800,true);d.v.setUint32(16,crc,true);d.v.setUint32(20,blob.size,true);d.v.setUint32(24,blob.size,true);d.v.setUint16(28,path.length,true);d.v.setUint32(42,offset,true);directory.push(d.b,path);offset+=30+path.length+blob.size;
  }
  const size=directory.reduce((s,p)=>s+p.length,0),end=header(22);end.v.setUint32(0,0x06054b50,true);end.v.setUint16(8,entries.length,true);end.v.setUint16(10,entries.length,true);end.v.setUint32(12,size,true);end.v.setUint32(16,offset,true);
  return new Blob([...chunks,...directory,end.b],{type:'application/zip'});
}

export async function readPhotoZip(file){
  if(!(file instanceof Blob)||file.size<22||file.size>ZIP_MAX_BYTES)throw new Error('お遍路クエストの写真バックアップZIP（4GBまで）を選んでください。');
  const entries=new Map();let offset=0;
  while(offset+4<=file.size){
    const sig=new DataView(await file.slice(offset,offset+4).arrayBuffer()).getUint32(0,true);
    if(sig===0x02014b50||sig===0x06054b50)break;
    if(sig!==0x04034b50||offset+30>file.size)throw new Error('写真バックアップZIPの形式を確認できません。');
    const h=new DataView(await file.slice(offset,offset+30).arrayBuffer()),flags=h.getUint16(6,true),size=h.getUint32(18,true),raw=h.getUint32(22,true),n=h.getUint16(26,true),extra=h.getUint16(28,true);
    if(flags!==0x800||h.getUint16(8,true)!==0||size!==raw||n<1||n>200||size>1024*1024||entries.size>=ZIP_MAX_ENTRIES)throw new Error('このZIPには対応していない形式のファイルがあります。');
    const start=offset+30+n+extra;if(start+size>file.size)throw new Error('写真バックアップが途中で切れています。');
    const name=decoder.decode(await file.slice(offset+30,offset+30+n).arrayBuffer());
    if(!/^(manifest\.json|photos\/[a-zA-Z0-9_-]+\.jpg)$/.test(name)||entries.has(name))throw new Error('写真バックアップ内のファイル名・重複を確認してください。');
    const blob=file.slice(start,start+size,name==='manifest.json'?'application/json':'image/jpeg');
    if(crc32(new Uint8Array(await blob.arrayBuffer()))!==h.getUint32(14,true))throw new Error('写真バックアップが壊れています。保存はしていません。');
    entries.set(name,blob);offset=start+size;
  }
  const end=new DataView(await file.slice(file.size-22).arrayBuffer());
  if(end.getUint32(0,true)!==0x06054b50||end.getUint16(4,true)!==0||end.getUint16(6,true)!==0||end.getUint16(8,true)!==entries.size||end.getUint16(10,true)!==entries.size||end.getUint32(16,true)!==offset||offset+end.getUint32(12,true)!==file.size-22||end.getUint16(20,true)!==0)throw new Error('写真バックアップZIPが途中で切れているか、形式が異なります。');
  const manifestBlob=entries.get('manifest.json');if(!manifestBlob)throw new Error('写真バックアップの情報がありません。');
  let manifest;try{manifest=JSON.parse(await manifestBlob.text());}catch{throw new Error('写真バックアップの情報を読み取れません。');}
  if(manifest.format!=='ohenro-quest-photos'||![1,2].includes(manifest.version)||!Array.isArray(manifest.photos)||!manifest.photos.length||manifest.photos.length>=ZIP_MAX_ENTRIES||typeof manifest.journeyName!=='string'||manifest.journeyName.length>60||entries.size!==manifest.photos.length+1)throw new Error('対応する写真バックアップではありません。');
  const paths=new Set();
  for(const p of manifest.photos){
    if(!p||!/^photos\/[a-zA-Z0-9_-]+\.jpg$/.test(p.path??'')||paths.has(p.path)||!entries.has(p.path)||!((Number.isInteger(p.templeId)&&p.templeId>=1&&p.templeId<=88)||(manifest.version===2&&p.templeId===null))||typeof p.caption!=='string'||p.caption.length>300||typeof p.date!=='string'||!validDate(p.date)||!/^[a-f0-9]{64}$/.test(p.digest??'')||(manifest.version===2&&typeof p.favorite!=='boolean'))throw new Error('写真バックアップの札所・写真情報が不正です。');
    p.favorite=manifest.version===2?p.favorite:false;
    const blob=entries.get(p.path);const signature=new Uint8Array(await blob.slice(0,2).arrayBuffer());if(signature[0]!==255||signature[1]!==216)throw new Error('写真ZIPにはJPEG形式の写真だけを含めてください。');const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');
    if(digest!==p.digest)throw new Error('写真の検証に失敗しました。保存はしていません。');paths.add(p.path);
  }
  return {manifest,entries};
}
