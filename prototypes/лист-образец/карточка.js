// Экран листа: Карточка лица «Ной» (07; 08 § 7.28 — блоки с числом, § 5.4 — «нет сведений», § 7.7 — пометки,
// § 17.3 и В-27 — временная картинка портрета с подписью, только в прототипе). Данные — сборка пробы. ПРОТОТИП.
(function () {
  const О = window.ОБЩЕЕ; const { Д, esc, значок, адрес, полныйАдрес, htmlСтиха, стихиДиапазона } = О;
  const К = Д.карточкаНоя;
  let n = 0; const uid = (p) => `${p}-${++n}`;
  // порядок: семья — первой (арт С-2), затем имя и остальное
  const РАЗДЕЛЫ = [
    [8, 'Рождение'], [9, 'Жена'], [10, 'Дети'], [11, 'Братья и сёстры'], [3, 'Имя'], [5, 'Кто он'], [7, 'Род'], [13, 'Когда жил'],
    [14, 'Кого знал'], [15, 'Где бывал'], [16, 'Что ему поручено'], [17, 'Что было с ним'], [18, 'Что он говорил'], [19, 'Что сказал о нём Бог'],
    [20, 'Смерть'], [21, 'В родословии Иисуса Христа'], [22, 'Что о нём в других книгах Библии'],
  ];
  const МОЛЧАНИЕ = { 4: 'Другие имена', 12: 'Другая родня' };

  function адресКн(a) {
    const id = uid('вкл');
    const стихи = стихиДиапазона(a);
    return `<button class="адрес-кн" type="button" aria-expanded="false" aria-controls="${id}" aria-label="${esc(О.имяАдреса(a))}">${адрес(a)}${значок('раскрыть')}</button><span class="вклейка" id="${id}" hidden><q class="голос-библия т-цитата" style="display:block">${стихи.map((s) => `<span class="т-адрес не-копировать">${s.с}\u00A0</span>${htmlСтиха(s.адрес, s.текст)}`).join(' ') || '<span class="голос-мы">Мы ещё не загрузили этот стих</span>'}</q>
      <span class="ряд-действий"><button class="кн" type="button" data-копия="${esc(a)}">${значок('копировать')}Копировать стих с адресом</button><button class="кн" type="button" data-копия-адрес="${esc(a)}">${значок('ссылка')}Копировать адрес</button></span></span>`;
  }
  function пометка(c) {
    if (c !== 'inference') return '';
    if (!О.слой2()) return ` <span class="пометка">Так выходит, если сравнить места Библии</span>`;
    const id = uid('пм');
    return ` <button class="пометка-кн" type="button" aria-expanded="false" aria-controls="${id}" data-toggletip>выв.<span class="скрыто">, так выходит, если сравнить места Библии</span></button><span class="раскрытие-на-месте" id="${id}" hidden>Вывод: так выходит, если сравнить места Библии. Нарисован как сказанное, поэтому всегда со словом.</span>`;
  }
  const сЦитатами = (t) => esc(t).replace(/«([^»]+)»/g, (m, x) => `<span class="скрыто не-копировать">Библия: </span><q class="голос-библия-в-строке">«${x}»</q>`);
  function запись(f) {
    const v = f.v;
    const refs = v.refs ?? (v.ref ? [v.ref] : []) ;
    let текст = '';
    if (f.f === 'birth' || f.f === 'death') return v.facts.map((x) => `<li class="факт"><span class="т-проза">${сЦитатами(x.text)}</span> <span class="факт__адреса">${x.refs.map(адресКн).join(' ')}</span></li>`).join('');
    if (f.f === 'met') текст = `<a href="карточка.html?p=${esc(v.id.slice(2))}">${esc(Д.лица[v.id.slice(2)]?.n ?? v.id)}</a> — ${esc(v.text)}`;
    else if (f.f === 'places') текст = `${esc(v.name)}${v.note ? ` — ${сЦитатами(v.note)}` : ''}`;
    else if (f.f === 'offices') текст = esc(v.title);
    else if (f.f === 'sayings') текст = `<span class="${О.слой2() ? 'скрыто' : 'подпись-голоса'} не-копировать">Библия: </span><q class="т-цитата голос-библия">«${esc(v.quote)}»</q>${v.context ? ` <span class="т-адрес">${esc(v.context)}</span>` : ''}`;
    else текст = сЦитатами(v.text);
    if (f.f === 'met') текст = текст.replace(/^/, '');
    return `<li class="факт"><span class="т-проза">${текст}${пометка(f.c)}</span> <span class="факт__адреса">${refs.map(адресКн).join(' ')}</span></li>`;
  }
  function блок(имя, записи, открыт) {
    const id = uid('б');
    // блок до 3 строк — открыт строками, без раскрытия (решение координатора § 2)
    if (записи.length <= 3) return `<section class="блок блок--поле"><h2 class="блок__заголовок т-повествование">${esc(имя)}</h2><ul class="факты">${записи.map(запись).join('')}</ul></section>`;
    return `<section class="блок"><h2 class="блок__заголовок"><button class="блок__кнопка" type="button" aria-expanded="${открыт}" aria-controls="${id}">${esc(имя)} (${записи.length})${значок('раскрыть')}</button></h2><div class="блок__тело" id="${id}" ${открыт ? '' : 'hidden'}><ul class="факты">${записи.map(запись).join('')}</ul></div></section>`;
  }
  function отрисовать() {
    const блоки = РАЗДЕЛЫ.map(([s, имя], i) => {
      const xs = К.f.filter((f) => f.s === s);
      return xs.length ? блок(имя, xs, i === 0) : '';
    });
    // «Библия молчит» (вид 1, § 5.4): строка без кнопки; во втором слое — по скольким стихам проверено
    const молчит = Д.молчание.map((м) => `<section class="блок"><h2 class="блок__заголовок"><span class="блок__молчание"><span class="т-повествование">${МОЛЧАНИЕ[м.раздел]}:</span> <span class="т-интерфейс">в Библии не сказано${О.слой2() ? `. Проверено: ${О.число(м.прочитано.length, ['стих', 'стиха', 'стихов'])}, где он назван` : ''}</span></span></h2></section>`).join('');
    const заметкиВторого = О.слой2() ? блок('Для изучающих: заметки составителя', К.f.filter((f) => f.s === 24).map((f) => ({ ...f, v: { text: `${f.v.kind === 'interpretation' ? 'толк. — ' : f.v.kind === 'chronology' ? 'расч. — ' : 'скобки — '}${f.v.text}`, refs: f.v.refs ?? [] } })), false) : '';
    const стих = Д.стихиКарточки['Быт 6:8'];
    const меню = (id, пункты) => `<span class="меню-обёртка"><button class="кн" type="button" aria-haspopup="menu" aria-expanded="false" data-menu="${id}" aria-label="Ещё действия: Ной">${значок('действия')}Ещё действия</button><span class="меню меню--справа" role="menu" id="${id}" hidden aria-label="Ещё действия: Ной">${пункты}</span></span>`;
    const общие = `<button role="menuitem" type="button">${значок('заметка')}Заметка</button><button role="menuitem" type="button">${значок('закладка')}Закладка</button>${О.слой2() ? `<button role="menuitem" type="button" data-текст="p-noy">${значок('копировать')}Копировать номер записи</button>` : ''}`;
    const портрет = (кл) => `<figure class="портрет ${кл}"><div class="заглушка"><figcaption>Временная картинка — рисунок художника будет позже</figcaption></div></figure>`;
    const ПЕРВЫХ = 2;
    document.getElementById('главное').innerHTML = `<div class="полоса-шапки"><nav class="хлебные т-адрес" aria-label="Путь"><a href="главная.html">Главная</a>${значок('вправо')}<span aria-current="page">Ной</span></nav>
      <div class="ряд-действий" role="group" aria-label="Работа с материалом"><button class="кн на-ноутбуке" type="button" aria-expanded="false" aria-controls="кс">${значок('сослаться')}Как сослаться</button><button class="кн на-ноутбуке" type="button" data-ссылка>${значок('ссылка')}Ссылка на это место</button><button class="кн на-ноутбуке от-1280" type="button" onclick="print()">${значок('печать')}Печать</button><span class="на-ноутбуке">${меню('меню-карточки', `<button role="menuitem" type="button" class="до-1280" onclick="print()">${значок('печать')}Печать</button>${общие}`)}</span>
        <span class="слой-в-ряду">${О.переключательСлоя()}</span>${О.показТелефон()}</div></div>
      <div class="как-сослаться" id="кс" hidden><p><code>Ной // Библия наглядно : сайт. Выпуск данных проба ${esc(Д.проба.коммит)}. URL: https://…/kartochka/p-noy (дата обращения: 11.10.2026).</code></p></div>
      <div class="карточка-шапка"><div>
        <div class="шапка-истории__верх"><h1 class="т-h1" id="h1" tabindex="-1">Ной</h1><span class="на-телефоне-блок">${меню('меню-карточки-т', `<button role="menuitem" type="button" data-раскрыть="кс">${значок('сослаться')}Как сослаться</button><button role="menuitem" type="button" data-ссылка>${значок('ссылка')}Ссылка на это место</button><button role="menuitem" type="button" onclick="print()">${значок('печать')}Печать</button>${общие}`)}</span></div>
        <p class="коротко т-проза"><span class="подпись-голоса">Коротко, нашими словами. </span>${О.коротко([{ текст: 'Сын Ламеха.', стихи: ['Быт 5:28', 'Быт 5:29'] }, { текст: 'Его сыновья — Сим, Хам и Иафет.', стихи: ['Быт 5:32'] }])}</p>
        <blockquote class="писание писание--линейка стих-шапки"><span class="${О.слой2() ? 'скрыто' : 'подпись-голоса'} не-копировать">Библия: </span>«${htmlСтиха('Быт 6:8', стих)}» <span class="т-адрес">${адрес('Быт 6:8')}</span></blockquote>
        ${О.слой2() ? `<p class="т-адрес">Номер записи: p-noy <button class="кн кн--текст" type="button" data-текст="p-noy">Копировать номер</button></p>` : ''}
      </div>
      ${портрет('портрет--ноутбук')}</div>
      <div class="карточка-блоки"><div class="блоки-управление"><button class="кн кн--тихо" type="button" data-все="1">Раскрыть все</button><button class="кн кн--тихо" type="button" data-все="0">Свернуть все</button></div>
      ${блоки.filter(Boolean).slice(0, ПЕРВЫХ).join('')}${портрет('портрет--телефон')}${блоки.filter(Boolean).slice(ПЕРВЫХ).join('')}${молчит}${заметкиВторого}</div>
      <p class="т-адрес эскиз-подпись">${esc(Д.проба.плашка)}: записи карточки — черновик базы без второго ключа (сборка ${esc(Д.проба.коммит)}).</p>`;
  }
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-копия],[data-копия-адрес],[data-текст],[data-ссылка],[data-все],[data-раскрыть]');
    if (!t) return;
    if (t.dataset.раскрыть) { const ц = document.getElementById(t.dataset.раскрыть); ц.hidden = false; ц.tabIndex = -1; ц.focus(); return; }
    if (t.dataset.копия) { const { plain, html } = О.строкаКопии(t.dataset.копия, О.слой2()); await О.вБуфер(plain, html, t, адрес(t.dataset.копия)); }
    else if (t.dataset.копияАдрес) await О.вБуфер(адрес(t.dataset.копияАдрес), null, t, адрес(t.dataset.копияАдрес));
    else if (t.dataset.текст) await О.вБуфер(t.dataset.текст, null, t, t.dataset.текст);
    else if (t.dataset.ссылка !== undefined) await О.вБуфер(location.href.split('?')[0], null, t, 'ссылка на это место');
    else if (t.dataset.все) { const откр = t.dataset.все === '1'; document.querySelectorAll('.карточка-блоки .блок__кнопка').forEach((b) => { b.setAttribute('aria-expanded', String(откр)); document.getElementById(b.getAttribute('aria-controls')).hidden = !откр; }); }
  });
  document.addEventListener('слой', отрисовать);
  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('страница-чтения');
    О.оболочка({ панель: new URLSearchParams(location.search).get('panel') !== '0' });
    document.title = 'Ной — Карточка — Библия наглядно';
    document.getElementById('главное').insertAdjacentHTML('beforebegin', '');
    отрисовать();
  });
})();
