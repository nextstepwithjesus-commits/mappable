// П-Т3: экран пробы. Подсказки — в главном потоке по индексу имён (MiniSearch); полный поиск — в рабочем потоке.
// Серый макет: проверяет только путь; облик — не по 08.
import { Searcher, type SearchIndexData, type SearchResult, type Group } from '../core/search.ts';
import { NameForms } from '../core/forms.ts';
import { BOOK_BY_CODE } from '../core/books.ts';
import { loadEngine, slim, type Engine } from './engine.ts';

const base = new URL('./', location.href).href;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = $<HTMLInputElement>('q');
const sug = $<HTMLUListElement>('sug');
const out = $<HTMLDivElement>('out');
const status = $<HTMLParagraphElement>('status');

// ?main — всё в главном потоке (для замера с замедлением процессора); иначе — рабочий поток, как в 09 § 4.5
const onMain = new URLSearchParams(location.search).has('main');
let seq = 0;
const pending = new Map<number, (v: any) => void>();
let ask: <T>(msg: object) => Promise<T>;
if (onMain) {
  let eng: Engine | null = null;
  ask = async <T,>(msg: any): Promise<T> => {
    if (msg.type === 'load') {
      eng = await loadEngine(msg.base);
      return { t: eng.t } as T;
    }
    const a = performance.now();
    const r = eng!.searcher.search(msg.q);
    return { r: slim(r), workerMs: performance.now() - a } as T;
  };
} else {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const f = pending.get(e.data.id);
    pending.delete(e.data.id);
    f?.(e.data);
  };
  ask = <T,>(msg: object) =>
    new Promise<T>((res) => {
      const id = ++seq;
      pending.set(id, res);
      worker.postMessage({ ...msg, id });
    });
}

let names: Searcher | null = null;
let latest = 0;
let timer = 0;

const t0 = performance.now();
const indexReady = fetch(`${base}search-index.json`)
  .then((r) => r.json())
  .then((d: SearchIndexData) => {
    names = new Searcher(d, new NameForms(d.names));
    return performance.now() - t0;
  });
status.textContent = 'Загружается текст Библии';
const textReady = ask<{ t: Record<string, number> }>({ type: 'load', base }).then((m) => {
  status.textContent = '';
  return m.t;
});

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function renderSug(q: string) {
  const s = names ? names.suggest(q) : [];
  sug.innerHTML = s.map((x, i) => `<li role="option" id="s${i}" aria-selected="false">${esc(x.title)} <span class="meta">${x.kind}</span></li>`).join('');
  input.setAttribute('aria-expanded', s.length ? 'true' : 'false');
}

function groupHtml(g: Group): string {
  switch (g.kind) {
    case 'адрес':
      return `<h2>Адрес: ${esc(g.address.label)}</h2>${g.address.notes.map((n) => `<p class="note">${esc(n)}</p>`).join('')}${g.address.errors.map((n) => `<p class="note">${esc(n)}</p>`).join('')}${
        g.stories.length ? `<p>Истории (эскиз каталога): ${g.stories.map((s) => `${esc(s.story.t)} — ${esc(s.role)}${s.cover ? `, ${s.cover}` : ''}`).join('; ')}</p>` : ''
      }`;
    case 'история':
      return `<h2>История: ${esc(g.story.t)}</h2><p class="meta">${esc(g.story.main)}${g.notFromText ? ' · это название не из текста Библии' : ''}</p>`;
    case 'книга':
      return `<h2>Книга: ${esc(BOOK_BY_CODE.get(g.book)!.name)}</h2>`;
    case 'пара':
      return `<h2>Как связаны: ${esc(g.a[0].n)} и ${esc(g.b[0].n)}</h2><p class="meta">тёзок: ${g.a.length} и ${g.b.length}</p>`;
    case 'лица':
      return `<h2>Лица — ${g.persons.length}</h2><ol>${g.persons.map((p) => `<li>${esc(p.n)}${p.d ? ` — ${esc(p.d)}` : ''}</li>`).join('')}</ol>`;
    case 'текст': {
      const r = g.result;
      return `<h2>В тексте Библии — ${r.total}</h2>${r.alsoForms.length ? `<p class="note">Найдено также по формам: ${esc(r.alsoForms.slice(0, 12).join(', '))}</p>` : ''}<ol>${r.hits
        .map((h) => `<li><b>${esc(BOOK_BY_CODE.get(h.book)!.short)} ${h.c}:${h.v}</b> ${esc(h.text)}${h.inBrackets ? ' <span class="meta">(в скобках)</span>' : ''}</li>`)
        .join('')}</ol>`;
    }
    case 'возможно':
      return `<p>${esc(g.text)}</p>`;
    case 'пусто':
      return `<p>${esc(g.message)}</p>`;
  }
}

function render(r: SearchResult) {
  out.innerHTML = `<h2 class="meta">Результаты по запросу «${esc(r.query)}»${r.layout ? ` (раскладка: «${esc(r.used)}»)` : ''}</h2>` + r.groups.map(groupHtml).join('');
  const n = r.groups.filter((g) => g.kind !== 'пусто').length;
  status.textContent = n ? `Групп результатов: ${n}` : r.groups[0]?.kind === 'пусто' ? (r.groups[0] as { message: string }).message : '';
}

async function runQuery(q: string) {
  await textReady;
  const id = ++latest;
  const a = performance.now();
  const m = await ask<{ r: SearchResult; workerMs: number }>({ type: 'q', q });
  const roundMs = performance.now() - a;
  if (id === latest) render(m.r);
  return { workerMs: m.workerMs, roundMs, first: m.r.groups[0]?.kind };
}

input.addEventListener('input', () => {
  const q = input.value;
  renderSug(q);
  clearTimeout(timer);
  timer = window.setTimeout(() => void runQuery(q), 150);
});

(window as any).__probe = { indexReady, textReady, runQuery, suggest: (q: string) => names?.suggest(q) };
