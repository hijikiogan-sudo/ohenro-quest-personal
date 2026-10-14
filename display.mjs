export const PREFECTURES=['徳島県','高知県','愛媛県','香川県'];

export function fittedMapBox(points,aspect=800/480){
  if(!points.length)return [0,0,800,480];
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
  let width=Math.max(65,(Math.max(...xs)-Math.min(...xs))*1.22);
  let height=Math.max(65,(Math.max(...ys)-Math.min(...ys))*1.22);
  width=Math.max(width,height*aspect);height=width/aspect;
  return [cx-width/2,cy-height/2,width,height];
}

export function attachTheme({document=globalThis.document,window=globalThis.window,scope='/',storage}={}){
  const key='ohenro-theme:'+scope,allowed=['system','light','dark'];
  try{storage??=window.localStorage;}catch{}
  const media=window.matchMedia?.('(prefers-color-scheme: dark)');
  let preference='system';try{const saved=storage?.getItem(key);if(allowed.includes(saved))preference=saved;}catch{}
  const labels={system:'端末に合わせる',light:'ライト',dark:'ダーク'};
  function render(){
    const actual=preference==='system'?(media?.matches?'dark':'light'):preference;
    document.documentElement.dataset.theme=actual;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',actual==='dark'?'#122633':'#34cbd5');
    document.querySelectorAll('[data-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeChoice===preference)));
    const toggle=document.querySelector('#theme-toggle');
    if(toggle){toggle.textContent=actual==='dark'?'☀ ライト':'☾ ダーク';toggle.setAttribute('aria-label',actual==='dark'?'ライトモードに切り替える':'ダークモードに切り替える');}
    const status=document.querySelector('#theme-status');if(status)status.textContent='表示：'+labels[preference];
  }
  function choose(value){if(!allowed.includes(value))return;preference=value;try{storage?.setItem(key,value);}catch{}render();}
  document.querySelectorAll('[data-theme-choice]').forEach(b=>b.onclick=()=>choose(b.dataset.themeChoice));
  const toggle=document.querySelector('#theme-toggle');if(toggle)toggle.onclick=()=>choose(document.documentElement.dataset.theme==='dark'?'light':'dark');
  media?.addEventListener?.('change',render);render();
  return {choose,getPreference:()=>preference};
}
