export async function preparePhoto(file){
  if(!file||!file.size||file.size>20*1024*1024||!/^image\/(jpeg|png|webp|heic|heif|avif)$/.test(file.type))throw new Error('20MB以下の写真を選んでください。JPEG・PNGなど、ブラウザで開ける写真に対応します。');
  const url=URL.createObjectURL(file),image=new Image();
  try{
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('写真の読み込みに時間がかかっています。別の写真でお試しください。')),20000);image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(new Error('この写真を開けませんでした。JPEG形式の写真でお試しください。'));};image.src=url;});
    if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>60000000)throw new Error('写真が大きすぎます。小さくした写真を選んでください。');
    const ratio=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
    const width=Math.max(1,Math.round(image.naturalWidth*ratio)),height=Math.max(1,Math.round(image.naturalHeight*ratio));
    async function encode(w,h,quality){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const context=canvas.getContext('2d');if(!context)throw new Error('このブラウザでは写真を準備できません。');context.fillStyle='#fff';context.fillRect(0,0,w,h);context.drawImage(image,0,0,w,h);return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('写真を変換できませんでした。')),'image/jpeg',quality));}
    let blob=await encode(width,height,.84);if(blob.size>1024*1024)blob=await encode(width,height,.64);if(blob.size>1024*1024)throw new Error('保存用に小さくできませんでした。小さい写真を選んでください。');
    const scale=Math.min(1,320/Math.max(width,height)),thumb=await encode(Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale)),.72);
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');
    return {blob,thumb,width,height,digest};
  }finally{URL.revokeObjectURL(url);image.src='';}
}

export function cleanJPEG(bytes){
  if(bytes[0]!==255||bytes[1]!==216)return false;let offset=2;
  while(offset+4<=bytes.length){
    if(bytes[offset]!==255)return false;const marker=bytes[offset+1];
    if(marker===0xda)return true;
    if([0xe1,0xed,0xfe].includes(marker))return false;
    const size=bytes[offset+2]*256+bytes[offset+3];if(size<2||offset+2+size>bytes.length)return false;
    // canvasが付ける標準の色プロファイルは位置情報ではなく、再圧縮せず保持する。
    if(marker===0xe2&&new TextDecoder().decode(bytes.slice(offset+4,offset+16))!=='ICC_PROFILE\0')return false;
    offset+=2+size;
  }return false;
}

export async function prepareRestoredPhoto(file){
  const prepared=await preparePhoto(file),bytes=new Uint8Array(await file.arrayBuffer());
  // アプリのバックアップは再圧縮せず復元し、画質と重複検出を保つ。
  // EXIF等が付加されたファイルは通常の変換を通す。
  if(cleanJPEG(bytes)){prepared.blob=file;prepared.digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
  return prepared;
}
