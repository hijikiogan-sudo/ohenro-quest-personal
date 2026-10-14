// 地図タイルは利用者が表示した範囲のみ通常の画像として読み込む。
// Service Workerやアプリ独自のオフラインキャッシュには保存しない。
export function createRoadMap({document=globalThis.document,window=globalThis.window,navigator=globalThis.navigator,onTemple=()=>{}}={}){
  const $=s=>document.querySelector(s);
  let map,layer,markers,loading,enabled=false,rows=[],visited=new Set(),needsFit=true,lastSignature='';
  function show(){
    const active=enabled&&navigator.onLine!==false;
    $('#road-map').hidden=!active;$('#map-wrap').hidden=active;
    $('#road-toggle').textContent=enabled?'位置図に戻す':'道路地図を表示';
    $('#road-toggle').setAttribute('aria-pressed',String(enabled));
    $('#map-status').textContent=enabled?(active?'道路地図 · 拡大すると周辺の道路を確認できます。':'オフラインのため位置図を表示しています。'):'位置図 · 通信なしで県別の札所を確認できます。';
    $('#road-note').hidden=!active;
    return active;
  }
  function library(){
    if(window.L)return Promise.resolve(window.L);
    if(!loading)loading=new Promise((resolve,reject)=>{
      const s=document.createElement('script');s.src='./vendor/leaflet/leaflet.js';
      s.onload=()=>window.L?resolve(window.L):reject(new Error('地図の準備に失敗しました。'));
      s.onerror=()=>{s.remove();loading=null;reject(new Error('道路地図を読み込めません。位置図をご利用ください。'));};document.head.append(s);
    });
    return loading;
  }
  async function draw(){
    if(!show()||$('#view-home').hidden)return;
    try{
      const L=await library();if(!show()||$('#view-home').hidden)return;
      if(!map){
        map=L.map($('#road-map'),{scrollWheelZoom:false,zoomControl:false});
        L.control.zoom({zoomInTitle:'地図を拡大',zoomOutTitle:'地図を縮小'}).addTo(map);
        layer=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,keepBuffer:1,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(map);
        markers=L.layerGroup().addTo(map);
        let failed=false;
        layer.on('tileerror',()=>{failed=true;$('#map-status').textContent='道路画像の一部を取得できません。位置図への切り替えも利用できます。';});
        layer.on('loading',()=>{failed=false;});layer.on('load',()=>{if(!failed)show();});
      }
      map.invalidateSize();
      const signature=rows.map(t=>t.id+':'+visited.has(t.id)).join(',');
      if(signature!==lastSignature){
        markers.clearLayers();
        for(const t of rows){
          const label='第'+t.id+'番 '+t.name+(visited.has(t.id)?' 訪問済み':' 未訪問');
          const content=document.createElement('span');content.textContent=t.id;
          L.marker([t.lat,t.lng],{keyboard:true,title:label,alt:label,icon:L.divIcon({className:'road-pin'+(visited.has(t.id)?' visited':''),html:content,iconSize:[30,30],iconAnchor:[15,15]})}).addTo(markers).on('click',()=>onTemple(t.id));
        }
        lastSignature=signature;
      }
      if(needsFit&&rows.length){map.fitBounds(rows.map(t=>[t.lat,t.lng]),{padding:[28,28],maxZoom:11,animate:false});needsFit=false;}
    }catch(e){enabled=false;show();$('#map-status').textContent=e.message;}
  }
  $('#road-toggle').onclick=()=>{enabled=!enabled;needsFit=true;return draw();};
  return {
    update(next,done,{fit=false}={}){rows=next;visited=done;needsFit||=fit;return draw();},
    reset(){needsFit=true;return draw();},
    show, getEnabled:()=>enabled
  };
}
