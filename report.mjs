// 間違いの報告・情報提供：アプリにはサーバーがないため、運営の Google フォームを、札所・項目・今の表示を入れた状態で開く。
// フォームの URL と各質問の番号（entry.〜）は REPORT_FORM に入れる（作り方は README の「間違いの報告フォーム」）。
// 送るのは札所の番号と名前・項目・今の表示・アプリの版だけで、位置情報や記録・写真は送らない。
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

export const REPORT_FORM = {
  // 例：'https://docs.google.com/forms/d/e/1FAIpQL.../viewform'
  url: '',
  // 例：{temple: 'entry.111', item: 'entry.222', shown: 'entry.333', version: 'entry.444'}
  fields: {temple: '', item: '', shown: '', version: ''},
};
export const REPORT_ITEMS = ['道の難しさ', '駐車場の費用', '駐車場の場所・台数', '住所・場所', '車の注意・通行止め', 'お経・真言', '画面の表示・使い方', 'そのほか'];

const formOK = form => typeof form?.url === 'string' && /^https:\/\/docs\.google\.com\/forms\/d\/e\/[\w-]+\/viewform$/.test(form.url);
export const reportReady = (form = REPORT_FORM) => formOK(form);

// フォームを開く URL（事前入力つき）。項目の番号が無いものは入れない。
export function reportURL({temple = '', item = '', shown = '', version = ''} = {}, form = REPORT_FORM) {
  if (!formOK(form)) return '';
  const q = new URLSearchParams({usp: 'pp_url'});
  for (const [k, v] of Object.entries({temple, item, shown, version})) {
    const key = form.fields?.[k];
    if (v && typeof key === 'string' && /^entry\.\d+$/.test(key)) q.set(key, String(v).slice(0, 300));
  }
  return `${form.url}?${q}`;
}

export function createReportUI({document = globalThis.document, openDialog, getVersion = () => '', form = REPORT_FORM}) {
  const $ = s => document.querySelector(s);
  // 札所の詳細やいろいろな画面の下に置く入口
  const linkHTML = (label = '間違いを知らせる・情報を送る') => reportReady(form) ? `<button type="button" class="text-button report-open" data-report-open>${esc(label)}</button>` : '';
  // ctx: {temple: '第12番 焼山寺', item: '駐車場の費用', shown: '今の表示の文', back}
  function open(ctx = {}) {
    if (!reportReady(form)) return;
    const items = REPORT_ITEMS.map(i => `<label class="inline"><input type="radio" name="report-item" value="${esc(i)}"${i === (ctx.item || 'そのほか') ? ' checked' : ''}>${esc(i)}</label>`).join('');
    openDialog('間違いを知らせる・情報を送る', `${ctx.temple ? `<p class="small"><strong>${esc(ctx.temple)}</strong></p>` : ''}<p class="small">どの情報についてですか。</p><div class="report-items">${items}</div><p class="tiny">次へ進むと、運営の Google フォームが開きます。札所・項目・今の表示・アプリの版を入れた状態になるので、正しい情報や気づいたことを書いて送ってください。位置情報や訪問記録・写真は送りません。</p><div class="dialog-actions">${ctx.back ? '<button type="button" class="quiet" id="report-back">戻る</button>' : ''}<a class="primary" id="report-go" href="#" target="_blank" rel="noopener noreferrer">フォームを開く ↗</a></div>`);
    const go = $('#report-go');
    const update = () => { go.href = reportURL({temple: ctx.temple || '', item: document.querySelector('input[name=report-item]:checked')?.value || '', shown: ctx.shown || '', version: getVersion()}, form); };
    document.querySelectorAll('input[name=report-item]').forEach(r => r.onchange = update);
    update();
    if (ctx.back) $('#report-back').onclick = ctx.back;
  }
  // 画面の中の入口に、その場の札所・項目をつなぐ
  function bind(root, ctx) { root?.querySelectorAll('[data-report-open]').forEach(b => b.onclick = () => open(typeof ctx === 'function' ? ctx(b) : ctx)); }
  return {linkHTML, open, bind, ready: () => reportReady(form)};
}
