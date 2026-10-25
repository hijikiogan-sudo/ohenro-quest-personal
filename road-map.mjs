import {groupNearby,templeGlyph} from './temple-marker.mjs';
import {MAP_KINDS,readMapKind,isTileKind,GSI} from './map-route.mjs';
// 地図の種類は「全体図・地図・写真」の1か所で切り替える。地図は国土地理院の淡色／標準、写真は国土地理院の写真。
// 地図タイルは利用者が表示した範囲のみ通常の画像として読み込む。Service Workerやアプリ独自のオフラインキャッシュには保存しない。
export function createRoadMap({document=globalThis.document,window=globalThis.window,navigator=globalThis.navigator,onTemple=()=>{},onCluster=()=>{},onKind=()=>{},scope='/',storage}={}){
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  let map,baseLayer,photoLayer,markers,routeLayer,loading,rows=[],visited=new Set(),route=[],needsFit=true,lastSignature='',tileFailed=false,pendingView=null;
  try{storage??=window.localStorage;}catch{}
  const kindKey='ohenro-map-style:'+scope;
  let kind=readMapKind(storage,kindKey);
  const tiles=()=>isTileKind(kind);
  function show(){
    const active=tiles()&&navigator.onLine!==false;
    $('#road-map').hidden=!active;$('#map-wrap').hidden=active;
    const tab=kind==='photo'?'photo':kind==='overview'?'overview':'map';
    $$('[data-map-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mapKind===tab)));
    $('#map-sub').hidden=tab!=='map';
    $$('[data-map-base]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mapBase===kind)));
    let status;
    if(!tiles())status='全体図 · 通信なしで使えます。番号をタップすると札所を開きます。';
    else if(!active)status='オフラインのため全体図を表示しています。';
    else if(kind==='photo')status=map&&map.getZoom()<GSI.photoMinZoom?'写真は札所に寄ると表示されます（拡大するか、札所を選んでください）。':'航空写真 · 駐車場の広さや道の細さの目安に。撮影時期により現状と異なることがあります。';
    else status=kind==='std'?'標準地図 · 道路や地名を詳しく表示します。':'淡色地図 · 札所の印が見やすい地図です。';
    if(active&&tileFailed)status='地図画像の一部を取得できません。全体図も利用できます。';
    $('#map-status').textContent=status;
    $('#road-note').hidden=!active;$('#gsi-credit').hidden=!active;
    return active;
  }
  function library(){
    if(window.L)return Promise.resolve(window.L);
    if(!loading)loading=new Promise((resolve,reject)=>{
      const s=document.createElement('script');s.src='./vendor/leaflet/leaflet.js';
      s.onload=()=>window.L?resolve(window.L):reject(new Error('地図の準備に失敗しました。'));
      s.onerror=()=>{s.remove();loading=null;reject(new Error('地図を読み込めません。全体図をご利用ください。'));};document.head.append(s);
    });
    return loading;
  }
  const credit='<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>';
  function setBase(L){
    if(baseLayer)map.removeLayer(baseLayer);if(photoLayer){map.removeLayer(photoLayer);photoLayer=null;}
    // 写真のときも、ズーム13以下は淡色地図を下に敷く（写真タイルはズーム14〜18のみ使用）。
    baseLayer=L.tileLayer(kind==='std'?GSI.std:GSI.pale,{minZoom:7,maxZoom:18,keepBuffer:1,attribution:credit}).addTo(map);
    if(kind==='photo')photoLayer=L.tileLayer(GSI.photo,{minZoom:GSI.photoMinZoom,maxZoom:18,keepBuffer:1,attribution:'写真：'+credit}).addTo(map);
    tileFailed=false;
    for(const l of [baseLayer,photoLayer].filter(Boolean)){l.on('tileerror',()=>{tileFailed=true;show();});l.on('load',()=>show());}
    show();
  }
  async function draw(){
    if(!show()||$('#view-home').hidden)return;
    try{
      const L=await library();if(!show()||$('#view-home').hidden)return;
      if(!map){
        map=L.map($('#road-map'),{scrollWheelZoom:false,zoomControl:false,minZoom:7,maxZoom:18,maxBounds:[[30,130],[37,137]],maxBoundsViscosity:.8});
        map.attributionControl.setPrefix(false);
        L.control.zoom({zoomInTitle:'地図を拡大',zoomOutTitle:'地図を縮小'}).addTo(map);
        routeLayer=L.layerGroup().addTo(map);markers=L.layerGroup().addTo(map);
        map.on('zoomend',()=>{lastSignature='';draw();});
        map._ohenroKind=null;
      }
      if(map._ohenroKind!==kind){setBase(L);map._ohenroKind=kind;}
      map.invalidateSize();
      const signature=kind+'|'+map.getZoom()+'|'+rows.map(t=>t.id+':'+visited.has(t.id)).join(',')+'|'+route.map(p=>p.templeId+p.status).join(',');
      function renderMarkers(){
        markers.clearLayers();routeLayer.clearLayers();
        if(route.length>1)L.polyline(route.map(p=>[p.lat,p.lng]),{className:'route-line',interactive:false}).addTo(routeLayer);
        const inRoute=new Map(route.map(p=>[p.templeId,p]));
        for(const p of route){
          const el=document.createElement('span');el.textContent=String(p.order);
          L.marker([p.lat,p.lng],{interactive:false,keyboard:false,icon:L.divIcon({className:'route-order route-'+p.status,html:el,iconSize:[24,24],iconAnchor:[-6,52]})}).addTo(routeLayer);
        }
        const groups=groupNearby(rows,t=>{const pt=map.project([t.lat,t.lng],map.getZoom());return[pt.x,pt.y];},48);
        for(const group of groups){
          const t=group[0],isGroup=group.length>1,done=group.every(t=>visited.has(t.id));
          const label=isGroup?'この周辺に'+group.length+'札所':'第'+t.id+'番 '+t.name+(done?' 訪問済み':' 未訪問');
          const content=document.createElement('span');content.innerHTML=templeGlyph(isGroup?group.length+'寺':t.id);
          const lat=group.reduce((s,t)=>s+t.lat,0)/group.length,lng=group.reduce((s,t)=>s+t.lng,0)/group.length;
          const onRoute=group.some(t=>inRoute.has(t.id));
          const marker=L.marker([lat,lng],{keyboard:true,title:label,alt:label,icon:L.divIcon({className:'temple-map-marker'+(done?' visited':'')+(isGroup?' grouped':'')+(onRoute?' on-route':''),html:content,iconSize:[44,48],iconAnchor:[22,47]})}).addTo(markers);
          marker.on('click',()=>isGroup?onCluster(group.map(t=>t.id)):onTemple(t.id));
          if(!isGroup&&map.getZoom()>=12){const name=document.createElement('span');name.textContent=t.name;marker.bindTooltip(name,{direction:'right',offset:[12,-22],className:'temple-map-name'});}
        }
      }
      if(pendingView){map.setView(pendingView.center,pendingView.zoom,{animate:false});pendingView=null;needsFit=false;}
      else if(needsFit&&rows.length){needsFit=false;const pts=route.length?route:rows;map.fitBounds(pts.map(t=>[t.lat,t.lng]),{padding:[36,36],maxZoom:kind==='photo'?16:12,animate:false});}
      if(signature!==lastSignature){renderMarkers();lastSignature=signature;}
      show();
    }catch(e){kind='overview';show();onKind(kind);$('#map-status').textContent=e.message;}
  }
  function choose(next,{save=true}={}){
    if(!MAP_KINDS.includes(next))return;
    kind=next;
    if(save)try{storage?.setItem(kindKey,kind);}catch{}
    needsFit=true;show();onKind(kind);
    return draw();
  }
  // 札所の詳細から「写真で見る」：その札所に寄った写真を表示する。
  function focus(temple,next='photo'){pendingView={center:[temple.lat,temple.lng],zoom:17};return choose(next);}
  $$('[data-map-kind]').forEach(b=>b.onclick=()=>choose(b.dataset.mapKind==='map'?(kind==='std'?'std':'pale'):b.dataset.mapKind));
  $$('[data-map-base]').forEach(b=>b.onclick=()=>choose(b.dataset.mapBase));
  onKind(kind);show();
  return {
    update(next,done,{fit=false,routePoints=null}={}){rows=next;visited=done;if(routePoints){const changed=routePoints.map(p=>p.templeId).join()!==route.map(p=>p.templeId).join();route=routePoints;needsFit||=changed;}needsFit||=fit;return draw();},
    reset(){needsFit=true;return draw();},
    show, choose, focus, getKind:()=>kind
  };
}
