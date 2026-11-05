import test from 'node:test';
import assert from 'node:assert/strict';
import {geoErrorCode, installNativeGeolocation} from '../native-geo.mjs';

test('アプリ版の現在地：プラグインの結果を Web と同じ形で返す', async () => {
  const seen = [];
  const win = {navigator: {}, Capacitor: {Plugins: {Geolocation: {getCurrentPosition: async o => { seen.push(o); return {coords: {latitude: 34, longitude: 134}, timestamp: 5}; }}}}};
  assert.equal(installNativeGeolocation(win), true);
  const r = await new Promise((ok, ng) => win.navigator.geolocation.getCurrentPosition(ok, ng, {enableHighAccuracy: true, timeout: 20000, maximumAge: 0}));
  assert.equal(r.coords.latitude, 34);
  assert.deepEqual(seen[0], {enableHighAccuracy: true, timeout: 20000, maximumAge: 0});
});
test('アプリ版の現在地：許可なしは code 1 で失敗を返す', async () => {
  const win = {navigator: {}, Capacitor: {Plugins: {Geolocation: {getCurrentPosition: async () => { throw new Error('Location permission request was denied.'); }}}}};
  installNativeGeolocation(win);
  const e = await new Promise(ok => win.navigator.geolocation.getCurrentPosition(() => {}, ok));
  assert.equal(e.code, 1);
});
test('アプリ版の現在地：エラーの種類と、プラグインがないとき', () => {
  assert.equal(geoErrorCode({message: 'Timeout'}), 3);
  assert.equal(geoErrorCode({message: 'Location services are not enabled.'}), 2);
  const win = {navigator: {geolocation: 'web'}};
  assert.equal(installNativeGeolocation(win), false);
  assert.equal(win.navigator.geolocation, 'web');
});
