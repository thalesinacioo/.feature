// Side panel: mostra o estado da PR da aba ativa (vem do content.js) e manda a aba rolar até a linha.
const LABEL = { wip: '@wip', question: 'QUESTION', comment: 'Comentário' };
const $ = (s) => document.querySelector(s);
const list = $('.list'), filters = $('.filters'), prLabel = $('#pr');

let tabId = null;
let data = null; // { key, items, loading, error } ou null quando a aba não é do Bitbucket
let filter = 'all';

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const fmtDate = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

function commentHtml(n) {
  const u = n.c.user || {};
  const avatar = u.links && u.links.avatar ? `<img src="${esc(u.links.avatar.href)}" alt="">` : '';
  const replies = n.replies.length ? `<div class="replies">${n.replies.map(commentHtml).join('')}</div>` : '';
  // content.html já vem sanitizado pelo Bitbucket
  return `<div class="c">${avatar}<div><div class="meta"><b>${esc(u.display_name || '?')}</b><span>${fmtDate(n.c.created_on)}</span></div>
    <div class="body">${n.c.content.html || esc(n.c.content.raw)}</div></div></div>${replies}`;
}

function render() {
  prLabel.textContent = data && data.key ? data.key.replace(/\/(\d+)$/, ' · PR #$1') : '';
  filters.innerHTML = '';
  if (!data) { list.innerHTML = '<div class="status">Abra uma PR do Bitbucket nesta aba (se acabou de instalar ou recarregar a extensão, dê F5 na página).</div>'; return; }
  if (!data.key) { list.innerHTML = '<div class="status">Esta página não é uma PR do Bitbucket.</div>'; return; }
  if (data.loading) { list.innerHTML = '<div class="status">Carregando…</div>'; return; }
  if (data.error) { list.innerHTML = `<div class="status">Erro: ${esc(data.error)}</div>`; return; }

  const items = data.items;
  const count = (t) => items.filter((i) => t === 'all' || i.type === t).length;
  filters.innerHTML = ['all', 'wip', 'question', 'comment']
    .map((t) => `<button class="chip ${t} ${filter === t ? 'on' : ''}" data-filter="${t}">${t === 'all' ? 'Todos' : LABEL[t]} ${count(t)}</button>`)
    .join('');

  const shown = items.filter((i) => filter === 'all' || i.type === filter);
  if (!shown.length) { list.innerHTML = '<div class="status">Nada encontrado nos .feature desta PR.</div>'; return; }

  let html = '', lastPath = null;
  shown.forEach((it) => {
    if (it.path !== lastPath) { html += `<div class="file" title="${esc(it.path)}">${esc(it.path)}</div>`; lastPath = it.path; }
    const threads = it.threads.length
      ? it.threads.map((t) => `<div class="thread">${commentHtml(t)}</div>`).join('')
      : '<div class="none">Sem comentários nesta linha</div>';
    html += `<div class="item"><div class="head" data-idx="${items.indexOf(it)}"><span class="badge ${it.type}">${LABEL[it.type]}</span>
      <span class="ln">${it.line == null ? '-' : 'L' + it.line}</span><span class="code">${esc(it.text.trim())}</span></div>${threads}</div>`;
  });
  list.innerHTML = html;
  // Links dos comentários abrem em nova aba, não dentro do painel
  for (const a of list.querySelectorAll('a')) a.target = '_blank';
}

async function load() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab ? tab.id : null;
  try {
    data = tabId == null ? null : await chrome.tabs.sendMessage(tabId, { type: 'bfm-get' });
  } catch {
    data = null; // aba sem o content script (não é bitbucket.org)
  }
  render();
}

document.addEventListener('click', (e) => {
  const t = e.target;
  if (t.closest('a')) return;
  if (t.id === 'reload') return tabId != null && chrome.tabs.sendMessage(tabId, { type: 'bfm-reload' }).catch(load);
  const chip = t.closest('[data-filter]');
  if (chip) { filter = chip.dataset.filter; return render(); }
  const head = t.closest('.head');
  if (head && data) {
    const it = data.items[Number(head.dataset.idx)];
    chrome.tabs.sendMessage(tabId, { type: 'bfm-goto', item: { path: it.path, line: it.line } });
  }
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'bfm-state' && sender.tab && sender.tab.id === tabId) { data = msg; render(); }
});
chrome.tabs.onActivated.addListener(load);
chrome.tabs.onUpdated.addListener((id, info) => { if (id === tabId && info.status === 'complete') load(); });

// Avisa o background que o painel desta janela está aberto; ele pede para fechar quando a aba azul é clicada.
// Se o service worker dormir, a porta cai: reconecta.
function connectPanel() {
  const port = chrome.runtime.connect({ name: 'bfm-panel' });
  chrome.windows.getCurrent().then((w) => port.postMessage({ windowId: w.id }));
  port.onMessage.addListener((msg) => { if (msg.type === 'close') window.close(); });
  port.onDisconnect.addListener(() => setTimeout(connectPanel, 300));
}

connectPanel();
load();
