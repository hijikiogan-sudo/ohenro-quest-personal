// アプリ版（App Store）の現在地：Web の位置情報を使うと、アプリの許可のあとに「localhost が位置情報を…」の確認が重ねて出る。
// そこでアプリ版だけ navigator.geolocation を Capacitor の Geolocation に差し替える。呼び出し側は Web 版と同じ書き方のまま。
export function geoErrorCode(error) {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`;
  if (/denied|permission/i.test(text)) return 1;
  if (/time.?out/i.test(text)) return 3;
  return 2;
}
export function installNativeGeolocation(win = globalThis.window) {
  const plugin = win?.Capacitor?.Plugins?.Geolocation;
  if (!plugin?.getCurrentPosition) return false;
  const geolocation = {
    getCurrentPosition(success, failure, options = {}) {
      plugin.getCurrentPosition({enableHighAccuracy: !!options.enableHighAccuracy, timeout: options.timeout, maximumAge: options.maximumAge})
        .then(p => success({coords: p.coords, timestamp: p.timestamp}), e => failure?.({code: geoErrorCode(e), message: String(e?.message ?? '')}));
    },
  };
  Object.defineProperty(win.navigator, 'geolocation', {value: geolocation, configurable: true});
  return true;
}
