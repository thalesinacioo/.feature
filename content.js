// Bitbucket .feature markers: destaca @wip / QUESTION no diff da PR e lista tudo num painel lateral.
(() => {
  const WIP = /@wip\b/i;
  const QUESTION = /\bQUESTION\b/;
  const PR_ROUTE = /^\/([^/]+)\/([^/]+)\/pull-requests\/(\d+)/;

  function markerType(text) {
    // @wip só conta em linha de tag; citação no texto livre não é marcador
    if (text.trim().startsWith('@') && WIP.test(text)) return 'wip';
    if (QUESTION.test(text)) return 'question';
    return null;
  }

  // ---------- Sintaxe Gherkin (pt e en) ----------
  const BLOCK_KW = /^(\s*)(Funcionalidade|Característica|Caracteristica|Feature|Contexto|Cenário de Fundo|Cenario de Fundo|Background|Regra|Rule|Esquema do Cenário|Esquema do Cenario|Delineação do Cenário|Delineacao do Cenario|Scenario Outline|Scenario Template|Cenários|Cenarios|Cenário|Cenario|Scenario|Exemplos|Exemplo|Examples|Example|Scenarios)(:)/;
  const STEP_KW = /^(\s*)(Dado|Dada|Dados|Dadas|Quando|Então|Entao|E|Mas|Given|When|Then|And|But|\*)(?=\s)/;
  const escHtml = (s) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const tok = (cls, s) => `<span class="bfm-g-${cls}">${escHtml(s)}</span>`;

  // Texto livre: "strings" e <parametros>
  function inline(s) {
    return s.split(/("[^"]*"|<[^<>\s]+>)/).map((p, i) => {
      if (i % 2 === 0) return escHtml(p);
      return tok(p[0] === '"' ? 'string' : 'param', p);
    }).join('');
  }

  function gherkinHtml(text) {
    const t = text.trim();
    if (!t) return escHtml(text);
    if (t.startsWith('#')) return tok('comment', text);
    if (t.startsWith('"""') || t.startsWith('```')) return tok('docstring', text);
    if (t.startsWith('@')) {
      return text.split(/(@[^\s@]+)/).map((p, i) => (i % 2 ? tok('tag', p) : escHtml(p))).join('');
    }
    if (t.startsWith('|')) {
      return text.split(/(\|)/).map((p) => (p === '|' ? tok('pipe', p) : inline(p))).join('');
    }
    let m = BLOCK_KW.exec(text);
    if (m) {
      return escHtml(m[1]) + tok('block', m[2] + m[3]) + tok('title', text.slice(m[0].length));
    }
    m = STEP_KW.exec(text);
    if (m) return escHtml(m[1]) + tok('step', m[2]) + inline(text.slice(m[0].length));
    return inline(text);
  }

  // files: [{ path, lines: [string] }] | comments: comentários da API 2.0 do Bitbucket
  function buildItems(files, comments) {
    const nodes = new Map();
    for (const c of comments) if (!c.deleted) nodes.set(c.id, { c, replies: [] });
    const roots = [];
    for (const n of nodes.values()) {
      const parent = n.c.parent && nodes.get(n.c.parent.id);
      (parent ? parent.replies : roots).push(n);
    }
    const byDate = (a, b) => a.c.created_on.localeCompare(b.c.created_on);
    for (const n of nodes.values()) n.replies.sort(byDate);
    roots.sort(byDate);

    const items = [];
    for (const f of files) {
      const threadsByLine = new Map();
      for (const r of roots) {
        const inl = r.c.inline;
        // Outdated (linha mudou depois do comentário) não está mais pendente de review
        if (!inl || inl.outdated || inl.path !== f.path) continue;
        const line = inl.to != null ? inl.to : null;
        if (!threadsByLine.has(line)) threadsByLine.set(line, []);
        threadsByLine.get(line).push(r);
      }
      f.lines.forEach((text, i) => {
        const line = i + 1;
        const type = markerType(text);
        const threads = threadsByLine.get(line) || [];
        threadsByLine.delete(line);
        if (type || threads.length) items.push({ path: f.path, line, text, type: type || 'comment', threads });
      });
      // Comentários em linha removida ou que não existe mais no arquivo atual
      for (const [line, threads] of threadsByLine) {
        items.push({ path: f.path, line, text: line == null ? '(linha removida)' : '(linha não existe mais)', type: 'comment', threads });
      }
    }
    return items;
  }

  if (typeof module !== 'undefined') { module.exports = { buildItems, markerType, gherkinHtml }; return; }

  // ---------- API (mesma origem, usa a sessão logada do Bitbucket) ----------
  const api = (path) => `/!api/2.0${path}`;
  const sameOrigin = (url) => url && url.replace(/^https:\/\/api\.bitbucket\.org\/2\.0/, '/!api/2.0');

  async function get(url, asText) {
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) throw new Error(`${r.status} em ${url}`);
    return asText ? r.text() : r.json();
  }

  async function getAll(url) {
    const out = [];
    while (url) {
      const d = await get(url);
      out.push(...d.values);
      url = sameOrigin(d.next);
    }
    return out;
  }

  async function loadPr({ ws, repo, id }) {
    const base = api(`/repositories/${ws}/${repo}/pullrequests/${id}`);
    const [pr, diffstat, comments] = await Promise.all([
      get(base),
      getAll(`${base}/diffstat?pagelen=100`),
      getAll(`${base}/comments?pagelen=100&fields=%2Bvalues.inline.%2A`),
    ]);
    const hash = pr.source.commit.hash;
    const paths = diffstat.filter((d) => d.new && d.new.path.endsWith('.feature')).map((d) => d.new.path);
    const files = await Promise.all(paths.map(async (path) => {
      const enc = path.split('/').map(encodeURIComponent).join('/');
      const raw = await get(api(`/repositories/${ws}/${repo}/src/${hash}/${enc}`), true);
      return { path, lines: raw.split('\n') };
    }));
    return buildItems(files, comments);
  }

  // ---------- Destaque das linhas no diff ----------
  function setClass(el, cls, on) {
    if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
  }

  // Linha do diff: o <pre> com o código. A thread de comentários fica fora dele, na mesma row.
  function codeCell(link) {
    const row = link.closest('[role="row"]');
    return row && row.querySelector('[role="gridcell"][data-line-type]');
  }

  // Pinta a sintaxe numa cópia colorida e esconde os nós originais via CSS (o React segue dono deles)
  function colorize(cell) {
    let copy = cell.querySelector(':scope > .bfm-gh');
    const own = [...cell.childNodes].filter((n) => n !== copy);
    const text = own.map((n) => n.textContent).join('');
    if (own.some((n) => n.nodeType === Node.TEXT_NODE && n.textContent)) return text;
    if (copy && copy.dataset.src === text) return text;
    if (!copy) {
      copy = document.createElement('span');
      copy.className = 'bfm-gh';
    }
    copy.dataset.src = text;
    copy.innerHTML = gherkinHtml(text);
    cell.appendChild(copy);
    setClass(cell, 'bfm-gh-on', true);
    return text;
  }

  function highlight() {
    for (const link of document.querySelectorAll('[data-qa="code-line-permalink"][id*=".feature"]')) {
      const cell = codeCell(link);
      if (!cell) continue;
      const text = colorize(cell);
      const type = cell.getAttribute('data-line-type') === '-' ? null : markerType(text);
      const line = cell.closest('pre') || cell;
      setClass(line, 'bfm-wip', type === 'wip');
      setClass(line, 'bfm-question', type === 'question');
    }
  }

  // ---------- Ir para a linha ----------
  // Ids do Bitbucket: L<path>T<linha nova> ou L<path>F<linha antiga>T<linha nova>
  function findRow(path, line) {
    const prefix = `L${path}`;
    for (const link of document.querySelectorAll('[data-qa="code-line-permalink"]')) {
      if (!link.id.startsWith(prefix)) continue;
      const m = /^(?:F\d+)?T(\d+)$/.exec(link.id.slice(prefix.length));
      const cell = m && Number(m[1]) === line && codeCell(link);
      if (cell) return cell.closest('pre') || cell;
    }
    return null;
  }

  function findFileHeader(path) {
    return [...document.querySelectorAll('[data-testid="file-header"]')].find((h) => h.textContent.startsWith(path));
  }

  async function goTo(item) {
    let row = item.line && findRow(item.path, item.line);
    if (!row) {
      const header = findFileHeader(item.path);
      if (header) header.scrollIntoView({ block: 'start' });
      // Diff renderiza sob demanda: espera a linha aparecer
      for (let i = 0; i < 20 && !row && item.line; i++) {
        await new Promise((r) => setTimeout(r, 150));
        row = findRow(item.path, item.line);
      }
      if (!row) {
        // Linha fora da tela atual (ex.: aba Overview): abre "Files changed" já apontando para ela
        const m = PR_ROUTE.exec(location.pathname);
        if (m && item.line && !location.pathname.endsWith('/diff')) {
          location.assign(`/${m[1]}/${m[2]}/pull-requests/${m[3]}/diff#L${item.path}T${item.line}`);
        }
        return;
      }
    }
    row.scrollIntoView({ block: 'center' });
    row.classList.remove('bfm-flash');
    void row.offsetWidth;
    row.classList.add('bfm-flash');
  }

  // Ao abrir a PR com #L<path>T<linha>, espera o diff renderizar e vai até a linha
  async function goToHash() {
    const m = /^#L(.+\.feature)T(\d+)$/.exec(decodeURIComponent(location.hash));
    if (!m) return;
    for (let i = 0; i < 40; i++) {
      if (findRow(m[1], Number(m[2]))) return goTo({ path: m[1], line: Number(m[2]) });
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  // ---------- Estado da PR, compartilhado com o side panel do Chrome ----------
  const state = { key: null, items: [], loading: false, error: null };
  const snapshot = () => ({ key: state.key, items: state.items, loading: state.loading, error: state.error });

  // Atalho na página: aba azul que abre o side panel
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      button { position: fixed; right: 0; top: 40%; z-index: 2147483000; writing-mode: vertical-rl; background: #0c66e4; color: #fff;
        border: 0; border-radius: 6px 0 0 6px; padding: 12px 6px; font: 600 13px -apple-system, BlinkMacSystemFont, sans-serif;
        cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.25); }
      button[hidden] { display: none; }
    </style>
    <button hidden title="Abrir painel lateral"></button>`;
  const tab = root.querySelector('button');
  tab.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'bfm-open' }));

  function publish() {
    const markers = state.items.filter((i) => i.type !== 'comment').length;
    tab.hidden = !state.key;
    tab.textContent = state.loading ? '.feature …' : `.feature (${markers})`;
    // Sem painel aberto ninguém recebe: ignora o erro
    chrome.runtime.sendMessage({ type: 'bfm-state', ...snapshot() }).catch(() => {});
  }

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg.type === 'bfm-get') reply(snapshot());
    else if (msg.type === 'bfm-goto') goTo(msg.item);
    else if (msg.type === 'bfm-reload') refresh(true);
  });

  async function refresh(force) {
    const m = PR_ROUTE.exec(location.pathname);
    const key = m ? m.slice(1, 4).join('/') : null;
    if (key === state.key && !force) return;
    state.key = key;
    state.items = [];
    state.error = null;
    if (!key) return publish();
    state.loading = true;
    publish();
    try {
      const items = await loadPr({ ws: m[1], repo: m[2], id: m[3] });
      if (state.key === key) state.items = items;
    } catch (err) {
      if (state.key === key) state.error = err.message;
    }
    state.loading = false;
    publish();
  }

  document.documentElement.appendChild(host);

  let timer = null;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => { highlight(); refresh(false); }, 250);
  }).observe(document.body, { childList: true, subtree: true });

  highlight();
  refresh(false);
  goToHash();
})();
