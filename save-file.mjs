// ファイルを端末に保存する。共有メニューが使える端末（iPhoneなど）では共有メニューを開き、「"ファイル"に保存」から保存してもらう。
// 使えない端末では従来どおりダウンロードする。共有メニューは押した操作の中でしか開けないので、ボタンの onclick から呼ぶこと。
// 戻り値：'shared'（共有メニューで送った）・'cancelled'（共有メニューを閉じた）・'downloaded'（ダウンロードした。保存できたかは分からない）
export const canShareFile = (file, nav = globalThis.navigator) => { try { return !!nav?.canShare?.({files: [file]}); } catch { return false; } };

export async function saveFile(blob, name, {title = '', nav = globalThis.navigator, document = globalThis.document} = {}) {
  const file = new File([blob], name, {type: blob.type || 'application/octet-stream'});
  if (canShareFile(file, nav)) {
    try { await nav.share({files: [file], title}); return 'shared'; }
    catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'downloaded';
}
