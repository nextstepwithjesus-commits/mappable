// Экран 1 шага 0: каталог книги (Бытие; Евангелие от Марка, главы 1–3).
// Данные — prototypes/шаг-0/данные/ через лист-данные.js (собирает лист/собрать.mjs); знаки — лист/знаки.js.
// ПРОТОТИП: в продукт не переносится.
(function () {
  const Л = window.ЛИСТ, З = window.ЗНАКИ, корень = document.documentElement;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const экр = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const нбп = (s) => String(s).replace(/(\S) (\d)/g, '$1 $2');
  // короткое слово не остаётся в конце строки: «Иаков приходит в Египет»
  const висячие = (s) => String(s).replace(/(^|\s)(в|во|и|с|со|к|у|о|об|от|из|на|до|за|по|не|а)\s/gi, '$1$2\u00a0');
  const q = new URLSearchParams(location.search);
  const книга = q.get('book') === 'mk' ? 'mk' : 'gen';
  const К = книга === 'mk' ? Л.марк : Л.бытие;
  const завет = книга === 'mk' ? 'нз' : 'вз';
  const направление = корень.dataset.dir || 'a';

  // ---------- слова ----------
  const ПР = new Intl.PluralRules('ru');
  const историй = (n) => `${n} ${{ one: 'история', few: 'истории', many: 'историй', other: 'истории' }[ПР.select(n)]}`;
  const стихов = (n) => `${n} ${{ one: 'стих', few: 'стиха', many: 'стихов', other: 'стиха' }[ПР.select(n)]}`;
  const частей = (n) => `${n} ${{ one: 'часть', few: 'части', many: 'частей', other: 'части' }[ПР.select(n)]}`;
  const ИМЯ_КНИГИ = { Быт: 'Бытие', Мк: 'Евангелие от Марка', Мф: 'Евангелие от Матфея', Лк: 'Евангелие от Луки', Ин: 'Евангелие от Иоанна' };
  function полныйАдрес(a) {
    return a.split(/;\s*/).map((ч) => {
      const m = ч.match(/^(\S+) (\d+):(\d+)(?:[–-](\d+))?(?: – (\d+):(\d+))?/);
      if (!m) return ч;
      const кн = ИМЯ_КНИГИ[m[1]] || m[1];
      if (m[5]) return `${кн}, с главы ${m[2]} стиха ${m[3]} по главу ${m[5]} стих ${m[6]}`;
      return `${кн}, глава ${m[2]}, ${m[4] ? `стихи с ${m[3]} по ${m[4]}` : `стих ${m[3]}`}`;
    }).join('; ');
  }
  // Тихая строка трудного § 7.24: тема — из поля «трудная» (без слов в скобках данных)
  const ТЕМА = { 'смерть на глазах': 'смерть', убийство: 'убийство', казнь: 'казнь', нагота: 'нагота', блуд: 'блуд', 'насилие над женщиной': 'насилие над женщиной', 'угроза жизни ребёнка': 'угроза жизни ребёнка' };
  function трудная(и) {
    if (!и.трудная) return '';
    const темы = [...new Set(и.трудная.map((т) => ТЕМА[т.тема.replace(/\s*\(.*\)/, '')] || т.тема.replace(/\s*\(.*\)/, '')))];
    const список = темы.length > 1 ? темы.slice(0, -1).join(', ') + ' и ' + темы[темы.length - 1] : темы[0];
    return `Трудная история: здесь есть ${список}. Прочтите сначала сами`;
  }

  // ---------- «нет сведений»: пять видов, у каждого знак и слово (Ф-12) ----------
  const ВИДЫ_НЕТ = {
    1: ['не-сказано', 'В Библии не сказано.', 'библия'],
    2: ['библия-говорит', 'Библия говорит.', 'библия'],
    3: ['место-неизвестно', 'Где — неизвестно.', ''],
    4: ['не-размечено', 'Мы ещё не знаем.', 'мы'],
    5: ['не-относится', 'Не относится.', ''],
  };
  function нет(вид, текст, кл = '') {
    const [зн, слово, голос] = ВИДЫ_НЕТ[вид];
    return `<p class="нет-сведений ${голос ? 'нет-сведений--' + голос : ''} ${кл}">${З.значок(зн)}<span><span class="нет-сведений__слово">${слово}</span> <span class="нет-сведений__текст">${текст}</span></span></p>`;
  }

  // ---------- обложка § 7.3 ----------
  const СЕТКА24 = `<svg class="обложка__сетка" viewBox="0 0 270 202" preserveAspectRatio="xMinYMin slice" aria-hidden="true" focusable="false">${Array.from({ length: 11 }, (_, i) => `<line x1="${(i + 1) * 24}" y1="0" x2="${(i + 1) * 24}" y2="202"/>`).join('')}${Array.from({ length: 8 }, (_, i) => `<line x1="0" y1="${(i + 1) * 24}" x2="270" y2="${(i + 1) * 24}"/>`).join('')}</svg>`;
  const кодКниги = К.книга === 'Мк' ? 'Мк' : 'Быт';
  function обложка(и, { зеркально = false, примечание = true } = {}) {
    const ст = и.обложка.ступень;
    const зн = З.знакИстории(и, кодКниги);
    // В-25: обложку держат номер и типографика; знак малый и точный, тонкой линией «чернила», без заливки
    const номер = `<span class="обложка__поле-номер номер-истории${завет === 'вз' ? ' номер-истории--вз' : ''}" aria-hidden="true">${и.номер}</span>`;
    const поле = номер + ((ст === 3 || !зн)
      ? З.вид(и.вид, 'обложка__знак-вида')
      : `<span class="обложка__горизонт"></span>${З.предмет(зн, { класс: 'обложка__знак', выравнивание: зеркально ? 'xMinYMax meet' : 'xMaxYMax meet' })}`);
    const тр = трудная(и);
    const кл = ['обложка', 'обложка--' + завет, ст === 1 ? 'обложка--ступень-1' : '', зеркально ? 'обложка--зеркально' : ''].join(' ');
    const второй = [и.вид !== 'событие' ? и.вид : '', и.части ? частей(и.части.length) : '', и.также ? 'также ' + [...new Set(и.также.map((т) => т.стихи.split(' ')[0]))].join(', ') : ''].filter(Boolean).join('; ');
    const рисунка = ст === 1 && направление !== 'v' && примечание
      ? '<span class="обложка__примечание">Рисунка здесь нет: проба художника ждёт решения владельца</span>' : '';
    return `<li class="${кл}" id="и-${и.номер}">
      <div class="обложка__поле">${поле}</div>
      <div class="обложка__подпись">
        <a class="обложка__название" href="#и-${и.номер}">${экр(висячие(и.название))}<span class="скрыто">, ${экр(полныйАдрес(и.адрес))}${и.вид !== 'событие' ? ', ' + экр(и.вид) : ''}${тр ? '. ' + тр : ''}</span></a>
        <span class="к-адрес" aria-hidden="true">${нбп(и.адрес)}</span>
        ${тр ? `<span class="тихая-строка" aria-hidden="true">${тр}</span>` : ''}
        ${второй ? `<span class="пометка только-второй" aria-hidden="true">${экр(второй)}</span>` : ''}
        ${рисунка}
      </div>
    </li>`;
  }
  function строка(и) {
    const тр = трудная(и);
    return `<li class="строка-каталога" id="и-${и.номер}">
      <span class="строка-каталога__номер номер-истории${завет === 'вз' ? ' номер-истории--вз' : ''}" aria-hidden="true">${и.номер}</span>
      <span class="строка-каталога__тело">
        <a class="строка-каталога__название" href="#и-${и.номер}">${экр(висячие(и.название))}<span class="скрыто">, ${экр(полныйАдрес(и.адрес))}, ${экр(и.вид)} в ${стихов(и.стихов)}${тр ? '. ' + тр : ''}</span></a>
        <span class="к-адрес" aria-hidden="true">${нбп(и.адрес)}</span>
        ${тр ? `<span class="тихая-строка" aria-hidden="true">${тр}</span>` : ''}
      </span>
    </li>`;
  }
  // ряд обложек: две соседние обложки с одним знаком — зеркально (§ 7.3)
  function ряд(истории, опции = {}) {
    let прежний = null, h = '';
    for (const и of истории) {
      if (и.показ === 'строка') { h += строка(и); прежний = null; continue; }
      const зн = и.обложка.ступень === 3 ? null : З.знакИстории(и, кодКниги);
      const зерк = !!зн && прежний === зн;
      h += обложка(и, { зеркально: зерк, ...опции });
      прежний = зерк ? null : зн;
    }
    return h;
  }

  // ---------- адрес повествования: от первого стиха первой истории до последнего стиха последней ----------
  function охват(ист) {
    const нач = ист[0].адрес.match(/^(\S+) (\d+):(\d+)/);
    let кон = null;
    for (const и of ист) {
      for (const ч of и.адрес.split(/;\s*/)) {
        const m = ч.match(/(\d+):(\d+)(?:[–-](\d+))?(?: – (\d+):(\d+))?$/) || [];
        const гл = +(m[4] || m[1]), ст = +(m[5] || m[3] || m[2]);
        if (!кон || гл > кон[0] || (гл === кон[0] && ст > кон[1])) кон = [гл, ст];
      }
    }
    return `${нач[1]} ${нач[2]}:${нач[3]} – ${кон[0]}:${кон[1]}`;
  }

  // ---------- страница книги ----------
  function страница() {
    const по = Object.fromEntries(К.истории.map((и) => [и.номер, и]));
    const n = К.истории.length;
    const путь = книга === 'mk'
      ? ['Истории Библии', 'Новый Завет', 'Евангелия']
      : ['Истории Библии', 'Ветхий Завет', 'Пятикнижие'];
    let h = `<nav class="путь" aria-label="Путь"><ol>${путь.map((p, i) => `<li>${i ? З.значок('дальше') : ''}<a href="#верх">${p}</a></li>`).join('')}</ol></nav>`;

    const первыйЕсть = К.истории.some((и) => и.первый_ряд);
    const порядок = '<p class="книга__порядок"><a href="#верх">Истории идут в порядке книг Библии. Что было раньше, а что позже, — на ленте времени</a></p>';
    // шапка книги: заглавие, число, порядок; эпиграф каталога — первый стих Библии (08 § 2.5 п. 3)
    const эп = Л.стихи['Быт 1:1'][0];
    h += `<header class="книга книга--${книга}">
      <div class="книга__имя">
        <h1 class="к-заглавие-книги книга__заглавие">${экр(К.название_книги)}</h1>
        ${книга === 'mk' ? '' : `<p class="книга__число">${историй(n)}</p>`}
      </div>
      ${книга === 'mk' ? `<p class="книга__число">${историй(n)} в главах 1–3</p>` : ''}
      ${первыйЕсть ? '' : `<div class="книга__справа">${книга === 'mk' ? нет(4, 'Мы разметили только главы 1–3 из 16. Истории глав 4–16 ещё не составлены.') : ''}${порядок}</div>`}
      ${книга === 'gen' ? `<figure class="эпиграф">
        <blockquote class="эпиграф__стих к-эпиграф"><p>${экр(эп.текст)}</p></blockquote>
        <figcaption class="к-адрес">${нбп(эп.адрес)}</figcaption>
      </figure>` : ''}
    </header>`;

    // первый ряд по В-22 (только где он выбран в данных)
    const первый = К.истории.filter((и) => и.первый_ряд);
    if (первый.length) {
      h += `<section class="первый-ряд" aria-labelledby="ряд-заголовок">
        <h2 class="первый-ряд__заголовок" id="ряд-заголовок">Самые известные</h2>
        <ul class="обложки" role="list" aria-label="${экр(К.название_книги)}: известные истории, ${первый.length} из ${n}">${ряд(первый, { примечание: false })}</ul>
        <div class="первый-ряд__низ">
          <a class="все-ссылка" href="#все"><span>Все ${историй(n)}</span><span class="скрыто"> книги ${экр(К.название_книги)}</span>${З.значок('раскрыть')}</a>
          <div class="первый-ряд__пометки">
            ${порядок}
            ${нет(4, экр(К.первый_ряд_подпись) + '.')}
            ${направление !== 'v' ? '<p class="голос-мы">Рисунка здесь нет: проба художника ждёт решения владельца. На обложках — временный знак: его нарисовал составитель прототипа, не художник.</p>' : '<p class="голос-мы">На обложках — временный знак: его нарисовал составитель прототипа, не художник.</p>'}
          </div>
        </div>
      </section>`;
    }

    // «Рассказано здесь» — повествования по порядку текста (11 § 3.2–3.3)
    h += `<section class="рассказано${первыйЕсть ? '' : ' рассказано--сразу'}" id="все" aria-labelledby="все-заголовок">
      <h2 class="к-завет-в-каталоге рассказано__заголовок" id="все-заголовок" tabindex="-1">Рассказано здесь</h2>`;
    for (const п of К.повествования) {
      const ист = п.истории.map((x) => по[x]);
      const id = п.id;
      h += `<section class="повествование" aria-labelledby="з-${id}">
        <div class="повествование__шапка">
          <span class="повествование__номер к-номер-истории номер-истории${завет === 'вз' ? ' номер-истории--вз' : ''}" aria-hidden="true">${п.истории[0]}</span>
          <div class="повествование__имя">
            <h3 class="к-книга-в-каталоге" id="з-${id}"><button class="повествование__кнопка" type="button" aria-expanded="true" aria-controls="с-${id}"><span>${экр(п.название)}</span>${З.значок('раскрыть', 'значок-раскрыть')}</button></h3>
            <p class="повествование__охват"><span>${историй(ист.length)}</span><span>${нбп(охват(ист))}</span><a href="#верх">Страница повествования<span class="скрыто">: ${экр(п.название)}</span></a></p>
          </div>
        </div>
        <ul class="обложки" role="list" id="с-${id}">${ряд(ист)}</ul>
      </section>`;
    }
    h += '</section>';

    // «Упоминается здесь»
    h += `<section class="упоминается" aria-labelledby="уп-заголовок">
      <h2 class="к-завет-в-каталоге" id="уп-заголовок">Упоминается здесь</h2>
      ${нет(4, `Мы ещё не проверили, какие истории из других книг упоминает ${книга === 'mk' ? 'Евангелие от Марка' : 'книга Бытие'}.`)}
    </section>`;
    $('#книга').innerHTML = h;
    document.title = `${К.название_книги} — истории книги. Библия наглядно (прототип шага 0)`;
  }

  // ---------- подвал: служебное мелко внизу ----------
  function подвал() {
    const адрес = (о) => { const p = new URLSearchParams(location.search); for (const [k, v] of Object.entries(о)) p.set(k, v); return '?' + p.toString(); };
    const тема = корень.dataset.theme || '';
    $('#подвал').innerHTML = `<div class="подвал__внутри">
      <p>Прототип шага 0 (08 § 2.2): облик для решения владельца, не продукт. Данные — предварительные, разметка одного составителя без второй проверки. На обложках — временный знак: его нарисовал составитель прототипа, не художник.</p>
      <ul class="подвал__ссылки">
        <li><a href="${адрес({ book: 'gen' })}"${книга === 'gen' ? ' aria-current="page"' : ''}>Бытие</a></li>
        <li><a href="${адрес({ book: 'mk' })}"${книга === 'mk' ? ' aria-current="page"' : ''}>Евангелие от Марка, главы 1–3</a></li>
      </ul>
      <ul class="подвал__ссылки">
        <li><a href="${адрес({ dir: 'a' })}"${направление === 'a' ? ' aria-current="true"' : ''}>Направление А «Иллюстрированный атлас»</a></li>
        <li><a href="${адрес({ dir: 'b' })}"${направление === 'b' ? ' aria-current="true"' : ''}>Б «Книга с рубриками»</a></li>
        <li><a href="${адрес({ dir: 'v' })}"${направление === 'v' ? ' aria-current="true"' : ''}>В «Справочник»</a></li>
        <li><a href="${адрес({ theme: тема === 'dark' ? 'light' : 'dark' })}">${тема === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</a></li>
      </ul>
      <p id="проба-шрифта">Проверяем, загрузились ли шрифты</p>
    </div>`;
  }

  // ---------- поиск: подсказки с двух букв (APG Combobox, § 7.2) ----------
  const ИНДЕКС = [Л.бытие, Л.марк].flatMap((кн) => кн.истории.map((и) => ({ кн: кн.книга === 'Мк' ? 'mk' : 'gen', имя: кн.название_книги, и })));
  const норм = (s) => s.toLowerCase().replace(/ё/g, 'е');
  function поиск(поле, список, число) {
    let выбран = -1, найдено = [];
    function показать() {
      const t = норм(поле.value.trim());
      if (t.length < 2) { закрыть(); return; }
      найдено = ИНДЕКС.filter((x) => норм(x.и.название).split(/[\s,]+/).some((с) => с.startsWith(t)) || норм(x.и.название).includes(t))
        .sort((a, b) => (норм(b.и.название).startsWith(t) - норм(a.и.название).startsWith(t)) || (a.кн === книга ? -1 : 0) - (b.кн === книга ? -1 : 0))
        .slice(0, 8);
      выбран = -1;
      if (!найдено.length) {
        список.innerHTML = `<p class="поиск__группа" role="presentation">Ничего не нашли. Проверьте, как написано слово</p>`;
      } else {
        список.innerHTML = `<p class="поиск__группа" role="presentation">Истории</p>` + найдено.map((x, i) => `<p class="поиск__строка" role="option" id="${список.id}-${i}" aria-selected="false" data-i="${i}"><b>${экр(x.и.название)}</b><span class="к-адрес">${нбп(x.и.адрес)}</span></p>`).join('');
      }
      список.hidden = false; поле.setAttribute('aria-expanded', 'true');
      число.textContent = найдено.length ? `${найдено.length} ${{ one: 'подсказка', few: 'подсказки', many: 'подсказок', other: 'подсказки' }[ПР.select(найдено.length)]}` : 'Ничего не нашли';
    }
    function закрыть() { список.hidden = true; поле.setAttribute('aria-expanded', 'false'); поле.removeAttribute('aria-activedescendant'); выбран = -1; }
    function отметить(i) {
      выбран = i;
      $$('[role="option"]', список).forEach((o, k) => o.setAttribute('aria-selected', String(k === i)));
      if (i >= 0) поле.setAttribute('aria-activedescendant', `${список.id}-${i}`);
    }
    function перейти(x) {
      if (!x) return;
      if (x.кн !== книга) { const p = new URLSearchParams(location.search); p.set('book', x.кн); location.href = '?' + p.toString() + '#и-' + x.и.номер; return; }
      закрыть(); закрытьЭкран(false);
      к_истории(x.и.номер);
    }
    поле.addEventListener('input', показать);
    поле.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && найдено.length) { e.preventDefault(); if (список.hidden) показать(); отметить(Math.min(выбран + 1, найдено.length - 1)); }
      else if (e.key === 'ArrowUp' && найдено.length) { e.preventDefault(); отметить(Math.max(выбран - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); перейти(найдено[выбран >= 0 ? выбран : 0]); }
      else if (e.key === 'Escape') {
        if (!список.hidden) { e.preventDefault(); e.stopPropagation(); закрыть(); }
        else if (поле.value) { e.preventDefault(); e.stopPropagation(); поле.value = ''; }
      }
    });
    список.addEventListener('mousedown', (e) => { const o = e.target.closest('[role="option"]'); if (o) { e.preventDefault(); перейти(найдено[+o.dataset.i]); } });
    поле.addEventListener('blur', () => setTimeout(закрыть, 150));
    return { показать };
  }
  function к_истории(номер) {
    const li = document.getElementById('и-' + номер);
    if (!li) return;
    const спис = li.closest('ul[id]');
    if (спис && спис.hidden) { спис.hidden = false; const b = $(`[aria-controls="${спис.id}"]`); if (b) b.setAttribute('aria-expanded', 'true'); }
    const a = $('a', li);
    li.scrollIntoView({ block: 'center' });
    a.focus({ preventScroll: true });
  }

  // ---------- экран поиска на телефоне ----------
  const экран = $('#поиск-экран');
  function открытьЭкран() { экран.hidden = false; document.body.classList.add('поиск-открыт'); $('#поиск-экран-поле').focus(); }
  function закрытьЭкран(вернуть = true) {
    if (экран.hidden) return;
    экран.hidden = true; document.body.classList.remove('поиск-открыт');
    if (вернуть) $('#поиск-открыть').focus();
  }

  // ---------- поведение ----------
  function слой() {
    $$('[data-слой-кнопка]').forEach((b) => b.setAttribute('aria-pressed', String((корень.dataset.layer || '1') === b.dataset.слойКнопка)));
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) {
      const a = e.target.closest('a[href="#все"]');
      if (a) { e.preventDefault(); const h = $('#все-заголовок'); h.scrollIntoView(); h.focus({ preventScroll: true }); history.replaceState(null, '', '#все'); }
      return;
    }
    if (b.dataset.слойКнопка) { корень.dataset.layer = b.dataset.слойКнопка; слой(); }
    else if (b.classList.contains('повествование__кнопка')) {
      const откр = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', String(откр));
      document.getElementById(b.getAttribute('aria-controls')).hidden = !откр;
    } else if (b.id === 'меню-кнопка') {
      const откр = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', String(откр)); $('#меню').hidden = !откр;
    } else if (b.id === 'поиск-открыть') открытьЭкран();
    else if (b.id === 'поиск-закрыть') закрытьЭкран();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!экран.hidden) { закрытьЭкран(); return; }
    const м = $('#меню-кнопка');
    if (м.getAttribute('aria-expanded') === 'true') { м.setAttribute('aria-expanded', 'false'); $('#меню').hidden = true; м.focus(); }
  });
  // фокус не уходит за экран поиска (aria-modal)
  экран.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const ф = $$('button, input', экран); const пер = ф[0], посл = ф[ф.length - 1];
    if (e.shiftKey && document.activeElement === пер) { e.preventDefault(); посл.focus(); }
    else if (!e.shiftKey && document.activeElement === посл) { e.preventDefault(); пер.focus(); }
  });
  // при переходе на ширину ноутбука экран поиска не остаётся открытым
  matchMedia('(min-width: 52.5em)').addEventListener('change', (m) => { if (m.matches) закрытьЭкран(false); });

  $$('[data-значок]').forEach((el) => { el.outerHTML = З.значок(el.dataset.значок); });
  страница(); подвал(); слой();
  поиск($('#поиск-поле'), $('#подсказки'), $('#поиск-число'));
  const п2 = поиск($('#поиск-экран-поле'), $('#подсказки-экран'), $('#поиск-экран-число'));
  if (q.get('search') !== null) { открытьЭкран(); $('#поиск-экран-поле').value = q.get('search'); п2.показать(); }
  if (/^#и-\d+$/.test(location.hash)) к_истории(location.hash.slice(3));

  // проба загрузки шрифтов: снимок без нужного шрифта недействителен
  document.fonts.ready.then(() => {
    const сем = { a: ['Literata', 'Golos Text'], b: ['Piazzolla', 'Ysabeau Office'], v: ['Source Serif 4', 'Onest'] }[направление];
    const ок = сем.every((f) => document.fonts.check(`16px "${f}"`, 'Й'));
    $('#проба-шрифта').textContent = ок ? `Шрифты загружены: ${сем.join(' и ')}.` : `Шрифты не загрузились: ${сем.join(', ')} — снимок недействителен.`;
    корень.dataset.fonts = ок ? 'ok' : 'нет';
  });
})();
