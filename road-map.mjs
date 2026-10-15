import {groupNearby,templeGlyph} from './temple-marker.mjs';
import {MAP_STYLES,readMapStyle} from './quest-map.mjs';
// 地図タイルは利用者が表示した範囲のみ通常の画像として読み込む。
// Service Workerやアプリ独自のオフラインキャッシュには保存しない。
export function createRoadMap({document=globalThis.document,window=globalThis.window,navigator=globalThis.navigator,onTemple=()=>{},onCluster=()=>{},onPositionStyle=()=>{},scope='/',storage}={}){
  const $=s=>document.querySelector(s);
  let map,layer,markers,loading,enabled=false,rows=[],visited=new Set(),needsFit=true,lastSignature='',baseStyle='pale',setBaseLayer,tileFailed=false;
  try{storage??=window.localStorage;}catch{}
  const styleKey='ohenro-map-style:'+scope;
  let style=readMapStyle(storage,styleKey);
  enabled=['pale','road'].includes(style);if(enabled)baseStyle=style;
  function show(){
    const active=enabled&&navigator.onLine!==false;
    $('#road-map').hidden=!active;$('#map-wrap').hidden=active;
    $('#map-base').value=style;
    const positionStyle=style==='plain'?'plain':'quest';
    $('#map').dataset.style=positionStyle;
    $('#quest-caption').hidden=active||positionStyle!=='quest';
    $('#road-toggle').textContent=enabled?'冒険の地図に戻す':'道路地図を表示';
    $('#road-toggle').setAttribute('aria-pressed',String(enabled));
    $('#map-status').textContent=enabled?(active?'お寺のアイコンから札所を開けます。複数の札所はまとめて表示します。':'オフラインのため冒険の位置図を表示しています。'):(positionStyle==='quest'?'冒険の地図 · お寺を選んで、次のクエストへ。':'位置図 · 通信なしで県別の札所を確認できます。');
    $('#road-note').hidden=!active;$('#gsi-credit').hidden=!(active&&baseStyle==='pale');if(active&&tileFailed)$('#map-status').textContent='地図画像の一部を取得できません。位置図も利用できます。';
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
        map=L.map($('#road-map'),{scrollWheelZoom:false,zoomControl:false,minZoom:7,maxZoom:18,maxBounds:[[30,130],[37,137]],maxBoundsViscosity:.8});
        map.attributionControl.setPrefix(false);
        L.control.zoom({zoomInTitle:'地図を拡大',zoomOutTitle:'地図を縮小'}).addTo(map);
        function setBase(){
          if(layer)map.removeLayer(layer);
          const pale=baseStyle==='pale';
          layer=L.tileLayer(pale?'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png':'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{minZoom:7,maxZoom:18,keepBuffer:1,attribution:pale?'<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>':'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(map);
          tileFailed=false;
          layer.on('tileerror',()=>{tileFailed=true;show();});layer.on('loading',()=>{tileFailed=false;});layer.on('load',()=>show());show();
        }
        setBaseLayer=setBase;setBase();
        markers=L.layerGroup().addTo(map);
      }
      map.invalidateSize();
      const signature=rows.map(t=>t.id+':'+visited.has(t.id)).join(',');
      function renderMarkers(){
        markers.clearLayers();
        const groups=groupNearby(rows,t=>{const p=map.project([t.lat,t.lng],map.getZoom());return[p.x,p.y];},48);
        for(const group of groups){
          const t=group[0],isGroup=group.length>1,done=group.every(t=>visited.has(t.id));
          const label=isGroup?'この周辺に'+group.length+'札所':'第'+t.id+'番 '+t.name+(done?' 訪問済み':' 未訪問');
          const content=document.createElement('span');content.innerHTML=templeGlyph(isGroup?group.length+'寺':t.id);
          const lat=group.reduce((s,t)=>s+t.lat,0)/group.length,lng=group.reduce((s,t)=>s+t.lng,0)/group.length;
          const marker=L.marker([lat,lng],{keyboard:true,title:label,alt:label,icon:L.divIcon({className:'temple-map-marker'+(done?' visited':'')+(isGroup?' grouped':''),html:content,iconSize:[44,48],iconAnchor:[22,47]})}).addTo(markers);
          marker.on('click',()=>isGroup?onCluster(group.map(t=>t.id)):onTemple(t.id));
          if(!isGroup&&map.getZoom()>=12){const name=document.createElement('span');name.textContent=t.name;marker.bindTooltip(name,{direction:'right',offset:[12,-22],className:'temple-map-name'});}
        }
      }
      if(!map._ohenroMarkers){map.on('zoomend',()=>{lastSignature='';draw();});map._ohenroMarkers=true;}
      if(needsFit&&rows.length){needsFit=false;map.fitBounds(rows.map(t=>[t.lat,t.lng]),{padding:[36,36],maxZoom:12,animate:false});}
      if(signature!==lastSignature){renderMarkers();lastSignature=signature;}
    }catch(e){enabled=false;show();$('#map-status').textContent=e.message;}
  }
  function choose(next,{save=true}={}){
    if(!MAP_STYLES.includes(next))return;
    style=next;enabled=['pale','road'].includes(style);
    if(enabled)baseStyle=style;
    if(save)try{storage?.setItem(styleKey,style);}catch{}
    needsFit=true;show();
    onPositionStyle(style==='plain'?'plain':'quest');
    if(enabled&&setBaseLayer)setBaseLayer();
    return draw();
  }
  $('#map-base').onchange=e=>choose(e.target.value);
  $('#road-toggle').onclick=()=>choose(enabled?'quest':'pale');
  onPositionStyle(style==='plain'?'plain':'quest');show();
  return {
    update(next,done,{fit=false}={}){rows=next;visited=done;needsFit||=fit;return draw();},
    reset(){needsFit=true;return draw();},
    show, choose, getStyle:()=>style, getEnabled:()=>enabled
  };
}
