// 同梱のLeafletを一度だけ読み込む（全体の地図と札所のまわりの地図で共有）。
let loading = null;
export function loadLeaflet(document = globalThis.document, window = globalThis.window) {
  if (window.L) return Promise.resolve(window.L);
  if (!loading) loading = new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = './vendor/leaflet/leaflet.js';
    s.onload = () => window.L ? resolve(window.L) : reject(new Error('地図の準備に失敗しました。'));
    s.onerror = () => { s.remove(); loading = null; reject(new Error('地図を読み込めません。全体図をご利用ください。')); };
    document.head.append(s);
  });
  return loading;
}
