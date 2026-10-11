// Экран листа: каталог книги списком (08 § 7.27, § 3.4, § 7.25; 11). Режим строки — «переход». Ред. 3.1 листа:
// растянутая ссылка — только на верхней зоне строки (Л-9); фокус не теряется при фильтрах, порядке, виде и слое (Л-7);
// порядок — радиогруппой § 7.18; трудное — в ярусе названия и в имени ссылки; ссылки-пропуски. ПРОТОТИП.
(function () {
  const О = window.ОБЩЕЕ; const { Д, esc, значок, знакВида, адресТекст, число } = О;
  const q = new URLSearchParams(location.search);
  const код = q.get('книга') === 'Мк' ? 'Мк' : 'Быт';
  const кат = Д.каталоги[код];
  const книга = О.КНИГИ[код];
  const завет = книга.завет === 'ot' ? 'ВЗ' : 'НЗ';
  const ИСТОРИИ = ['история', 'истории', 'историй'];
  const состояние = { порядок: q.get('sort') || 'библия', фильтр: new Set((q.get('f') || '').split(',').filter(Boolean)), вид: q.get('view') === 'table' ? 'таблица' : 'список', открыта: q.get('open') };
  const ТЕМЫ = { 'смерть на глазах': 'есть смерть', 'убийство': 'есть убийство', 'казнь': 'есть казнь', 'гибель детей': 'гибнут дети', 'угроза жизни ребёнка': 'жизнь ребёнка в опасности', 'насилие над женщиной': 'говорится о насилии над женщиной', 'блуд': 'говорится о блуде', 'нагота': 'говорится о наготе', 'самоубийство': 'человек убивает себя', 'вызывание умершего': 'вызывают умершего', 'страшные образы видения': 'страшные образы' };
  const трудная = (и) => (и.трудная.length ? `Трудная история: здесь ${и.трудная.map((т) => ТЕМЫ[т.тема.replace(/\s*\(.*\)$/, '')] ?? `есть ${т.тема}`).join(', ')}${О.детскиеПодсказки() ? '. Прочтите сначала сами' : ''}` : '');
  const ПОРЯДОК = { библия: 'по порядку Библии', название: 'по названию, от А до Я', упоминания: 'по числу упоминаний, сначала больше', части: 'по числу частей, сначала больше' };
  const телефон = () => matchMedia('(max-width: 37.4375em)').matches;
  window.ОБЪЯВЛЕНИЕ_СЛОЯ = (второй) => (второй ? 'Показаны столбцы «частей» и «упоминаний» и порядок по ним' : 'Столбцы для изучающих скрыты');

  function видимые() {
    let xs = кат.истории.filter((и) => !состояние.фильтр.size || состояние.фильтр.has(и.вид));
    if (состояние.порядок === 'название') xs = [...xs].sort((a, b) => a.название.localeCompare(b.название, 'ru'));
    if (состояние.порядок === 'упоминания') xs = [...xs].sort((a, b) => b.отклики - a.отклики || a.номер - b.номер);
    if (состояние.порядок === 'части') xs = [...xs].sort((a, b) => b.частей - a.частей || a.номер - b.номер);
    return xs;
  }
  const href = (и) => (и.id === 'e-быт-6-9' ? 'история.html' : `история.html?e=${encodeURIComponent(и.id)}`);

  function строка(и) {
    const id = `р-${и.номер}`;
    const т = трудная(и);
    const метка = и.сЧегоНачать ? `<span class="строка__метка">с чего начать</span>` : '';
    const тр = т ? `<span class="строка__трудное"><span class="тр-полно">${esc(т)}</span><span class="тр-кратко">трудная</span></span>` : '';
    const доп = О.слой2() ? `<span class="строка__число т-адрес"><span aria-hidden="true">${и.частей || '—'}</span><span class="скрыто не-копировать">частей: ${и.частей || 'нет'}</span></span><span class="строка__число т-адрес"><span aria-hidden="true">${и.отклики || '—'}</span><span class="скрыто не-копировать">упоминаний: ${и.отклики || 'нет'}</span></span>` : '';
    const открыта = состояние.открыта === String(и.номер);
    return `<li class="строка${О.слой2() ? ' строка--второй' : ''}" data-n="${и.номер}">
      <div class="строка__верх"><div class="строка__зона">
        <span class="строка__номер">${и.номер}</span>
        <span class="строка__название"><a class="строка__ссылка" href="${href(и)}"${т ? ` aria-label="${esc(и.название)}. ${esc(т)}"` : ''}>${esc(и.название)}</a>${метка}${тр.replace('class="строка__трудное"', 'class="строка__трудное" aria-hidden="true"')}</span>
        <span class="строка__вид"><span class="вид">${знакВида(и.вид)}${esc(и.вид)}</span><span class="адрес-в-ярусе">${адресТекст(и.адрес, '')}</span>${метка ? метка.replace('class="строка__метка"', 'class="строка__метка" aria-hidden="true"') : ''}${тр}</span>
        <span class="строка__адрес">${адресТекст(и.адрес, '')}</span>${доп}
      </div>
      <button class="строка__подробнее" type="button" aria-expanded="${открыта}" aria-controls="${id}-подр" data-name="${esc(и.название)}" data-n="${и.номер}"><span class="видимо-ноутбук">Подробнее</span><span class="видимо-телефон">Ещё</span>${значок('раскрыть')}</button></div>
      <div class="строка__раскрытие" id="${id}-подр" ${открыта ? '' : 'hidden'}>${раскрытие(и)}</div>
    </li>`;
  }
  function раскрытие(и) {
    const Н = Д.ной.о_чём;
    const коротко = и.id === 'e-быт-6-9'
      ? `<p class="подпись-голоса">Коротко, нашими словами</p><p class="т-проза">${Н.простой_слой.map((x) => `${esc(x.текст)} <span class="т-адрес">${адресТекст(x.стихи.join('; '), '')}</span>`).join(' ')}</p>`
      : `<p class="голос-мы">Коротко, нашими словами: этот раздел мы ещё не написали.</p>`;
    const т = трудная(и);
    const части = и.части.length ? `<dt>Части</dt><dd><ol>${и.части.map((ч, n) => `<li>${n + 1}. ${esc(ч.название)} ${адресТекст(ч.стихи, '')}</li>`).join('')}</ol></dd>` : '';
    return `${т ? `<p class="тихая-строка">${esc(т)}</p>` : ''}${коротко}<dl class="т-интерфейс"><dt>Стихов</dt><dd class="цифры">${и.стихов}</dd>${части}${и.отклики ? `<dt>Вспоминают</dt><dd>ещё ${число(и.отклики, ['место', 'места', 'мест'])} в других книгах</dd>` : ''}</dl><p><a class="ссылка-ряд" href="${href(и)}">Открыть историю: ${esc(и.название)}</a></p>`;
  }
  function список() {
    const xs = видимые();
    if (!xs.length) return `<p class="т-проза ч2">По этим фильтрам историй нет. <button class="кн кн--текст" type="button" data-сброс>Сбросить фильтры</button></p>`;
    if (состояние.порядок !== 'библия') return `<p class="т-адрес">Группы скрыты: порядок ${ПОРЯДОК[состояние.порядок]}</p><ul class="список" aria-label="Истории">${xs.map(строка).join('')}</ul>`;
    return кат.повествования.map((п) => {
      const свои = xs.filter((и) => п.истории.includes(и.номер));
      if (!свои.length) return '';
      return `<section class="группа" aria-labelledby="г-${п.id}"><h2 class="группа-заголовок т-повествование" id="г-${п.id}">${esc(п.название)} <span class="группа-число">${число(свои.length, ИСТОРИИ)}</span></h2><ul class="список">${свои.map(строка).join('')}</ul></section>`;
    }).join('');
  }
  function таблица() {
    const xs = видимые();
    const сорт = (ключ, имя, кл = '') => {
      const тек = (ключ === 'номер' && состояние.порядок === 'библия') || состояние.порядок === ключ;
      return `<th scope="col" class="${кл}"${тек ? ` aria-sort="${ключ === 'упоминания' || ключ === 'части' ? 'descending' : 'ascending'}"` : ''}><button type="button" data-сорт="${ключ === 'номер' ? 'библия' : ключ}">${имя}${тек ? значок('сортировка') : ''}</button></th>`;
    };
    return `<div class="таблица-обёртка" role="region" aria-labelledby="табл-подпись"><table class="таблица таблица--полосы таблица--каталог">
      <caption id="табл-подпись" class="${О.слой2() ? 'т-адрес' : 'скрыто'}">${esc(книга.имя)}: ${число(xs.length, ИСТОРИИ)}, ${ПОРЯДОК[состояние.порядок]}.${О.слой2() ? ' «—» — частей нет (история без деления на части) или упоминаний в других книгах не найдено.' : ''}</caption>
      <thead><tr>${сорт('номер', '№', 'число')}${сорт('название', 'Название')}<th scope="col">Вид</th><th scope="col">Адрес</th>${О.слой2() ? `${сорт('части', 'Частей', 'число')}<th scope="col" class="число">Стихов</th>${сорт('упоминания', 'Упоминаний', 'число')}` : ''}</tr></thead>
      <tbody>${xs.map((и) => `<tr><td class="число цифры">${и.номер}</td><th scope="row"><a href="${href(и)}"${и.трудная.length ? ` aria-label="${esc(и.название)}. ${esc(трудная(и))}"` : ''}>${esc(и.название)}</a>${и.трудная.length ? ' <span class="т-адрес нс" aria-hidden="true">трудная</span>' : ''}</th><td><span class="вид">${знакВида(и.вид)}${esc(и.вид)}</span></td><td>${адресТекст(и.адрес, 'цифры')}</td>${О.слой2() ? `<td class="число">${и.частей || '—'}</td><td class="число">${и.стихов}</td><td class="число">${и.отклики || '—'}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  }
  function указатель() {
    const группы = [['Ветхий Завет', 'ot'], ['Новый Завет', 'nt']];
    return `<nav class="указатель-книг" id="книги" aria-labelledby="книги-з" tabindex="-1"><h2 class="скрыто" id="книги-з">Книги Библии</h2>${группы.map(([имя, t]) => `<h3 class="т-книга указатель-книг__завет ч-${t === 'ot' ? 'вз' : 'нз'}">${имя}</h3><ul>${Д.книги.filter((b) => b.завет === t).map((b) => {
      const n = Д.каталоги[b.код]?.истории.length ?? 0;
      const тек = b.код === код;
      if (!n) return `<li class="указатель-книг__книга указатель-книг__книга--нет"><span>${esc(b.имя)}</span></li>`;
      return `<li class="указатель-книг__книга${тек ? ' указатель-книг__книга--тек' : ''}"><a href="каталог.html?книга=${encodeURIComponent(b.код)}"${тек ? ' aria-current="page"' : ''}>${esc(b.имя)}</a><span class="цифры">${n}</span></li>`;
    }).join('')}</ul>`).join('')}</nav>`;
  }
  function видыСЧислом() {
    const m = new Map(); кат.истории.forEach((и) => m.set(и.вид, (m.get(и.вид) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }
  const радио = (имя, легенда, пары, текущий, атр) => `<fieldset class="радио"><legend>${легенда}</legend>${пары.map(([v, п]) => `<label><input type="radio" name="${имя}" value="${v}" ${текущий === v ? 'checked' : ''} ${атр}> ${п}</label>`).join('')}</fieldset>`;
  function строкаДействий() {
    const порядки = Object.entries(ПОРЯДОК).filter(([k]) => О.слой2() || k === 'библия' || k === 'название').map(([k, v]) => [k, v[0].toUpperCase() + v.slice(1)]);
    return `<div class="строка-действий">
      <p class="строка-действий__число" id="число-историй"></p>
      <div class="меню-обёртка"><button class="кн" type="button" aria-expanded="false" aria-controls="лист-порядок" data-toggletip>${значок('сортировка')}<span>Порядок</span></button>
        <div class="меню фасеты" id="лист-порядок" hidden>${радио('порядок', 'Порядок', порядки, состояние.порядок, 'data-порядок')}</div></div>
      <div class="меню-обёртка"><button class="кн" type="button" aria-expanded="false" aria-controls="фасеты" data-toggletip id="кн-фильтры">${значок('фильтры')}<span>Фильтры</span><span id="фильтров-число"></span></button>
        <div class="меню фасеты" id="фасеты" hidden><fieldset class="радио"><legend>Вид</legend>${видыСЧислом().map(([в, c]) => `<label><input type="checkbox" data-фильтр="${esc(в)}" ${состояние.фильтр.has(в) ? 'checked' : ''}> ${esc(в[0].toUpperCase() + в.slice(1))} — <span class="цифры">${c}</span></label>`).join('')}</fieldset></div></div>
      <span class="ряд-кнопок сегменты" role="group" aria-label="Вид списка"><button class="кн" type="button" data-вид="список" aria-pressed="${состояние.вид === 'список'}">${значок('списком')}<span>Список</span></button><button class="кн" type="button" data-вид="таблица" aria-pressed="${состояние.вид === 'таблица'}">${значок('таблица')}<span>Таблица</span></button></span>
      ${О.показТелефон()}
      <span id="фильтры-вкл" class="фильтры-вкл"></span>
    </div>`;
  }
  function обновитьСписок() {
    const n = видимые().length;
    document.getElementById('число-историй').innerHTML = `${число(n, ИСТОРИИ)}<span class="хвост">, ${ПОРЯДОК[состояние.порядок].split(',')[0]}</span>`;
    document.getElementById('фильтров-число').textContent = состояние.фильтр.size ? ` (${состояние.фильтр.size})` : '';
    document.getElementById('фильтры-вкл').innerHTML = [...состояние.фильтр].map((ф) => `<span class="фильтр-вкл">Вид: ${esc(ф)}. <button class="кн кн--текст" type="button" data-снять="${esc(ф)}">Снять<span class="скрыто"> фильтр: ${esc(ф)}</span></button></span>`).join('') + (состояние.фильтр.size ? `<button class="кн кн--текст" type="button" data-сброс>Сбросить фильтры</button>` : '');
    document.getElementById('список').innerHTML = состояние.вид === 'таблица' ? таблица() : список();
    именаКнопок();
    О.обновитьОтступ();
  }
  function именаКнопок() {
    const т = телефон();
    document.querySelectorAll('.строка__подробнее').forEach((b) => b.setAttribute('aria-label', `${т ? 'Ещё' : 'Подробнее'}: ${b.dataset.name}`));
  }
  function отрисовать() {
    document.getElementById('главное').innerHTML = `<div class="каталог" data-zavet="${завет}">
      <div class="каталог__список">
        <nav class="пропуски" aria-label="Переходы"><a class="скрыто-пропуск" href="#список">Перейти к списку</a><a class="скрыто-пропуск" href="#кн-фильтры" data-к-фильтрам>К фильтрам</a><a class="скрыто-пропуск" href="#после-списка">После списка</a></nav>
        <div class="заголовок-книги">
          <h1 class="т-h1" id="h1" tabindex="-1">${esc(книга.имя)}</h1>
          <p class="т-адрес заголовок-книги__число">${число(кат.истории.length, ИСТОРИИ)}</p>
          <a class="кн кн--текст другая-книга" href="#книги">${значок('списком')}Другая книга</a>
          <span class="заголовок-книги__слой">${О.переключательСлоя()}</span>
        </div>
        ${строкаДействий()}
        ${кат.охват ? `<p class="голос-мы неполно">${О.слой2() ? `Размечены главы 1–3 из ${книга.глав}` : 'Пока здесь истории только из глав 1–3'}</p>` : ''}
        <div id="список" tabindex="-1"></div>
        <p class="т-адрес эскиз-подпись" id="после-списка" tabindex="-1">${esc(Д.эскиз)}</p>
      </div>
      ${указатель()}</div>`;
    обновитьСписок();
    const тек = document.querySelector('.указатель-книг__книга--тек');
    if (тек) { const ук = тек.closest('.указатель-книг'); ук.scrollTop = тек.offsetTop - ук.offsetTop - 120; }
    О.обновитьОтступ();
  }
  function сменить(что) {
    const u = new URL(location.href);
    состояние.порядок === 'библия' ? u.searchParams.delete('sort') : u.searchParams.set('sort', состояние.порядок);
    состояние.фильтр.size ? u.searchParams.set('f', [...состояние.фильтр].join(',')) : u.searchParams.delete('f');
    состояние.вид === 'таблица' ? u.searchParams.set('view', 'table') : u.searchParams.delete('view');
    history.replaceState(null, '', u); // уровень 3: замена записи (08 § 6.5)
    обновитьСписок();
    О.объявить(что);
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-сорт],[data-вид],[data-снять],[data-сброс],.строка__подробнее,[data-к-фильтрам]');
    if (!t) return;
    if (t.dataset.кФильтрам !== undefined) { e.preventDefault(); document.getElementById('кн-фильтры').focus(); return; }
    if (t.classList.contains('строка__подробнее')) {
      requestAnimationFrame(() => { const u = new URL(location.href); t.getAttribute('aria-expanded') === 'true' ? u.searchParams.set('open', t.dataset.n) : u.searchParams.delete('open'); history.replaceState(null, '', u); });
      return;
    }
    if (t.dataset.сорт) { состояние.порядок = t.dataset.сорт; сменить(`Порядок: ${ПОРЯДОК[состояние.порядок]}.${состояние.порядок !== 'библия' ? ' Группы по повествованиям скрыты' : ''}`); document.querySelector(`[data-сорт="${t.dataset.сорт}"]`)?.focus(); }
    if (t.dataset.вид) { состояние.вид = t.dataset.вид; document.querySelectorAll('[data-вид]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.вид === состояние.вид))); сменить(`Вид: ${состояние.вид}`); }
    if (t.dataset.снять) { состояние.фильтр.delete(t.dataset.снять); const cb = document.querySelector(`[data-фильтр="${CSS.escape(t.dataset.снять)}"]`); if (cb) cb.checked = false; сменить(`Фильтр снят. ${число(видимые().length, ИСТОРИИ)}`); document.getElementById('кн-фильтры').focus(); }
    if (t.dataset.сброс !== undefined) { состояние.фильтр.clear(); document.querySelectorAll('[data-фильтр]').forEach((x) => { x.checked = false; }); сменить('Фильтры сброшены'); document.getElementById('кн-фильтры').focus(); }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-фильтр]')) {
      t.checked ? состояние.фильтр.add(t.dataset.фильтр) : состояние.фильтр.delete(t.dataset.фильтр);
      сменить(`${число(видимые().length, ИСТОРИИ)}`); // фокус остаётся на флажке: лист фильтров не перерисовывается
    }
    if (t.matches('[data-порядок]')) { состояние.порядок = t.value; сменить(`Порядок: ${ПОРЯДОК[состояние.порядок]}.${состояние.порядок !== 'библия' ? ' Группы по повествованиям скрыты' : ''}`); }
  });
  document.addEventListener('слой', () => { отрисовать(); });
  addEventListener('resize', именаКнопок);
  document.addEventListener('DOMContentLoaded', () => {
    О.оболочка({ активный: '', панель: q.get('panel') !== '0' });
    document.title = `${книга.имя} — истории — Библия наглядно`;
    отрисовать();
  });
})();
