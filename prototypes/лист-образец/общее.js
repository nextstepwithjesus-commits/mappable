// Общее для страниц листа-образца ред. 3: настройки, шапка, плашка пробы, адреса и стихи, копия с адресом,
// раскрытия, список-выбор, меню, объявления, панель управления листом. ПРОТОТИП: в продукт не переносится.
(function () {
  const Д = window.ДАННЫЕ;
  const { значок, знакВида } = window.ЗНАКИ;
  const NB = ' ';
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- настройки (уровень 5: не в адресе, только на устройстве; 08 § 6.5, § 7.23) ----------
  const КЛЮЧ = 'лист-образец:настройки';
  const ПО_УМОЛЧАНИЮ = { тема: 'система', слой: '1', действие: 'киноварь', плотность: 'обычная', ввод: 'система', текст: 'обычный', движение: 'система', возраст: null, возрастСпрошен: false, клавишаПоиска: 'вкл', писание: 'сплошным' };
  function прочитать() { try { return { ...ПО_УМОЛЧАНИЮ, ...JSON.parse(localStorage.getItem(КЛЮЧ) || '{}') }; } catch { return { ...ПО_УМОЛЧАНИЮ }; } }
  function записать(н) { try { localStorage.setItem(КЛЮЧ, JSON.stringify(н)); } catch { /* хранилище недоступно — настройка действует до перезагрузки */ } }
  const настройки = прочитать();
  // параметры адреса — только для снимков листа (перекрывают сохранённое, не записываются)
  const q = new URLSearchParams(location.search);
  const ИЗ_АДРЕСА = { theme: 'тема', layer: 'слой', action: 'действие', density: 'плотность', input: 'ввод', text: 'текст', motion: 'движение', age: 'возраст' };
  for (const [k, v] of Object.entries(ИЗ_АДРЕСА)) if (q.has(k)) настройки[v] = q.get(k) === 'null' ? null : q.get(k);
  if (q.has('age')) настройки.возрастСпрошен = true;
  function применить() {
    const r = document.documentElement;
    const т = настройки.тема === 'dark' || настройки.тема === 'тёмная' ? 'dark' : настройки.тема === 'light' || настройки.тема === 'светлая' ? 'light' : null;
    т ? r.setAttribute('data-theme', т) : r.removeAttribute('data-theme');
    r.setAttribute('data-layer', настройки.слой);
    r.setAttribute('data-action', настройки.действие);
    настройки.плотность === 'плотная' ? r.setAttribute('data-density', 'плотная') : r.removeAttribute('data-density');
    настройки.ввод === 'касание' || настройки.ввод === 'мышь' ? r.setAttribute('data-input', настройки.ввод) : r.removeAttribute('data-input');
    настройки.текст === 'крупнее' || настройки.текст === 'самый' ? r.setAttribute('data-text', настройки.текст) : r.removeAttribute('data-text');
    настройки.движение === 'без' || настройки.движение === 'с' ? r.setAttribute('data-motion', настройки.движение) : r.removeAttribute('data-motion');
    if (q.has('gray')) r.setAttribute('data-gray', '1');
    if (q.has('sim')) r.setAttribute('data-sim', q.get('sim'));
    if (q.has('grid')) r.setAttribute('data-grid', '1');
  }
  применить();
  const слой2 = () => настройки.слой === '2';
  const детскиеПодсказки = () => настройки.возраст !== null && настройки.возраст !== '' && Number(настройки.возраст) < 13;

  // ---------- объявления: одна область role="status" (08 § 6.1 п. 15) ----------
  let статус = null; let прежнее = '';
  function объявить(текст) {
    if (!статус) return;
    if (текст === прежнее) { статус.textContent = ''; setTimeout(() => { статус.textContent = текст; }, 100); }
    else статус.textContent = текст;
    прежнее = текст;
  }

  // ---------- книги и адреса (08 § 6.1 п. 16) ----------
  const КНИГИ = Object.fromEntries(Д.книги.map((к) => [к.код, к]));
  const кодВид = (код) => код.replace(/^(\d)/, `$1${NB}`); // «1Пар» → «1 Пар»
  function разобрать(адрес) {
    const m = адрес.replace(/\u00A0/g, ' ').replace(/\s*[–-]\s*/g, '-').match(/^(\d?\s?\S+?) (\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/);
    if (!m) return null;
    const код = m[1].replace(/\s/g, '');
    return { код, г: +m[2], с: +m[3], г2: m[4] ? +m[4] : +m[2], с2: m[5] ? +m[5] : +m[3] };
  }
  function адрес(a) {
    const p = typeof a === 'string' ? разобрать(a) : a;
    if (!p) return esc(a);
    let s = `${кодВид(p.код)}${NB}${p.г}:${p.с}`;
    if (p.г2 !== p.г) s += `–${p.г2}:${p.с2}`;
    else if (p.с2 !== p.с) s += `–${p.с2}`;
    return s;
  }
  function полныйАдрес(a) {
    const p = typeof a === 'string' ? разобрать(a) : a;
    if (!p) return a;
    const имя = КНИГИ[p.код]?.имя ?? p.код;
    let s = `${имя}, глава ${p.г}, стих ${p.с}`;
    if (p.г2 !== p.г) s += ` — глава ${p.г2}, стих ${p.с2}`;
    else if (p.с2 !== p.с) s += `–${p.с2}`;
    return s;
  }
  // адрес в тексте: видимое сокращение и скрытое полное (08 § 6.1 п. 16)
  const адресТекст = (a, класс = 'т-адрес') => `<span class="${класс}"><span aria-hidden="true">${адрес(a)}</span><span class="скрыто">${esc(полныйАдрес(a))}</span></span>`;
  function стихиДиапазона(a) {
    const p = разобрать(a); const out = [];
    if (!p) return out;
    for (let г = p.г; г <= p.г2; г++) {
      for (let с = г === p.г ? p.с : 1; ; с++) {
        if (г === p.г2 && с > p.с2) break;
        const k = `${p.код} ${г}:${с}`;
        const t = Д.стихи[k] ?? Д.стихиКарточки[k];
        if (t === undefined || t === null) { if (г !== p.г2) break; else break; }
        out.push({ адрес: k, г, с, текст: t });
      }
    }
    return out;
  }
  // показанный текст: дефис с пробелами → тире (08 § 16.2); буква «ё» не восстанавливается
  const показ = (t) => t.replace(/ - /g, ' — ');
  // разметка стиха со скобками: скрытые метки — сгенерированным содержимым (не копируются)
  function htmlСтиха(k, текст) {
    const виды = Д.скобки[k] ?? [];
    let i = 0;
    return esc(показ(текст)).replace(/\[[^\]]*\]|\([^)]*\)/g, (m) => {
      const вид = виды[i++]?.вид;
      const бг = вид === 'gloss' || вид === 'damage';
      return `<span class="скобка${бг ? ' скобка-бг' : ''}" data-vid="${вид ?? 'unknown'}">${m}</span>`;
    });
  }

  // ---------- копия стиха с адресом (08 § 16.2) ----------
  function строкаКопии(адресДиапазона, сНомерами) {
    const стихи = стихиДиапазона(адресДиапазона);
    const p = разобрать(адресДиапазона);
    const один = стихи.length === 1;
    let plain; let html;
    if (один && !сНомерами) {
      plain = `«${показ(стихи[0].текст)}» (${адрес(адресДиапазона)}, Синодальный перевод)`;
      html = `<blockquote cite="${esc(адрес(адресДиапазона))}"><p>«${esc(показ(стихи[0].текст))}»</p></blockquote><p>(${адрес(адресДиапазона)}, Синодальный перевод)</p>`;
    } else {
      const строки = стихи.map((s, n) => `${n > 0 && s.г !== стихи[n - 1].г ? `${s.г}:${s.с}` : s.с} ${показ(s.текст)}`);
      plain = `«${строки.join('\n')}»\n(${адрес(адресДиапазона)}, Синодальный перевод)`;
      html = `<blockquote cite="${esc(адрес(адресДиапазона))}">${стихи.map((s) => `<p><sup>${s.с}</sup> ${esc(показ(s.текст))}</p>`).join('')}</blockquote><p>(${адрес(адресДиапазона)}, Синодальный перевод)</p>`;
    }
    void p;
    return { plain, html };
  }
  async function вБуфер(plain, html, кнопка, чтоОбъявить) {
    let ок = false;
    try {
      if (navigator.clipboard && window.ClipboardItem && html) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([plain], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]);
      } else await navigator.clipboard.writeText(plain);
      ок = true;
    } catch { ок = false; }
    window.__последняяКопия = plain; // для проверки листа
    const место = кнопка?.parentElement?.querySelector('.скопировано') ?? (() => { const s = document.createElement('span'); s.className = 'скопировано т-адрес'; кнопка?.after(s); return s; })();
    if (ок) { место.textContent = 'Скопировано'; объявить(`Скопировано: ${чтоОбъявить}`); }
    else { место.textContent = 'Не получилось скопировать. Выделите текст и скопируйте сами'; объявить('Не получилось скопировать. Выделите текст и скопируйте сами'); }
    return ок;
  }

  // ---------- шапка (08 § 7.1) ----------
  function знакПриложения(вариант = 'надпись', класс = '') {
    let низ = '';
    if (вариант === 'полоса') низ = полосаКниг({ малая: true });
    if (вариант === 'полка') низ = полка();
    return `<span class="знак-приложения ${класс}"><span class="знак-приложения__надпись">Библия наглядно</span>${низ}</span>`;
  }
  function полка() {
    const наиб = Math.max(...Д.книги.map((к) => к.глав));
    const w = 132, h = 14, шаг = w / 66;
    let x = 0; let rects = '';
    Д.книги.forEach((к, i) => {
      if (i === 39) x += 2;
      const вы = Math.max(2, Math.round((к.глав / наиб) * h));
      rects += `<rect x="${(x).toFixed(2)}" y="${h - вы}" width="${(шаг - 0.6).toFixed(2)}" height="${вы}"/>`;
      x += шаг;
    });
    return `<svg class="полка" viewBox="0 0 ${w + 2} ${h}" width="${w + 2}" height="${h}" aria-hidden="true" fill="currentColor">${rects}</svg>`;
  }
  function полосаКниг({ малая = false, отметки = {}, две = false } = {}) {
    const к = Д.книги;
    if (малая) {
      const w = 132, h = 4, шаг = w / 66; let x = 0; let r = '';
      к.forEach((b, i) => { if (i === 39) x += 2; r += `<rect x="${x.toFixed(2)}" y="0" width="${(шаг - 0.6).toFixed(2)}" height="${h}"/>`; x += шаг; });
      return `<svg class="полка" viewBox="0 0 ${w + 2} ${h}" width="${w + 2}" height="${h}" aria-hidden="true" fill="currentColor">${r}</svg>`;
    }
    const клетка = (b, i) => {
      const o = отметки[b.код];
      const разрыв = [5, 17, 22, 39, 44, 51, 65].includes(i) && !(две && i === 39);
      return `<span class="полоса-книг__клетка${разрыв ? ' полоса-книг__клетка--разрыв' : ''}" title="${esc(b.имя)}">${o ? `<span class="полоса-книг__отметка полоса-книг__отметка--${o}"></span>` : ''}</span>`;
    };
    if (две) return `<div class="полоса-книг полоса-книг--две" aria-hidden="true"><div class="полоса-книг__ряд">${к.slice(0, 39).map(клетка).join('')}</div><div class="полоса-книг__ряд">${к.slice(39).map((b, i) => клетка(b, i + 39)).join('')}</div></div>`;
    return `<div class="полоса-книг" aria-hidden="true">${к.map(клетка).join('')}</div>`;
  }
  function шапка(активный = '') {
    const пункт = (имя, зн, адр, класс = '') => `<a class="кн ${класс}" href="${адр}"${активный === имя ? ' aria-current="page"' : ''}>${зн ? значок(зн) : ''}<span>${имя}</span></a>`;
    return `<a class="скрыто-пропуск" href="#главное">Перейти к содержимому</a>
<header class="шапка"><div class="оболочка шапка__ряд">
  <a class="знак-ссылка" href="главная.html" aria-label="Библия наглядно, на главную">${знакПриложения()}</a>
  <search class="шапка__поиск"><form class="поиск" role="search" action="главная.html" onsubmit="event.preventDefault(); ОБЩЕЕ.объявить('Поиск в прототипе не работает: это лист-образец')">
    <label class="поиск__подпись" for="поиск-шапка">Поиск</label>
    <span class="поиск__поле">${значок('поиск')}<input id="поиск-шапка" type="search" placeholder="Стих, слово, человек, место или история" autocomplete="off"></span>
  </form></search>
  <nav class="шапка__нав" aria-label="Разделы">
    ${пункт(слой2() ? 'Указатель' : 'Все истории по алфавиту', '', 'каталог.html', 'в-меню-1024')}
    ${пункт('Заметки', 'заметка', 'настройки.html#заметки', 'в-меню-1024')}
    ${пункт('Справка', 'справка', 'лист.html#справка')}
    ${пункт('Настройки', 'настройки', 'настройки.html')}
  </nav>
  <div class="шапка__меню">
    <a class="кн" href="главная.html#поиск">${значок('поиск')}<span>Поиск</span></a>
    <div class="меню-обёртка"><button class="кн" type="button" aria-haspopup="menu" aria-expanded="false" data-menu="меню-шапки">${значок('меню')}<span>Меню</span></button>
      <div class="меню" role="menu" id="меню-шапки" hidden aria-label="Меню">
        <a role="menuitem" href="каталог.html">${слой2() ? 'Указатель' : 'Все истории по алфавиту'}</a>
        <a role="menuitem" href="настройки.html#заметки">${значок('заметка')}Заметки</a>
        <a role="menuitem" href="лист.html#справка">${значок('справка')}Справка</a>
        <a role="menuitem" href="настройки.html">${значок('настройки')}Настройки</a>
      </div></div>
  </div>
</div></header>`;
  }
  function плашкаПробы() {
    const п = Д.проба;
    return `<div class="плашка-пробы-полоса"><div class="оболочка плашка-пробы"><strong>${esc(п.плашка)}</strong><span class="т-адрес">сборка пробы ${esc(п.коммит)}, лиц ${п.лиц.toLocaleString('ru-RU').replace(/\s/g, NB)}; истории — эскиз шага 0, второго ключа нет</span></div></div>`;
  }
  function переключательСлоя() {
    return `<div class="слой" role="group" aria-labelledby="слой-подпись"><span id="слой-подпись">Показать:</span><span class="слой__группа">
      <button type="button" data-layer-set="1" aria-pressed="${!слой2()}">Для начинающих</button><button type="button" data-layer-set="2" aria-pressed="${слой2()}">Для изучающих</button></span></div>`;
  }

  // ---------- поведение (делегирование) ----------
  const открытые = []; // стек «поверх» для Esc (08 § 6.5)
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, a');
    if (!t) { закрытьМеню(); return; }
    if (t.dataset.layerSet) {
      настройки.слой = t.dataset.layerSet; записать(настройки); применить();
      document.querySelectorAll('[data-layer-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layerSet === настройки.слой)));
      document.dispatchEvent(new CustomEvent('слой'));
      объявить(слой2() ? 'Показаны годы, пометки и столбцы для изучающих' : 'Показано для начинающих');
      return;
    }
    if (t.dataset.menu) { переключитьМеню(t); return; }
    if (t.hasAttribute('aria-controls') && t.hasAttribute('aria-expanded') && !t.dataset.menu && t.getAttribute('role') !== 'tab') {
      const цель = document.getElementById(t.getAttribute('aria-controls'));
      if (!цель) return;
      const откр = t.getAttribute('aria-expanded') !== 'true';
      t.setAttribute('aria-expanded', String(откр));
      цель.hidden = !откр;
      if (откр && t.dataset.toggletip !== undefined) открытые.push({ кнопка: t, цель });
      return;
    }
    if (t.getAttribute('role') !== 'menuitem') закрытьМеню();
  });
  function переключитьМеню(кн) {
    const м = document.getElementById(кн.dataset.menu);
    const откр = кн.getAttribute('aria-expanded') !== 'true';
    закрытьМеню();
    if (!откр) return;
    кн.setAttribute('aria-expanded', 'true'); м.hidden = false;
    открытые.push({ кнопка: кн, цель: м, меню: true });
    м.querySelector('[role="menuitem"]')?.focus();
  }
  function закрытьМеню(вернуть = false) {
    for (let i = открытые.length - 1; i >= 0; i--) {
      const o = открытые[i];
      if (!o.меню) continue;
      o.цель.hidden = true; o.кнопка.setAttribute('aria-expanded', 'false');
      if (вернуть) o.кнопка.focus();
      открытые.splice(i, 1);
    }
  }
  document.addEventListener('keydown', (e) => {
    const м = e.target.closest?.('[role="menu"]');
    if (м) {
      const пункты = [...м.querySelectorAll('[role="menuitem"]')];
      const i = пункты.indexOf(e.target);
      if (e.key === 'ArrowDown') { e.preventDefault(); пункты[(i + 1) % пункты.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); пункты[(i - 1 + пункты.length) % пункты.length].focus(); }
      if (e.key === 'Home') { e.preventDefault(); пункты[0].focus(); }
      if (e.key === 'End') { e.preventDefault(); пункты.at(-1).focus(); }
      if (e.key === 'Tab') закрытьМеню();
      if (e.key.length === 1 && /\S/.test(e.key)) { const n = пункты.find((p, j) => j > i && p.textContent.trim().toLowerCase().startsWith(e.key.toLowerCase())) ?? пункты.find((p) => p.textContent.trim().toLowerCase().startsWith(e.key.toLowerCase())); n?.focus(); }
    }
    if (e.key === 'Escape') {
      const o = открытые.pop();
      if (o) { e.preventDefault(); o.цель.hidden = true; o.кнопка.setAttribute('aria-expanded', 'false'); o.кнопка.focus(); }
    }
    if (e.key === '/' && настройки.клавишаПоиска === 'вкл' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && !e.target.closest?.('[role="listbox"],[role="grid"]')) {
      const п = document.getElementById('поиск-главная') || document.getElementById('поиск-шапка');
      if (п && п.offsetParent) { e.preventDefault(); п.focus(); }
    }
  });

  // список-выбор (APG Listbox без интерактивных потомков, 08 § 7.27)
  function списокВыбор(список, приВыборе) {
    const опции = () => [...список.querySelectorAll('[role="option"]')];
    let активная = опции().findIndex((o) => o.getAttribute('aria-selected') === 'true');
    if (активная < 0) активная = 0;
    const пометить = () => опции().forEach((o, i) => { o.dataset.active = String(i === активная); if (i === активная) список.setAttribute('aria-activedescendant', o.id); });
    const выбрать = (i) => { опции().forEach((o, j) => o.setAttribute('aria-selected', String(j === i))); приВыборе?.(опции()[i]); };
    пометить();
    список.addEventListener('keydown', (e) => {
      const n = опции().length;
      if (e.key === 'ArrowDown') { e.preventDefault(); активная = Math.min(n - 1, активная + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); активная = Math.max(0, активная - 1); }
      else if (e.key === 'Home') { e.preventDefault(); активная = 0; }
      else if (e.key === 'End') { e.preventDefault(); активная = n - 1; }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); выбрать(активная); }
      else if (e.key === 'Escape') { if (опции().some((o) => o.getAttribute('aria-selected') === 'true')) { e.stopPropagation(); опции().forEach((o) => o.setAttribute('aria-selected', 'false')); объявить('Выбор снят'); } }
      else if (e.key.length === 1 && /\S/.test(e.key)) {
        const о = опции(); const буква = e.key.toLowerCase();
        const j = о.findIndex((x, k) => k > активная && x.textContent.trim().toLowerCase().startsWith(буква));
        const jj = j >= 0 ? j : о.findIndex((x) => x.textContent.trim().toLowerCase().startsWith(буква));
        if (jj >= 0) активная = jj;
      } else return;
      пометить(); опции()[активная].scrollIntoView({ block: 'nearest' });
    });
    список.addEventListener('click', (e) => { const o = e.target.closest('[role="option"]'); if (!o) return; активная = опции().indexOf(o); пометить(); выбрать(активная); });
  }

  // ---------- панель управления листом (не часть продукта) ----------
  function панельЛиста() {
    const кн = (ключ, знач, подпись) => `<button type="button" class="кн" data-panel="${ключ}" data-v="${знач}" aria-pressed="${String(настройки[ключ] === знач)}">${подпись}</button>`;
    return `<aside class="панель-листа" aria-label="Управление листом-образцом (не часть продукта)"><div class="оболочка панель-листа__ряд">
      <span class="панель-листа__имя">Лист-образец ред. 3 — управление (не часть продукта)</span>
      <span class="ряд-кнопок" role="group" aria-label="Тема">${кн('тема', 'light', 'Светлая')}${кн('тема', 'dark', 'Тёмная')}</span>
      <span class="ряд-кнопок" role="group" aria-label="Цвет действия">${кн('действие', 'нет', 'Без цвета')}${кн('действие', 'киноварь', 'Киноварь')}${кн('действие', 'бирюза', 'Бирюза')}</span>
      <span class="ряд-кнопок" role="group" aria-label="Способ ввода">${кн('ввод', 'мышь', 'Мышь')}${кн('ввод', 'касание', 'Касание')}</span>
      <span class="ряд-кнопок" role="group" aria-label="Плотность">${кн('плотность', 'обычная', 'Обычная')}${кн('плотность', 'плотная', 'Плотная')}</span>
      <span class="ряд-кнопок" role="group" aria-label="Размер текста">${кн('текст', 'обычный', 'Аа')}${кн('текст', 'крупнее', 'Аа+')}${кн('текст', 'самый', 'Аа++')}</span>
      <nav class="ряд-кнопок" aria-label="Страницы листа"><a class="кн" href="лист.html">Лист</a><a class="кн" href="главная.html">Главная</a><a class="кн" href="каталог.html">Каталог</a><a class="кн" href="история.html">История</a><a class="кн" href="карточка.html">Карточка</a><a class="кн" href="настройки.html">Настройки</a></nav>
    </div></aside>`;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-panel]');
    if (!b) return;
    настройки[b.dataset.panel] = b.dataset.v; записать(настройки); применить();
    document.querySelectorAll(`[data-panel="${b.dataset.panel}"]`).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === b.dataset.v)));
    document.dispatchEvent(new CustomEvent('настройки'));
  });

  function оболочка({ активный = '', панель = true, проба = true } = {}) {
    const верх = document.getElementById('верх');
    верх.innerHTML = (панель ? панельЛиста() : '') + шапка(активный) + (проба ? плашкаПробы() : '');
    статус = document.getElementById('объявления');
  }

  // число с согласованным словом (08 § 4.3 п. 10)
  function форма(n, [одна, две, пять]) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return пять;
    if (b > 1 && b < 5) return две;
    if (b === 1) return одна;
    return пять;
  }
  const число = (n, формы) => `${n.toLocaleString('ru-RU').replace(/\s/g, NB)}${NB}${форма(n, формы)}`;

  window.ОБЩЕЕ = { Д, NB, esc, значок, знакВида, настройки, записать, применить, слой2, детскиеПодсказки, объявить, КНИГИ, кодВид, разобрать, адрес, полныйАдрес, адресТекст, стихиДиапазона, показ, htmlСтиха, строкаКопии, вБуфер, шапка, плашкаПробы, переключательСлоя, полосаКниг, полка, знакПриложения, списокВыбор, оболочка, форма, число, открытые };
})();
