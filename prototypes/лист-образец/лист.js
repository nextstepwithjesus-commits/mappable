// Лист-образец ред. 3 (08 ред. 3.2, § 10.1, пункты 1–17). Разделы строятся из данных сборки и токенов.
// ПРОТОТИП: в продукт не переносится.
(function () {
  const О = window.ОБЩЕЕ; const { Д, esc, значок, знакВида, адрес, адресТекст, полныйАдрес, htmlСтиха, стихиДиапазона, число } = О;
  const { З, В } = window.ЗНАКИ;
  const раздел = (id, n, имя, тело, пункт) => `<section class="раздел" id="${id}" aria-labelledby="${id}-з"><h2 class="т-h2" id="${id}-з">${n}. ${имя}</h2><p class="т-адрес раздел__пункт">08 § 10.1, п. ${пункт}</p>${тело}</section>`;
  const fmt = (k) => k.toFixed(2).replace('.', ',');

  // ---------- 1. Цвет ----------
  function цвет() {
    const токены = [...new Set(Д.контраст.map((x) => x.f).concat(Д.контраст.map((x) => x.b)))];
    const знач = {}; for (const x of Д.контраст) { (знач[x.f] ??= {})[x.тема] = x.a; (знач[x.b] ??= {})[x.тема] = x.c; }
    const худшее = (t, тема) => { const xs = Д.контраст.filter((x) => x.f === t && x.тема === тема && x.вид !== 'украшение'); if (!xs.length) return '—'; const w = xs.reduce((m, x) => (x.k < m.k ? x : m)); return `${fmt(w.k)} к «${w.b}»`; };
    const строки = токены.map((t) => `<tr><th scope="row">«${esc(t)}»</th><td><span class="плитка-мал" style="background:${знач[t].светлая ?? ''}"></span><span class="цифры">${знач[t].светлая ?? '—'}</span></td><td><span class="плитка-мал" style="background:${знач[t].тёмная ?? ''}"></span><span class="цифры">${знач[t].тёмная ?? '—'}</span></td><td class="цифры">${худшее(t, 'светлая')}</td><td class="цифры">${худшее(t, 'тёмная')}</td></tr>`).join('');
    const ниже = Д.контраст.filter((x) => !x.ок).length;
    const все = Д.контраст.map((x) => `<tr><td>${x.вид}</td><td>«${esc(x.f)}» к «${esc(x.b)}»</td><td>${x.тема}</td><td class="число цифры${x.ок ? '' : ' ниже-нормы'}">${fmt(x.k)}</td><td class="число цифры">${fmt(x.норма)}</td><td class="т-адрес">${esc(x.прим)}</td></tr>`).join('');
    return `<p class="т-проза">Все роли цвета из одного файла токенов (<code>токены.json</code>). Пар контраста — ${Д.контраст.length}; ниже нормы — <strong>${ниже}</strong>. Числа считает <code>контраст.mjs</code> по формуле WCAG 2.x.</p>
      <div class="таблица-обёртка" tabindex="0" role="region" aria-label="Токены цвета"><table class="таблица таблица-цветов таблица--полосы"><caption>Токены цвета: значение в светлой и тёмной теме и худший контраст к фону, листу или подложке (украшение не считается)</caption>
      <thead><tr><th scope="col">Токен</th><th scope="col">Светлая</th><th scope="col">Тёмная</th><th scope="col">Худшее, светлая</th><th scope="col">Худшее, тёмная</th></tr></thead><tbody>${строки}</tbody></table></div>
      <button class="кн кн--текст" type="button" aria-expanded="false" aria-controls="все-пары">${значок('раскрыть')}Показать все ${Д.контраст.length} пар</button>
      <div id="все-пары" hidden class="таблица-обёртка"><table class="таблица таблица--полосы"><caption>Все пары контраста: норма 4,5 — текст, 3 — графика, 1 — украшение (число без смысла)</caption><thead><tr><th scope="col">Вид</th><th scope="col">Пара</th><th scope="col">Тема</th><th scope="col" class="число">Контраст</th><th scope="col" class="число">Норма</th><th scope="col">Примечание</th></tr></thead><tbody>${все}</tbody></table></div>
      <h3 class="т-книга" style="margin-top:var(--otstup-24)">Правило «2 + 2» на трёх экранах</h3>
      <p class="т-проза">На каждом экране — нейтральная пара, цвет действия, «выбор» и одна смысловая система: тон Заветов в каталоге, линии Мессии в Генеалогии, категориальные цвета в сравнении лиц.</p>
      <div class="рядом-3">
        <div class="образец"><span class="образец__подпись т-адрес">Каталог: тон Заветов (только навигация)</span><a href="каталог.html">Каталог Бытия</a> <span class="т-адрес">— указатель книг, выбранная книга на тоне ВЗ</span></div>
        <div class="образец"><span class="образец__подпись т-адрес">Генеалогия: линии Мессии, вариант Г</span>${мессия()}</div>
        <div class="образец"><span class="образец__подпись т-адрес">Время: сравнение лиц, кат-1…кат-4</span>${сравнение()}</div>
      </div>`;
  }
  function мессия() {
    const Л = Д.лица;
    const лента = (d, кант, заливка) => `<path d="${d}" stroke="var(--tsvet-${кант})" stroke-width="7" fill="none"/><path d="${d}" stroke="var(--tsvet-${заливка})" stroke-width="5" fill="none"/>`;
    return `<div class="мессия"><svg viewBox="0 0 260 150" aria-hidden="true" class="мессия__линии">
      ${лента('M126 22V70', 'kant-mf', 'liniya-mf')}${лента('M134 22V70', 'kant-lk', 'liniya-lk')}
      ${лента('M126 70L60 128', 'kant-mf', 'liniya-mf')}${лента('M134 70L200 128', 'kant-lk', 'liniya-lk')}
      <rect x="122" y="10" width="16" height="16" fill="var(--tsvet-list)" stroke="currentColor" stroke-width="1.5"/>
      <rect x="122" y="62" width="16" height="16" fill="var(--tsvet-list)" stroke="currentColor" stroke-width="1.5"/>
      <rect x="52" y="122" width="16" height="16" fill="var(--tsvet-list)" stroke="currentColor" stroke-width="1.5"/>
      <rect x="192" y="122" width="16" height="16" fill="var(--tsvet-list)" stroke="currentColor" stroke-width="1.5"/></svg>
      <span class="мессия__метка" style="left:57%;top:12%">${esc(Л.iessey.n)}</span><span class="мессия__метка сильно" style="left:57%;top:47%">${esc(Л.david.n)}</span>
      <span class="мессия__метка" style="left:27%;top:87%">${esc(Л.solomon.n)}</span><span class="мессия__метка" style="left:52%;top:87%">${esc(Л['nafan-syn-davida'].n)}</span>
      <span class="мессия__линия т-адрес" style="left:6%;top:58%">Матфей</span><span class="мессия__линия т-адрес" style="left:74%;top:58%">Лука</span>
      <span class="мессия__линия т-адрес" style="left:28%;top:29%">Матфей</span><span class="мессия__линия т-адрес" style="left:57%;top:29%">Лука</span></div>
      <p class="т-адрес">По стихам: «${esc(Д.стихи['Мф 1:6'].split(';')[1].trim())}» (${адрес('Мф 1:6')}); «${esc(Д.стихи['Лк 3:31'].replace(/,$/, ''))}» (${адрес('Лк 3:31')}). Подпись „Матфей“ и „Лука“ — на каждом отрезке; данные — сборка пробы.</p>`;
  }
  function сравнение() {
    const лица = [
      ['Ной', 950, 'Быт 9:29', 'кат-1', 'tri', 'сказано'],
      ['Сим', 600, 'Быт 11:10-11', 'кат-2', 'tri-down', 'выв.: 100 + 500'],
      ['Арфаксад', 438, 'Быт 11:12-13', 'кат-3', 'pent', 'выв.: 35 + 403 (слова вне скобок)'],
      ['Евер', 464, 'Быт 11:16-17', 'кат-4', 'star', 'выв.: 34 + 430 (слова вне скобок)'],
    ];
    const знак = (ф) => ({ tri: '<path d="M6 1l5 10H1z"/>', 'tri-down': '<path d="M1 1h10L6 11z"/>', pent: '<path d="M6 1l5 3.6-1.9 6.4H2.9L1 4.6z"/>', star: '<path d="M6 0.5l1.6 3.6 3.9.4-2.9 2.6.8 3.9L6 9l-3.4 2 .8-3.9L.5 4.5l3.9-.4z"/>' })[ф];
    return `<ul class="сравнение">${лица.map(([имя, лет, ст, кат, ф, как]) => `<li><span class="сравнение__имя">${имя}</span><span class="сравнение__полоса"><span style="width:${(лет / 950) * 100}%;background:var(--tsvet-${кат.replace('кат', 'kat')})"></span></span><svg class="сравнение__знак" viewBox="0 0 12 12" aria-hidden="true" style="color:var(--tsvet-${кат.replace('кат', 'kat')})"><g fill="currentColor" stroke="var(--tsvet-chernila)" stroke-width="1">${знак(ф)}</g></svg><span class="т-адрес">${число(лет, ['год', 'года', 'лет'])}, ${адрес(ст)}; ${esc(как)}</span></li>`).join('')}</ul>
      <p class="т-адрес">Длина жизни по числам стихов, без модели лет: это не годы до Р. Х. Сумма двух чисел — вывод, поэтому со словом „выв.“.</p>`;
  }

  // ---------- 2. Шкала ----------
  const СТУПЕНИ = [
    ['т-h1', '1. Заголовок страницы', 'Ной и потоп'],
    ['т-номер-истории ч-вз', '1. Номер истории', '10'],
    ['т-h2', '2. Заголовок блока; Завет', 'Ветхий Завет'],
    ['т-номер-главы ч-вз', '2. Номер главы', '6'],
    ['т-писание', '3. Текст Писания', null],
    ['т-книга', '3. Книга в каталоге, h2 телефона', 'Бытие'],
    ['т-проза', '4. Проза приложения', 'Бог велел Ною построить ковчег. Пришёл потоп.'],
    ['т-цитата', '4. Цитата в аппарате', '«И сделал Ной всё»'],
    ['т-название', '4. Название в строке списка', 'Ной сажает виноградник'],
    ['т-интерфейс', '5. Интерфейс', 'Порядок, Фильтры, Список, Таблица'],
    ['т-повествование', '5. Повествование в каталоге', 'Иаков и Исав'],
    ['т-адрес', '6. Адрес, пометка, подпись схемы', 'Быт 6:9–22; выв.; Сим'],
  ];
  function шкала() {
    const писание = стихиДиапазона('Быт 6:9-22');
    const текст = (класс) => `<div class="писание ${класс}" lang="ru">${писание.map((s, i) => `<span class="стих">${i === 0 ? '<span class="глава-номер т-номер-главы не-копировать" aria-hidden="true">6</span>' : ''}<span class="стих__номер не-копировать">${s.с}\u00A0</span>${i === 0 ? `<span class="начало-части">Вот житие Ноя:</span>${htmlСтиха(s.адрес, s.текст).slice('Вот житие Ноя:'.length)}` : htmlСтиха(s.адрес, s.текст)}</span>`).join(' ')}</div>`;
    return `<div class="проба-шрифта"><span class="т-h1">Й Ё ё й</span><span class="т-проза">Й Ё ё й</span><span class="т-адрес" id="проба-шрифтов">проверка загрузки шрифтов…</span></div>
      <div class="шкала">${СТУПЕНИ.map(([к, имя, пример]) => `<div class="шкала-строка"><span class="т-адрес">${имя}<br><span data-замер="${к.split(' ')[0]}"></span></span><span class="${к}">${пример === null ? `«${esc(Д.стихи['Быт 6:9'])}»` : esc(пример)}</span></div>`).join('')}</div>
      <p class="т-адрес">Размеры справа под именем ступени — замер <code>getComputedStyle</code> на этой странице (при „Обычном“ размере текста: 30/36, 22/28, 18/28, 16/24, 14/20, 12/16; на телефоне h1 — 22/28).</p>
      <h3 class="т-книга">Двустрочный заголовок с «Й» и «Ё»</h3>
      <div class="рядом"><div class="образец"><p class="т-h1 узкий-h1">Ной выпускает ворона и голубя</p></div><div class="образец"><p class="т-h1 узкий-h1">Йй Ёё уу<br>уу Йй Ёё</p><span class="т-адрес">проба интерлиньяжа 30/36: «Й» и «Ё» над «у» не касаются</span></div></div>
      <h3 class="т-книга" style="margin-top:var(--otstup-24)">Быт 6:9–22: номер стиха в строке, на поле — номер главы (Л-1)</h3>
      <div class="образец" style="padding-left:calc(var(--otstup-64))"><span class="образец__подпись т-адрес">Колонка 36 em кегля Писания (648 px при 18 px); Literata 400; номер стиха — Golos 12 «чернила-2» и неразрывный пробел</span>${текст('')}</div>
      <h3 class="т-книга" style="margin-top:var(--otstup-24)">Аппарат и подписи схемы</h3>
      <div class="рядом"><div class="образец"><p class="подпись-голоса">Коротко, нашими словами</p><p class="т-проза">Бог велел Ною построить ковчег.</p><p class="т-адрес">по стихам ${адрес('Быт 6:14')}</p><p class="т-цитата голос-библия" style="margin-top:var(--otstup-8)">«И сделал Ной всё» <span class="т-адрес">${адрес('Быт 6:22')}</span></p></div>
      <div class="образец"><span class="образец__подпись т-адрес">Подписи схемы 12 px — HTML поверх линий</span>${window.ОБРАЗЫ.генеалогия({ верх: 'Ламех', середина: 'Ной', низ: ['Сим', 'Хам', 'Иафет'] }).replace(/образ-метка/g, 'образ-метка подпись-схемы')}</div></div>
      <h3 class="т-книга" style="margin-top:var(--otstup-24)">Каталог Бытия: шкала ред. 3 и ред. 3.1 рядом</h3>
      <div class="рядом">${миниКаталог('ред3', 'Редакция 3 (отменена): Завет 24, книга 20, повествование Literata 17, название 16, интерфейс 15, адрес 13')}${миниКаталог('ред31', 'Редакция 3.1 (действует): Завет 22, книга 18, повествование Golos 600 14, название 16, интерфейс 14, адрес 12')}</div>
      <h3 class="т-книга" style="margin-top:var(--otstup-24)">Три шага „Размера текста“ на 360 px</h3>
      <p class="т-интерфейс ч2">Настоящий каталог в окнах 360 × 560 при „Обычном“, „Крупнее“ и „Самом крупном“. Снимки 1280 — в папке <code>снимки/</code>.</p>
      <div class="рядом-3">${['обычный', 'крупнее', 'самый'].map((т) => `<figure class="образец"><iframe class="кадр" style="height:560px" title="Каталог при размере текста: ${т}" src="каталог.html?panel=0&text=${т}" width="360" height="560"></iframe><figcaption class="т-адрес">${{ обычный: 'Обычный — 100 %', крупнее: 'Крупнее — 112,5 %', самый: 'Самый крупный — 125 %' }[т]}</figcaption></figure>`).join('')}</div>
      <h3 class="т-книга" style="margin-top:var(--otstup-24)">Волосная линия заголовка при 1× и 2×</h3>
      <div class="волос"><span class="т-h1">Ной и потоп</span><span class="т-h1 знак-2x">Ной</span></div>
      <p class="т-адрес">Плотность 2× — отдельный снимок <code>снимки/волосная-2x.png</code>.</p>`;
  }
  function миниКаталог(вид, подпись) {
    const и = Д.каталоги.Быт.истории.slice(9, 12);
    if (вид === 'ред3') return `<div class="образец ред3 мини-каталог" data-счёт><span class="образец__подпись т-адрес">${подпись}</span><p class="завет ч-вз">Ветхий Завет</p><p class="книга">Бытие</p><p class="повеств">Ной</p>${и.map((x) => `<p><span class="инт цифры ч2">${x.номер}</span> <span class="назв">${esc(x.название)}</span> <span class="адр">${адрес(x.адрес)}</span></p>`).join('')}<p class="т-адрес" data-размеров></p></div>`;
    return `<div class="образец мини-каталог" data-счёт><span class="образец__подпись т-адрес">${подпись}</span><p class="т-h2 ч-вз">Ветхий Завет</p><p class="т-книга">Бытие</p><p class="т-повествование">Ной <span class="группа-число">2 истории</span></p>${и.map((x) => `<p><span class="т-интерфейс цифры ч2">${x.номер}</span> <span class="т-название">${esc(x.название)}</span> <span class="т-адрес">${адрес(x.адрес)}</span></p>`).join('')}<p class="т-адрес" data-размеров></p></div>`;
  }

  // ---------- 2а. Цвет действия, тёмный текст Писания, словесный знак ----------
  function действие() {
    const вар = [['нет', 'Без цвета действия'], ['киноварь', 'Киноварь #A33A1F / #F0957B — выбрана (решение координатора)']];
    const мини = `<div class="мини-шапка"><span class="знак-приложения__надпись">Библия наглядно</span></div><div class="мини-тело"><p class="т-h1" style="margin:var(--otstup-8) 0 0">Бытие</p><p class="ряд-кнопок"><span class="кн" style="background:var(--tsvet-podlozhka);box-shadow:inset 0 calc(-1 * var(--liniya-silnaya)) 0 var(--tsvet-deystvie);font-weight:600">Список</span><span class="кн">Таблица</span></p><p><a href="#" class="ссылка-наведение">Ной и потоп</a> <span class="т-адрес">ссылка при наведении</span></p><p class="ряд-кнопок"><span class="кн кн--найти">Найти</span><span class="кн кн--плотная кн--нажата-демо">Начать с 1</span></p></div>`;
    const писание = (вес, цв) => `<div class="образец" data-theme="dark"><span class="образец__подпись т-адрес">Literata ${вес}, ${цв}</span><p class="т-писание" style="font-weight:${вес};color:${цв === '#E8ECF1' ? 'var(--tsvet-chernila)' : 'var(--tsvet-chernila-pisaniya-tyomnaya-proba)'}">${esc(Д.стихи['Быт 6:9'])}</p></div>`;
    return `<div class="рядом-3">${вар.map(([v, п]) => `<div class="образец вариант-действия" data-action="${v}"><span class="образец__подпись т-адрес">${п}</span>${мини}</div>`).join('')}</div>
      <p class="т-адрес">Цвет действия — у выбранного и нажимаемого: черта под выбранным сегментом и вкладкой, текущий пункт шапки, ссылка при наведении, «Найти». Номер главы — тоном Завета. Бирюза снята: она совпадает с «чернила-НЗ».</p>
      <h3 class="т-книга" style="margin-top:var(--otstup-24)">Текст Писания в тёмной теме (08 § 8.4)</h3>
      <div class="рядом">${писание(400, '#E8ECF1')}${писание(370, '#E8ECF1')}${писание(400, '#D3D9E1')}${писание(370, '#D3D9E1')}</div>
      <h3 class="т-книга" style="margin-top:var(--otstup-24)">Словесный знак</h3>
      <div class="волос">${О.знакПриложения()}<span class="знак-2x">${О.знакПриложения()}</span></div>
      <p class="т-адрес">Знак — надпись (решение координатора по ВП-49; показывается владельцу вместе с листом): Literata 600, ступень 2 — 22 px на ноутбуке, 18 px на телефоне.</p>`;
  }

  // ---------- 3. Сетка ----------
  function сетка() {
    return `<div class="таблица-обёртка"><table class="таблица таблица--полосы"><caption>Классы окна (08 § 3.4): границы в em; пороги компонентов — запросами контейнера в rem</caption>
      <thead><tr><th scope="col">Класс</th><th scope="col">Граница</th><th scope="col" class="число">Колонок</th><th scope="col" class="число">Поля</th><th scope="col" class="число">Промежуток</th></tr></thead>
      <tbody><tr><th scope="row">узкое</th><td>меньше 37,5 em</td><td class="число">4</td><td class="число">16</td><td class="число">16</td></tr><tr><th scope="row">среднее</th><td>37,5–52,4 em</td><td class="число">8</td><td class="число">24 (32 от 768)</td><td class="число">16</td></tr><tr><th scope="row">широкое</th><td>52,5–79,9 em</td><td class="число">12</td><td class="число">32 (40 от 1024)</td><td class="число">24</td></tr><tr><th scope="row">большое</th><td>от 80 em</td><td class="число">12</td><td class="число">64</td><td class="число">24</td></tr></tbody></table></div>
      <p class="ряд-кнопок"><button class="кн" type="button" data-наложение>${значок('таблица')}Наложить 12 колонок</button> <span class="т-адрес">текущий класс окна: <strong id="класс-окна"></strong></span></p>
      <p class="т-интерфейс">Панель рядом с текстом — на <a href="история.html">странице истории</a> от 1024 px: текст — колонки 1–7, панель — 8–12. Снимки на 1024 и 1280 — <code>снимки/история-1024-*.png</code>.</p>`;
  }

  // ---------- 4. Главная, каталог, оба режима строки ----------
  function экраны() {
    const сыновья = ['noy', 'sim', 'kham', 'iafet'].map((id) => Д.лица[id]);
    const буквы = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ'.split('');
    const все = Д.лица; void все;
    return `<p class="ссылки-экранов т-интерфейс"><a href="главная.html">Главный экран — оглавление</a><a href="каталог.html">Каталог Бытия</a><a href="каталог.html?книга=Мк">Каталог Мк 1–3</a><a href="каталог.html?view=table">Каталог таблицей</a><a href="каталог.html?sort=название">Порядок по названию</a><a href="каталог.html?open=10">Раскрытие под строкой</a></p>
      <div class="рядом-3"><figure class="образец"><iframe class="кадр" style="height:560px" title="Главный экран, 360 × 560" src="главная.html?panel=0" width="360" height="560"></iframe><figcaption class="т-адрес">Главный экран, 360 × 560</figcaption></figure>
      <figure class="образец"><iframe class="кадр" style="height:560px" title="Каталог Бытия, 360 × 560" src="каталог.html?panel=0" width="360" height="560"></iframe><figcaption class="т-адрес">Каталог, 360 × 560: порог — 6 строк с плашкой пробы</figcaption></figure>
      <figure class="образец"><iframe class="кадр" style="height:560px" title="Каталог Мк 1–3, 360 × 560, касание" src="каталог.html?panel=0&книга=Мк&input=касание" width="360" height="560"></iframe><figcaption class="т-адрес">Мк 1–3, касание: строка 48</figcaption></figure></div>
      <p class="т-интерфейс">Число строк на первом экране рядом с порогом § 3.4 — в <code>README.md</code> (замер скриптом <code>снимки.mjs</code>).</p>
      <h3 class="т-книга" style="margin-top:var(--otstup-24)">Режим «выбор»: список без ссылок в строке (APG Listbox)</h3>
      <div class="рядом"><div class="образец"><span class="образец__подпись т-адрес"><span id="выбор-подпись">Семья Ноя</span>. Клавиши списка: стрелки, Enter, буква; Esc снимает выбор</span>
        <ul class="выбор-список" role="listbox" tabindex="0" aria-labelledby="выбор-подпись" id="выбор-лиц">${сыновья.map((л, i) => `<li role="option" id="оп-${л.id}" aria-selected="${i === 1}" class="${i === 2 ? 'подсвечено' : ''}"><span class="плашка-имени">${esc(л.n)}</span><span class="т-адрес">${esc(л.d ?? 'сын Ламеха')}</span>${i === 2 ? '<span class="т-адрес">подсвечен из другого инструмента — уголки</span>' : ''}</li>`).join('')}</ul></div>
        <div class="образец"><span class="образец__подпись т-адрес">Лист выбранного: действия — здесь, а не в строке</span><p class="т-книга" id="выбранный">Сим</p><p class="ряд-кнопок"><a class="кн" href="карточка.html">Открыть карточку: <span id="выбранный-имя">Сим</span></a><button class="кн" type="button">Действия</button></p>
        <ul class="список" style="margin-top:var(--otstup-12)"><li class="строка строка--текущая мини"><span class="строка__номер">10</span><span class="строка__название"><a class="строка__ссылка" href="история.html">Ной и потоп</a> <span class="т-адрес" aria-hidden="true">(вы здесь)</span></span><span></span><span></span><span></span></li></ul><span class="т-адрес">«текущий» — полоса слева и слово, без рамки</span></div></div>
      <h3 class="т-книга" style="margin-top:var(--otstup-24)">Указатель лиц по буквам (длинный список, одна цель в строке)</h3>
      <nav class="ряд-букв" aria-label="Буквы">${буквы.map((б) => (б === 'Н' || б === 'С' ? `<a href="#буква-${б}">${б}</a>` : `<span class="ч3">${б}</span>`)).join('')}</nav>
      <p class="т-адрес">На листе — две буквы из ${Д.проба.лиц}; остальные — «чернила-3» и не ссылки, как буквы без лиц.</p>
      <h4 class="т-книга" id="буква-Н" tabindex="-1">Н</h4><ul class="указатель-лиц">${['noy', 'nafan-syn-davida'].map((id) => `<li><a href="карточка.html">${esc(Д.лица[id].n)}</a> <span class="т-адрес">${esc(Д.лица[id].d ?? '')}</span></li>`).join('')}</ul>
      <h4 class="т-книга" id="буква-С" tabindex="-1">С</h4><ul class="указатель-лиц">${['sim', 'solomon'].map((id) => `<li><a href="карточка.html">${esc(Д.лица[id].n)}</a> <span class="т-адрес">${esc(Д.лица[id].d ?? '')}</span></li>`).join('')}</ul>`;
  }

  // ---------- 5. Линии и узоры ----------
  function узоры() {
    const svg = (тело, h = 24) => `<svg viewBox="0 0 160 ${h}" width="160" height="${h}" aria-hidden="true">${тело}</svg>`;
    const Р = [
      ['сплошная линия, залитый знак', 'сказано в стихе; вывод — всегда со словом', svg('<path d="M4 12H124" stroke="currentColor" stroke-width="1.5"/><circle cx="140" cy="12" r="7" fill="currentColor"/>')],
      ['точки 1,5 через 4 и знак „?“', 'толкование — и только оно', svg('<path d="M4 12H124" stroke="currentColor" stroke-width="1.5" stroke-dasharray="0 4" stroke-linecap="round"/><text x="0" y="0"></text><circle cx="64" cy="12" r="7" fill="var(--tsvet-list)" stroke="currentColor" stroke-width="1.5"/><path d="M61.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .7-1 1.3" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="63.2" y="14.6" width="1.6" height="1.6" fill="currentColor"/>')],
      ['полое: контур, полая полоса', 'твёрдо не установлено: расчёт, допущение, „вероятно“', svg('<rect x="4" y="6" width="120" height="12" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="140" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="2"/>')],
      ['малый контур 1 px', 'учёные не уверены, где это место', svg('<circle cx="20" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="1"/>')],
      ['сплошная с ярлыком', 'другое место текста, особый вид, по словам лица', svg('<path d="M4 12H156" stroke="currentColor" stroke-width="1.5"/><rect x="44" y="4" width="72" height="16" fill="var(--tsvet-list)" stroke="var(--tsvet-liniya)" stroke-width="1"/>') + '<span class="т-адрес ярлык-узора">по словам: Авраам</span>'],
      ['тонкая 1 px «чернила-2»', 'соединитель группы: „из сыновей“', svg('<path d="M4 12H124" stroke="var(--tsvet-chernila-2)" stroke-width="1"/>')],
      ['двойная черта 1 + 1, просвет 2', 'брак родственников — только это', svg('<path d="M4 10.5H124M4 13.5H124" stroke="currentColor" stroke-width="1"/>')],
      ['уголки 2 px, 6 px', 'подсветка соседа из другого инструмента', svg('<circle cx="40" cy="12" r="6" fill="currentColor"/><path d="M28 6V2h6M46 2h6v4M52 18v4h-6M34 22h-6v-4" stroke="currentColor" stroke-width="2" fill="none"/>')],
      ['кольцо 2 px с зазором 2 и жёлтая плашка', 'выбор', svg('<circle cx="40" cy="12" r="6" fill="currentColor"/><circle cx="40" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><rect x="56" y="5" width="44" height="14" fill="var(--tsvet-vybor)"/>')],
      ['рамка 3 px, зазор 2, кайма 2 «лист»', 'фокус клавиатуры', svg('<rect x="30" y="2" width="60" height="20" fill="none" stroke="currentColor" stroke-width="3"/><rect x="36" y="7" width="48" height="10" fill="var(--tsvet-podlozhka)"/>')],
      ['три кружка сплошным контуром', 'группа, народ, род', svg('<circle cx="14" cy="15" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="24" cy="15" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="19" cy="7" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/>')],
      ['прямые отрезки 2,5 px', 'порядок стоянок по тексту — не дорога', svg('<path d="M10 18L50 6L96 16L150 8" stroke="currentColor" stroke-width="2.5" fill="none"/><circle cx="10" cy="18" r="3" fill="currentColor"/><circle cx="50" cy="6" r="3" fill="currentColor"/><circle cx="96" cy="16" r="3" fill="currentColor"/><circle cx="150" cy="8" r="3" fill="currentColor"/>')],
      ['короткая отметка в полвысоты', '„упомянуто“ на полосе 66 книг', svg('<rect x="10" y="2" width="8" height="20" fill="var(--tsvet-setka)"/><rect x="20" y="2" width="8" height="20" fill="currentColor"/><rect x="30" y="2" width="8" height="20" fill="var(--tsvet-setka)"/><rect x="30" y="12" width="8" height="10" fill="currentColor"/>')],
      ['двойная косая 12 px', 'разрыв шкалы', svg('<path d="M10 20l4-16M16 20l4-16" stroke="currentColor" stroke-width="1.5"/>')],
      ['штриховка 45°, шаг 4', 'граница примерная', svg('<defs><pattern id="штрих" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V4" stroke="currentColor" stroke-width="1"/></pattern></defs><rect x="4" y="6" width="60" height="12" fill="currentColor"/><rect x="64" y="6" width="40" height="12" fill="url(#штрих)" stroke="currentColor" stroke-width="1"/>')],
    ];
    const таблица = (класс) => `<div class="узоры ${класс}">${Р.map(([ф, смысл, s]) => `<span class="т-интерфейс"><strong>${esc(ф)}</strong><br><span class="ч2">${esc(смысл)}</span></span><span class="узор-рисунок">${s}</span>`).join('')}</div>`;
    return `<div class="рядом"><div class="образец"><span class="образец__подпись т-адрес">1×</span>${таблица('')}</div><div class="образец"><span class="образец__подпись т-адрес">2× (увеличено): точки и сплошная различимы</span><div class="узоры-2x">${Р.slice(0, 3).map(([ф, , s]) => `<p class="т-адрес">${esc(ф)}</p><div class="знак-2x">${s}</div>`).join('')}</div></div></div>`;
  }

  // ---------- 6. Язык достоверности по инструментам ----------
  function достоверность() {
    const s = (тело, w = 220, h = 40) => `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${тело}</svg>`;
    return `<div class="таблица-обёртка"><table class="таблица"><caption>Узор и слово в каждом инструменте (08 § 5.1). Узор не бывает единственным носителем уровня.</caption>
      <thead><tr><th scope="col">Инструмент</th><th scope="col">Рисунок</th><th scope="col">Простой слой</th><th scope="col">Второй слой</th></tr></thead><tbody>
      <tr><th scope="row">Генеалогия: ребро по стиху</th><td>${s('<rect x="4" y="4" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M11 18V30H90" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="90" y="23" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"/>')}</td><td>без пометки: так написано в Библии</td><td>—</td></tr>
      <tr><th scope="row">Генеалогия: вывод</th><td>${s('<path d="M11 10V30H90" stroke="currentColor" stroke-width="1.5" fill="none"/>')}</td><td>Так выходит, если сравнить места Библии</td><td>выв.</td></tr>
      <tr><th scope="row">Генеалогия: толкование</th><td>${s('<path d="M11 10V30H140" stroke="currentColor" stroke-width="1.5" stroke-dasharray="0 4" stroke-linecap="round" fill="none"/><circle cx="76" cy="30" r="7" fill="var(--tsvet-list)" stroke="currentColor" stroke-width="1.5"/><path d="M73.5 27.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .7-1 1.3" stroke="currentColor" stroke-width="1.5" fill="none"/>')}</td><td>Так понимают некоторые люди</td><td>толк. и авторы</td></tr>
      <tr><th scope="row">Время: полоса жизни</th><td>${s('<rect x="40" y="12" width="120" height="14" fill="currentColor"/><rect x="10" y="12" width="30" height="14" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="160" y="12" width="30" height="14" fill="none" stroke="currentColor" stroke-width="1.5"/>')}</td><td>Сколько лет назад это было, Библия не говорит. Мы посчитали примерно</td><td>расч.: модель</td></tr>
      <tr><th scope="row">География: место</th><td>${s('<circle cx="20" cy="20" r="7" fill="currentColor"/><circle cx="70" cy="20" r="6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="120" cy="20" r="4.5" fill="none" stroke="currentColor" stroke-width="1"/>')}<span class="т-адрес">слева направо: учёные согласны, вероятно, предположительно</span></td><td>Это место названо в Библии. Где оно на карте, думают учёные</td><td>положение — справочно: источник; степень</td></tr>
      <tr><th scope="row">География: путь</th><td>${s('<path d="M10 30L60 10L120 26L200 12" stroke="currentColor" stroke-width="2.5" fill="none"/>')}</td><td>Дорогу Библия не называет</td><td>то же</td></tr>
      <tr><th scope="row">Полоса 66 книг</th><td>${О.полосаКниг({ отметки: { Быт: 'полная', Евр: 'упом', Ис: 'упом', Мф: 'упом', Лк: 'упом', '1Пет': 'упом', '2Пет': 'упом' } })}</td><td>рассказано — полная отметка; упомянуто — короткая</td><td>то же; число мест — в двойнике</td></tr>
      </tbody></table></div><p class="т-адрес">Полоса — по данным «Ной и потоп»: рассказано в Бытии; вспоминают Ис, Мф, Лк, Евр, 1 Пет, 2 Пет (эскиз шага 0).</p>`;
  }

  // ---------- 7. 16 состояний ----------
  function состояния() {
    const ПОДЛОЖКИ = [['лист', 'фон-лист'], ['фон', 'фон-фон'], ['подложка', 'фон-подложка'], ['тон ВЗ', 'фон-тон-вз'], ['тон НЗ', 'фон-тон-нз'], ['выбранная область', 'фон-выбор-область'], ['жёлтая плашка', 'фон-выбор']];
    // настоящие кнопки; «фокус» — класс .как-фокус, который в основа.css стоит в одном правиле с :focus-visible
    const эл = (вид, сост) => {
      const выбр = сост.includes('выбран');
      const фок = сост.includes('фокус');
      const кл = `${выбр ? ' выбран' : ''}${фок ? ' как-фокус' : ''}`;
      if (вид === 'залитый' || вид === 'полый') return `<button type="button" tabindex="-1" class="эл-цель${кл}" aria-label="Знак: ${вид}, ${сост}"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="7" ${вид === 'залитый' ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2"'}/>${выбр ? '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>' : ''}</svg></button>`;
      if (вид === 'плотная') return `<button type="button" tabindex="-1" class="эл-кн эл-кн--плотная${кл}">Начать</button>`;
      return `<button type="button" tabindex="-1" class="эл-кн эл-кн--нажата${кл}" aria-pressed="true">Нажато</button>`;
    };
    const СОСТ = ['нет', 'выбран', 'фокус', 'выбран и фокус'];
    const ВИДЫ = [['залитый', 'залитый знак'], ['полый', 'полый знак'], ['плотная', 'плотная кнопка'], ['нажатая', 'нажатая кнопка']];
    const сетка = (тема) => `<div class="образец" data-theme="${тема}"><span class="образец__подпись т-адрес">${тема === 'dark' ? 'Тёмная' : 'Светлая'} тема. Столбцы: нет, выбран, фокус, выбран и фокус</span>${ВИДЫ.map(([в, имя]) => `<p class="т-адрес" style="margin-top:var(--otstup-8)">${имя}</p>${ПОДЛОЖКИ.map(([п, к]) => `<div class="подложка-ряд ${к}"><span class="т-адрес">${п}</span>${СОСТ.map((с) => `<span class="состояние-элемент">${эл(в, с)}</span>`).join('')}</div>`).join('')}`).join('')}</div>`;
    return `<p class="т-проза">4 вида элемента × 4 состояния на 7 подложках, на настоящих кнопках. Фокус — то же правило CSS, что у <code>:focus-visible</code>: прямоугольная рамка 3 px по краю цели, зазор и кайма «лист». Выбор — кольцо 2 px по форме знака (у знака) или черта цветом действия и рамка внутрь (у кнопки): рамка фокуса им не занята.</p>
      <div class="рядом">${сетка('light')}${сетка('dark')}</div>
      <h3 class="т-книга" style="margin-top:var(--otstup-24)">Все 16 при 400 %</h3>
      <div class="таблица-обёртка увеличение-обёртка" tabindex="0" role="region" aria-label="16 состояний при 400 %"><div class="увеличено-400">${ВИДЫ.map(([в]) => `<div class="подложка-ряд фон-лист" style="grid-template-columns:repeat(4,max-content);column-gap:var(--otstup-12)">${СОСТ.map((с) => `<span class="состояние-элемент">${эл(в, с)}</span>`).join('')}</div>`).join('')}</div></div>
      <p class="т-адрес">Снимки раздела в оттенках серого с размытием — <code>снимки/состояния-серый-*.png</code>; в режиме высокой контрастности (эмуляция Chromium) — <code>снимки/состояния-forced-*.png</code>.</p>`;
  }

  // ---------- 8. Знаки и значки ----------
  function знаки() {
    return `<h3 class="т-книга">Знаки вида истории — 16 px, всегда со словом</h3><p class="знаки-ряд">${Object.keys(В).map((в) => `<span class="т-интерфейс">${знакВида(в)}${в}</span>`).join('')}</p>
      <h3 class="т-книга" style="margin-top:var(--otstup-16)">Знаки лиц до пробы Т1 (вариант «д»): только на схемах, со словом отношения</h3>
      <p class="знаки-ряд"><span class="т-интерфейс"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>Сим, сын Ноя</span><span class="т-интерфейс"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>жена Ноя</span><span class="т-интерфейс"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5L14.5 8L8 14.5L1.5 8Z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>пол не указан</span><span class="т-интерфейс"><svg width="20" height="16" viewBox="0 0 20 16" aria-hidden="true"><circle cx="5" cy="11" r="3.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="15" cy="11" r="3.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="4.5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>сыновья Ноя — группа</span></p>
      <p class="т-адрес">На страницах чтения знака лица нет (вариант «д»); значка-заглушки аватара нет нигде.</p>
      <h3 class="т-книга" style="margin-top:var(--otstup-16)">Значки интерфейса — свой набор: сетка 24, линия 2, прямые концы</h3>
      <p class="знаки-ряд">${Object.keys(З).map((к) => `<span class="т-интерфейс">${значок(к)}${к}</span>`).join('')}</p>
      <p class="голос-мы">Сравнения с Lucide рядом нет: набора Lucide на диске нет, а скачивать его для листа мы не стали.</p>`;
  }

  // ---------- 9. «Нет сведений» и состояния ----------
  function нетСведений() {
    const молч = Д.молчание.find((м) => м.раздел === 4);
    return `<div class="таблица-обёртка"><table class="таблица"><caption>Пять видов «нет сведений» (08 § 5.4): различаются словами, голосом и местом, а не цветом</caption><thead><tr><th scope="col">Вид</th><th scope="col">Как на экране (простой слой)</th><th scope="col">Откуда на листе</th></tr></thead><tbody>
      <tr><th scope="row">1. Библия молчит</th><td><span class="т-повествование">Другие имена:</span> в Библии не сказано</td><td class="т-адрес">карточка Ноя, сборка пробы: молчание проверено по ${молч.прочитано.length} стихам</td></tr>
      <tr><th scope="row">2. Библия говорит об отсутствии</th><td><span class="подпись-голоса">Библия говорит: </span><span class="т-цитата голос-библия">«без отца, без матери, без родословия»</span> <span class="т-адрес">${адрес('Евр 7:3')}</span></td><td class="т-адрес">формула § 4.4</td></tr>
      <tr><th scope="row">3. Место названо, где — неизвестно</th><td>Где было это место, учёные не знают</td><td class="т-адрес">формула § 4.4; мест в базе ещё нет</td></tr>
      <tr><th scope="row">4. Мы ещё не знаем</th><td><span class="голос-мы">Этот раздел мы ещё не написали.</span></td><td class="т-адрес">Связи и География на главной</td></tr>
      <tr><th scope="row">5. Не относится</th><td>раздела просто нет; по ссылке — «Такого раздела у карточек ангелов нет»</td><td class="т-адрес">—</td></tr></tbody></table></div>
      <h3 class="т-книга" style="margin-top:var(--otstup-24)">Состояния § 7.11</h3>
      <div class="рядом-3">
        <div class="образец"><span class="образец__подпись т-адрес">загрузка — место занято, без анимации</span><div class="загрузка-место" style="height:var(--otstup-64)" aria-busy="true"></div></div>
        <div class="образец"><span class="образец__подпись т-адрес">ошибка страницы</span><p class="ошибка-заголовок">Не получилось открыть эту страницу</p><button class="кн кн--плотная" type="button">Повторить: Ной и потоп</button></div>
        <div class="образец"><span class="образец__подпись т-адрес">ошибка части</span><p class="т-проза">Не получилось открыть. <button class="кн кн--текст" type="button">Повторить: карточка Давида</button></p></div>
        <div class="образец"><span class="образец__подпись т-адрес">без сети</span><p class="т-проза">Нет интернета. Рисунок появится, когда интернет вернётся</p></div>
        <div class="образец"><span class="образец__подпись т-адрес">пусто (фильтр)</span><p class="т-проза ч2">По этим фильтрам историй нет. <button class="кн кн--текст" type="button">Сбросить фильтры</button></p></div>
        <div class="образец"><span class="образец__подпись т-адрес">неполно</span><p class="голос-мы">Пока здесь истории только из глав 1–3</p></div>
        <div class="образец"><span class="образец__подпись т-адрес">старая ссылка</span><p class="т-книга">Такой страницы у нас нет</p><a href="история.html">Ной и потоп</a></div>
        <div class="образец"><span class="образец__подпись т-адрес">нет места на устройстве</span><p class="т-проза">На телефоне мало места для карты. Карта будет открываться, когда есть интернет</p></div>
        <div class="образец ход"><span class="образец__подпись т-адрес">ход загрузки § 7.19</span><p class="т-интерфейс">Загружаем карту: 12 из 25 МБ</p><progress max="25" value="12" aria-label="Загружаем карту">48 %</progress><button class="кн кн--текст" type="button">Отменить загрузку</button></div>
      </div>
      <h3 class="т-книга" style="margin-top:var(--otstup-24)">Поиск § 7.2</h3>
      <div class="рядом">
        <div class="образец"><span class="образец__подпись т-адрес">подсказки (APG Combobox), до 8 строк по группам</span><div class="поиск"><span class="поиск__поле">${значок('поиск')}<input type="search" value="Ной" aria-label="Поиск, пример" role="combobox" aria-expanded="true" aria-controls="подсказки-пример" aria-activedescendant="пд-1"></span></div>
          <div class="подсказки" role="listbox" id="подсказки-пример" aria-label="Подсказки"><p class="подсказки__группа т-адрес">Истории</p><div role="option" id="пд-1" aria-selected="true"><span>Ной и потоп</span><span class="т-адрес">${адрес('Быт 6:9-9:17')}</span></div><div role="option" aria-selected="false"><span>Ной сажает виноградник</span><span class="т-адрес">${адрес('Быт 9:18-29')}</span></div><p class="подсказки__группа т-адрес">Люди</p><div role="option" aria-selected="false"><span>Ной</span><span class="т-адрес">сын Ламеха</span></div></div></div>
        <div class="образец"><span class="образец__подпись т-адрес">индекс грузится; нет результатов; «Возможно, вы искали»; без сети</span><p class="т-интерфейс">Поиск будет готов через секунду</p><p class="т-проза ч2">Мы не нашли «Голиад». Проверьте написание или ищите по адресу: «1 Цар 17».</p><p class="т-интерфейс">Возможно, вы искали: <a href="#">Голиаф</a></p><p class="т-интерфейс">Нет интернета. Поиск появится, когда интернет вернётся</p></div>
      </div>
      <h3 class="т-книга" style="margin-top:var(--otstup-24)">Вклейка стиха § 7.6</h3>
      <div class="рядом-3"><div class="образец"><span class="образец__подпись т-адрес">загрузка (после 1 с)</span><p class="т-интерфейс">Загружаем стих</p></div><div class="образец"><span class="образец__подпись т-адрес">без сети</span><p class="т-интерфейс">Нет интернета. Стих появится, когда интернет вернётся</p></div><div class="образец"><span class="образец__подпись т-адрес">ошибка</span><p class="т-интерфейс">Не получилось открыть стих. <button class="кн кн--текст" type="button">Повторить: ${адрес('Быт 6:9')}</button></p></div></div>`;
  }

  // ---------- 10. Матрица компонентов и синопсис ----------
  function матрица() {
    const ячейка = (html) => `<td>${html}</td>`;
    const строка = (имя, покой, фокус, нажато) => `<tr><th scope="row">${имя}</th>${ячейка(покой)}${ячейка(фокус)}${ячейка(нажато)}</tr>`;
    const таблица = (тема) => `<div class="образец" data-theme="${тема}"><div class="таблица-обёртка"><table class="таблица матрица"><caption>${тема === 'dark' ? 'Тёмная' : 'Светлая'} тема: компонент × состояние</caption><thead><tr><th scope="col">Компонент</th><th scope="col">покой</th><th scope="col">фокус</th><th scope="col">нажато, выбрано, наведение</th></tr></thead><tbody>
      ${строка('текстовая кнопка', '<span class="кн кн--текст">Показать ещё 6</span>', '<span class="кн кн--текст эл-фокус-кн">Показать ещё 6</span>', '<span class="кн кн--текст" style="background:var(--tsvet-podlozhka);border-color:var(--tsvet-chernila)">Показать ещё 6</span>')}
      ${строка('плотная кнопка', '<span class="кн кн--плотная">Начать с 1</span>', '<span class="кн кн--плотная эл-фокус-кн">Начать с 1</span>', '<span class="кн кн--плотная" style="box-shadow:inset 0 0 0 var(--liniya-silnaya) var(--tsvet-deystvie)">Начать с 1</span>')}
      ${строка('кнопка инструмента', `<span class="кн-инструмента">${значок('генеалогия')}<span class="кн-инструмента__имя">Генеалогия: 3 поколения</span><span class="кн-инструмента__вопрос">Чья это семья?</span></span>`, `<span class="кн-инструмента эл-фокус-кн">${значок('генеалогия')}<span class="кн-инструмента__имя">Генеалогия</span></span>`, '—')}
      ${строка('переключатель слоя', '<span class="слой__группа"><button type="button" tabindex="-1" aria-pressed="true">Для начинающих</button><button type="button" tabindex="-1" aria-pressed="false">Для изучающих</button></span>', '<span class="слой__группа"><button type="button" tabindex="-1" class="эл-фокус-кн" aria-pressed="false">Для изучающих</button></span>', '—')}
      ${строка('вкладки', '<span class="вкладки" style="display:inline-flex"><span class="вкладка-вид">Марк</span></span>', '<span class="вкладка-вид эл-фокус-кн">Лука</span>', '<span class="вкладка-вид вкладка-вид--выбр">Матфей</span>')}
      ${строка('адрес-кнопка', `<span class="адрес-кн">${адрес('Быт 6:22')}${значок('раскрыть')}</span>`, `<span class="адрес-кн эл-фокус-кн">${адрес('Быт 6:22')}${значок('раскрыть')}</span>`, `<span class="адрес-кн адрес-кн--откр">${адрес('Быт 6:22')}${значок('раскрыть')}</span>`)}
      ${строка('слово словаря', '<span class="слово-словаря">ковчег</span>', '<span class="слово-словаря эл-фокус-кн">ковчег</span>', '<span class="слово-словаря">ковчег</span> <span class="т-адрес">раскрыто</span>')}
      ${строка('радио', '<span class="радио"><label><input type="radio" tabindex="-1" name="м-' + тема + '"> Обычный</label></span>', '<span class="радио"><label><input type="radio" tabindex="-1" class="эл-фокус-кн" name="м2-' + тема + '"> Крупнее</label></span>', '<span class="радио"><label><input type="radio" tabindex="-1" checked name="м3-' + тема + '"> Самый крупный</label></span>')}
      ${строка('переключатель: нажато и фокус', '<span class="слой__группа"><button type="button" tabindex="-1" aria-pressed="true">Для начинающих</button></span>', '<span class="слой__группа"><button type="button" tabindex="-1" aria-pressed="true" class="как-фокус">Для начинающих</button></span>', '<span class="т-адрес">цель: 32 на мыши, 44 на касании</span>')}
      ${строка('строка списка', '<span class="т-название">Ной и потоп</span>', '<span class="т-название как-фокус" style="outline-offset:calc(-1 * var(--liniya-fokus));box-shadow:none;padding:var(--otstup-4)">Ной и потоп</span>', '<span class="т-название" style="border-left:var(--otstup-4) solid var(--tsvet-chernila);padding-left:var(--otstup-8)">Ной и потоп</span> <span class="т-адрес">(вы здесь)</span>')}
      ${строка('блок с числом', '<span class="т-повествование">Стихи (23) ⌄</span>', '<span class="т-повествование как-фокус">Стихи (23)</span>', '<span class="т-повествование">Стихи (23) — раскрыт</span>')}
      ${строка('наведение', '<span class="кн">Таблица</span>', '—', '<span class="кн" style="color:var(--tsvet-deystvie)">Таблица</span> <span class="т-адрес">наведение</span>')}
      ${строка('ссылка', '<a href="#" tabindex="-1">Ной и потоп</a>', '<a href="#" tabindex="-1" class="эл-фокус-кн">Ной и потоп</a>', '<a href="#" tabindex="-1" style="text-decoration-thickness:var(--liniya-silnaya);color:var(--tsvet-deystvie)">наведение</a>')}
      </tbody></table></div></div>`;
    const р = Д.расслабленный;
    const К3 = ['Мф', 'Мк', 'Лк'];
    const сцены = р.сцены.filter((с) => К3.every((к) => /^\d+:\d+(–\d+)?$/.test(с[к]))).slice(0, 3);
    const текст = (к, a) => { const [г, ст] = a.split(':'); const [с1, с2] = ст.split('–'); return стихиДиапазона(`${к} ${г}:${с1}${с2 ? `-${с2}` : ''}`).map((x) => О.показ(x.текст)).join(' '); };
    // сравнение по всем словам в нормализованной форме (строчные, ё → е, без знаков); выравнивание — наибольшая общая
    // подпоследовательность с каждым другим рассказом; отмечено то, чего нет хотя бы в одном другом рассказе — различия (Л-5)
    const норм = (w) => w.toLowerCase().replace(/ё/g, 'е').replace(/[^а-я0-9]/g, '');
    const слова = (t) => t.split(/(\s+)/);
    function общие(a, b) {
      const A = a.map(норм), B = b.map(норм); const n = A.length, m = B.length;
      const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) d[i][j] = A[i] && A[i] === B[j] ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
      const out = new Set(); let i = 0, j = 0;
      while (i < n && j < m) { if (A[i] && A[i] === B[j]) { out.add(i); i++; j++; } else if (d[i + 1][j] >= d[i][j + 1]) i++; else j++; }
      return out;
    }
    const ячейкаС = (сц, к) => {
      const свои = слова(текст(к, сц[к])).filter((x) => !/^\s+$/.test(x));
      const другие = К3.filter((x) => x !== к).map((x) => слова(текст(x, сц[x])).filter((y) => !/^\s+$/.test(y)));
      const с = другие.map((д) => общие(свои, д));
      return свои.map((w, i) => (норм(w) && !с.every((set) => set.has(i)) ? `<mark class="различие">${esc(w)}</mark>` : esc(w))).join(' ');
    };
    const синопсис = `<div class="синопсис-обёртка"><p class="т-интерфейс">Расслабленного спускают через кровлю: три рассказа по сценам (разметка сцен — эскиз шага 0). <span class="ч2">Подложкой отмечены слова, которых нет хотя бы в одном другом рассказе сцены (второй слой).</span></p>
      <div class="вкладки синопсис-вкладки" role="tablist" aria-label="Рассказы">${К3.map((к, i) => `<button role="tab" type="button" id="вк-${к}" data-вкладка="${к}" aria-selected="${i === 1}" tabindex="${i === 1 ? 0 : -1}">${esc(р.рассказы[i].строка.replace('Евангелие от ', ''))}</button>`).join('')}</div>
      <table class="синопсис"><caption class="скрыто">Три рассказа по сценам</caption><thead><tr>${р.рассказы.map((x, i) => `<th scope="col" class="кол-${К3[i]}">${esc(x.строка)} <span class="т-адрес">${адрес(x.стихи)}</span></th>`).join('')}</tr></thead><tbody>
      ${сцены.map((сц) => `<tr><th colspan="3" scope="colgroup" class="сцена">Сцена: ${esc(сц.сцена)}</th></tr><tr>${К3.map((к) => `<td class="кол-${к}"><span class="т-адрес">${адрес(`${к} ${сц[к].replace('–', '-')}`)}</span><br>${ячейкаС(сц, к)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    return `<p class="т-проза">Матрица — ключевые компоненты в обеих темах. Остальные оси (ширина, способ ввода, плотность, слой) — переключатели вверху и снимки; полный каталог компонентов по 08 § 10.1 делается в коде продукта.</p>
      <div class="стопка">${таблица("light")}${таблица("dark")}</div>
      <h3 class="т-книга" style="margin-top:var(--otstup-24)">Меню, диалог, подсказка</h3>
      <div class="рядом-3"><div class="образец"><span class="меню-обёртка"><button class="кн" type="button" aria-haspopup="menu" aria-expanded="false" data-menu="меню-пример">${значок('действия')}Действия: Иаков</button><span class="меню" role="menu" id="меню-пример" hidden aria-label="Действия: Иаков"><button role="menuitem" type="button">${значок('ссылка')}Ссылка на это место</button><button role="menuitem" type="button">${значок('сослаться')}Как сослаться</button><button role="menuitem" type="button">${значок('заметка')}Заметка</button></span></span></div>
        <div class="образец"><button class="кн кн--текст" type="button" data-диалог>Открыть диалог: Кого заменить?</button><dialog class="диалог" id="диалог-пример" aria-labelledby="диалог-з"><button class="кн кн--значок диалог__закрыть" type="button" data-закрыть aria-label="Закрыть">${значок('закрыть')}</button><h2 class="т-книга" id="диалог-з" tabindex="-1">Кого заменить?</h2><p class="т-проза">В сравнении уже четыре человека. Кого убрать, чтобы добавить Евера?</p><p class="ряд-кнопок" style="margin-top:var(--otstup-16)"><button class="кн кн--плотная" type="button" data-закрыть>Убрать Арфаксада</button><button class="кн кн--текст" type="button" data-закрыть>Отменить</button></p></dialog></div>
        <div class="образец"><div class="подсказка т-интерфейс">Сим, сын Ноя. ${адрес('Быт 5:32')}</div><span class="т-адрес">подсказка: без тени и без стрелки</span></div></div>
      <h3 class="т-книга" style="margin-top:var(--otstup-24)">Синопсис § 7.29</h3>${синопсис}`;
  }

  // ---------- 11. Голоса и скобки ----------
  function голоса() {
    const стих = (a) => `<p class="писание писание--линейка" data-стих="${esc(a)}"><span class="т-адрес">${адрес(a)}</span> ${htmlСтиха(a, Д.стихи[a])}</p>`;
    return `<div class="таблица-обёртка"><table class="таблица"><caption>Голоса оформления (08 § 4.1): формула, форма и разметка</caption><thead><tr><th scope="col">Голос</th><th scope="col">Пример</th></tr></thead><tbody>
      <tr><th scope="row">Слова Библии</th><td><span class="подпись-голоса">Библия: </span><span class="т-цитата голос-библия">«И сделал Ной всё»</span> <span class="т-адрес">${адрес('Быт 6:22')}</span></td></tr>
      <tr><th scope="row">Утверждение приложения со стихом</th><td><span class="подпись-голоса">Коротко, нашими словами</span><br><span class="т-проза">Пришёл потоп.</span> <span class="т-адрес">по стиху ${адрес('Быт 7:6')}</span></td></tr>
      <tr><th scope="row">Заголовок приложения</th><td><span class="т-книга">Ной входит в ковчег</span> <span class="т-адрес" data-layer2>название атласа</span></td></tr>
      <tr><th scope="row">Проза приложения</th><td class="т-проза">Отмечены книги, где истории уже есть.</td></tr>
      <tr><th scope="row">«Мы о нашей работе»</th><td class="голос-мы">Мы ещё не проверили, что Библия говорит о его родителях.</td></tr>
      <tr><th scope="row">Расчёт</th><td class="т-адрес">Сколько лет назад это было, Библия не говорит. Мы посчитали примерно</td></tr>
      <tr><th scope="row">Справочно</th><td class="т-интерфейс">Так считают учёные, в Библии этого нет</td></tr>
      <tr><th scope="row">По словам лица</th><td class="т-интерфейс">Так сказал Авраам <span class="т-адрес">(второй слой — „по словам: Авраам“)</span></td></tr>
      <tr><th scope="row">Заметка читателя</th><td><aside class="заметка" aria-label="Моя заметка к Быт 6:9"><span class="заметка__метка">Моя заметка</span>Сравнить с Евр 11:7.</aside></td></tr></tbody></table></div>
      <h3 class="т-книга" style="margin-top:var(--otstup-24)">Скобки: Быт 6:16 и 8:7</h3>
      ${стих('Быт 6:16')}${стих('Быт 8:7')}
      <p class="т-интерфейс">Знаки скобок видны; цвет тот же. Метки «в скобках:» и «конец скобок» — сгенерированным содержимым с альтернативным текстом, их не видно и они не копируются. Вид по <code>brackets.tsv</code>: ${['Быт 6:16', 'Быт 8:7'].map((a) => `${адрес(a)} — ${(Д.скобки[a] ?? []).map((s) => s.вид).join(', ')}`).join('; ')}.</p>
      <p class="ряд-кнопок"><button class="кн" type="button" data-проверка-копии>Проверить копию выделения</button> <span class="т-интерфейс" id="итог-копии"></span></p>
      <p class="голос-мы">Остановки VoiceOver на iPhone на листе не проверены: нужен телефон и человек. Это ручной набор § 6.4.</p>`;
  }

  // ---------- 12. Работа с материалом ----------
  function материал() {
    const дефекты = Д.дефекты.map((д) => {
      const a = `${д.книга} ${д.глава}:${д.с}`;
      const t = Д.стихи[a];
      const ПРАВИЛО = { empty: 'кнопки нет; строка «В электронном тексте стих пуст. Его слова стоят в конце Пс 114:8»', merge: 'копия как показ; под ней пометка «В электронном тексте в этот стих вошли слова стиха 9»', 'open-bracket': 'скобка как в показе; пометка во втором слое', 'span-bracket': `у стиха внутри чужой скобки — скобки как в показе; пометка «Стих внутри скобки, начатой в ${д.книга} ${д.глава}:${д.с}»`, 'bracket-shape': 'как в показе; пометка во втором слое' };
      return `<tr><td>${адрес(a + (д.по !== д.с ? `-${д.по}` : ''))}</td><td>${д.вид}</td><td class="т-цитата">${t === undefined ? '<span class="голос-мы">не загружен</span>' : t === '' ? '<span class="голос-мы">(пусто)</span>' : esc(О.показ(t).slice(0, 90)) + (t.length > 90 ? '…' : '')}</td><td class="т-адрес">${esc(ПРАВИЛО[д.вид])}</td></tr>`;
    }).join('');
    return `<div class="рядом">
      <div class="образец"><span class="образец__подпись т-адрес">Копировать стих с адресом</span><p class="писание писание--линейка">${htmlСтиха('Быт 6:9', Д.стихи['Быт 6:9'])}</p>
        <p class="ряд-действий"><button class="кн" type="button" data-копия="Быт 6:9">${значок('копировать')}Копировать стих с адресом</button><button class="кн" type="button" data-копия="Быт 6:9-10" data-номера>${значок('копировать')}Копировать Быт 6:9–10</button></p>
        <p class="т-адрес">Что легло в буфер:</p><pre class="т-адрес копия-итог" id="копия-итог"></pre></div>
      <div class="образец"><span class="образец__подпись т-адрес">Ссылка, «Как сослаться», выгрузка, печать</span><p class="ряд-действий"><button class="кн" type="button" data-ссылка>${значок('ссылка')}Ссылка на это место</button><button class="кн" type="button" data-csv>${значок('выгрузить')}${О.слой2() ? 'Таблица для Excel (CSV)' : 'Сохранить таблицу в файл'}</button><button class="кн" type="button" data-svg>${значок('выгрузить')}${О.слой2() ? 'Рисунок (SVG)' : 'Сохранить рисунок в файл'}</button><button class="кн" type="button" onclick="print()">${значок('печать')}Печать</button></p>
        <p class="т-адрес">«Как сослаться» по ГОСТ — на <a href="история.html">странице истории</a> под заголовком. CSV — каталог Бытия: «;», UTF-8 с BOM, столбцы уровня, OSIS-адреса и источника. SVG — родословие Ноя с подписями текстом, title и desc.</p>
        <p class="т-интерфейс" style="margin-top:var(--otstup-8)">Номер записи: p-noy <button class="кн кн--текст" type="button" data-текст="p-noy">Копировать номер</button></p></div></div>
      <div class="таблица-обёртка" style="margin-top:var(--otstup-16)"><table class="таблица таблица--полосы"><caption>Дефекты электронного текста — все ${Д.дефекты.length} строк <code>source-issues.tsv</code> и что делает копия (08 § 16.2)</caption><thead><tr><th scope="col">Адрес</th><th scope="col">Вид</th><th scope="col">Показ</th><th scope="col">Копия</th></tr></thead><tbody>${дефекты}</tbody></table></div>
      <p class="т-адрес">Тест «копия = показанный текст + адрес» прогоняет <code>снимки.mjs</code> для Быт 6:9–22 и для каждой строки таблицы, где стих не пуст.</p>`;
  }

  // ---------- 13–17 ----------
  function движение() {
    return `<div class="таблица-обёртка"><table class="таблица"><caption>Токены движения (08 § 3.7). „Без движения“ — всё мгновенно; запись видео на листе не сделана</caption><thead><tr><th scope="col">Токен</th><th scope="col">Значение</th><th scope="col">Где на листе</th></tr></thead><tbody>
      <tr><th scope="row">раскрытие</th><td class="цифры">200 мс</td><td>значок «Подробнее», блоки справки, вклейка</td></tr><tr><th scope="row">затухание</th><td class="цифры">150 мс</td><td>—</td></tr><tr><th scope="row">общий элемент</th><td class="цифры">280 мс</td><td>не показан: переходов View Transitions на листе нет</td></tr></tbody></table></div>
      <p class="ряд-кнопок"><button class="кн" type="button" data-движение="без" aria-pressed="${О.настройки.движение === 'без'}">Без движения</button><button class="кн" type="button" data-движение="система" aria-pressed="${О.настройки.движение !== 'без'}">Как в системе</button></p>`;
  }
  function проверкиЗрения() {
    return `<p class="ряд-кнопок"><button class="кн" type="button" data-зрение="gray">Оттенки серого с размытием</button><button class="кн" type="button" data-зрение="протанопия">Протанопия</button><button class="кн" type="button" data-зрение="дейтеранопия">Дейтеранопия</button><button class="кн" type="button" data-зрение="">Обычно</button></p>
      <p class="т-интерфейс">Режим высокой контрастности — снимки <code>снимки/*-forced-*.png</code> (эмуляция <code>forced-colors: active</code> в Chromium; Windows на листе не проверен).</p>
      <svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="сим-протанопия"><feColorMatrix type="matrix" values="0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0"/></filter><filter id="сим-дейтеранопия"><feColorMatrix type="matrix" values="0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0"/></filter></svg>`;
  }
  function простой() {
    const Т = [
      ['Так написано в Библии', 'над текстом истории', 'история.html'], ['Библия: «…»', 'цитата вне блока текста: строка лица, эпиграф', 'главная.html'], ['Так выходит, если сравнить места Библии', 'вывод в карточке Ноя', 'карточка.html'],
      ['Как её звали, в Библии не сказано', 'жена Ноя на странице истории', 'история.html'], ['Этот раздел мы ещё не написали', 'Связи, География', 'главная.html'], ['Пока здесь истории только из глав 1–3', 'каталог Мк', 'каталог.html?книга=Мк'],
      ['83 истории, по порядку Библии', 'строка действий каталога', 'каталог.html'], ['Генеалогия: 3 поколения / Чья это семья?', 'малый образ на странице истории', 'история.html'], ['Показать: Для начинающих / Для изучающих', 'переключатель слоя', 'каталог.html'],
      ['Что значат слова: ковчег, локоть', 'под частью 1 (пояснения — черновик шага 0, их проверяют педагог и библеист)', 'история.html?open=1'], ['Трудная история: здесь есть смерть', 'строка каталога, шапка истории', 'каталог.html'], ['Все истории по алфавиту', 'шапка', 'каталог.html'],
    ];
    return `<div class="таблица-обёртка"><table class="таблица таблица--полосы"><caption>Строки таблицы § 4.4 на своих местах</caption><thead><tr><th scope="col">Строка</th><th scope="col">Где</th></tr></thead><tbody>${Т.map(([с, г, h]) => `<tr><td>${esc(с)}</td><td><a href="${h}">${esc(г)}</a></td></tr>`).join('')}</tbody></table></div>
      <h3 class="т-книга" style="margin-top:var(--otstup-24)">Тихая строка трудного в трёх местах</h3>
      <div class="рядом-3"><div class="образец"><span class="образец__подпись т-адрес">строка каталога</span><span class="т-название">Ной и потоп</span><span class="строка__трудное">Трудная история: здесь есть смерть</span></div><div class="образец"><span class="образец__подпись т-адрес">шапка истории</span><p class="т-h1" style="font-size:var(--tekst-kniga-size)">Ной и потоп</p><p class="тихая-строка">Трудная история: здесь есть смерть${О.детскиеПодсказки() ? '. Прочтите сначала сами' : ''}</p></div><div class="образец"><span class="образец__подпись т-адрес">раздел Карточки</span><p class="т-повествование">Что было с ним</p><p class="тихая-строка">Трудное место: здесь говорится о наготе</p></div></div>
      <p class="т-адрес">При возрасте младше 13 (В-28) в конце строки истории — «Прочтите сначала сами»: <a href="история.html?age=9">та же страница с возрастом 9</a>.</p>
      <h3 class="т-книга" id="справка" tabindex="-1" style="margin-top:var(--otstup-24)">Как читать эту страницу</h3>
      <dl class="справка-лист т-проза"><dt>Библия: и черта слева</dt><dd>Это слова Библии.</dd><dt>Коротко, нашими словами</dt><dd>Это написали мы, люди, которые сделали это приложение.</dd><dt>Мы ещё не…</dt><dd>Работа ещё идёт.</dd><dt>Быт 6:9</dt><dd>Книга Бытие, глава 6, стих 9.</dd><dt>Размер текста</dt><dd>Крупнее — в <a href="настройки.html">Настройках</a>.</dd></dl>
      <p class="ряд-кнопок"><button class="кн" type="button" data-слушать>${значок('слушать')}Слушать</button><span class="т-адрес">голос устройства без сети; если голоса нет — кнопка в продукте не показывается</span></p>`;
  }
  function образцы() {
    const пары = [['Страница истории', 'netbible-1440.png', 'NET Bible'], ['Каталог', 'theographic-browse-1440.png', 'Theographic'], ['Карточка', 'wikipedia-ru-noy-1440.png', 'Википедия, «Ной»'], ['Главная, поиск', 'stepbible-search-1440.png', 'STEPBible'], ['Блок с числом', 'perseus-1440.png', 'Perseus']];
    return `<p class="т-проза">Рядом с каждым экраном — библейский образец R14 того же вида (снимки лежат локально в <code>prototypes/R14-снимки/</code> и в git не входят). Образцов отделки (Stripe Docs, Linear, Our World in Data) на диске нет — их снимает арт-директор.</p>
      <div class="образец-r14">${пары.map(([э, f, имя]) => `<figure><img src="../R14-снимки/${f}" alt="Образец: ${имя}, ${э.toLowerCase()}" onerror="this.replaceWith(Object.assign(document.createElement('p'),{className:'голос-мы',textContent:'Снимка ${имя} нет на этом компьютере'}))"><figcaption class="т-адрес">${э}: ${имя} — устройство. Образец отделки — нет снимка</figcaption></figure>`).join('')}</div>`;
  }
  function знакПриложения() {
    const в = [['надпись', 'Надпись'], ['полоса', 'Надпись и полоса 66 книг'], ['полка', 'Надпись и «полка» из 66 корешков: высота — число глав']];
    return `<div class="варианты-знака">${в.map(([k, п]) => `<div class="образец"><span class="образец__подпись т-адрес">${п}</span>${О.знакПриложения(k)}<span class="знак-2x">${О.знакПриложения(k)}</span><div data-theme="dark" style="background:var(--tsvet-list);padding:var(--otstup-8)">${О.знакПриложения(k)}</div></div>`).join('')}</div>
      <p class="т-адрес">Высота корешка — число глав книги по <code>synodal.tsv</code> (Псалтирь — 150). Вопрос ВП-49 решает владелец по прототипу.</p>`;
  }

  function отрисовать() {
    const м = document.getElementById('главное');
    м.classList.add('лист');
    м.innerHTML = `<header style="padding-top:var(--otstup-24)"><h1 class="т-h1" id="h1" tabindex="-1">Лист-образец редакции 3</h1>
      <p class="т-проза">По 08 ред. 3.2 (В-27; поправки В-28, В-29). Прототип для команды и рецензентов: владельцу как облик не показывается, проверки § 10.3 ещё не было. ${esc(Д.проба.плашка)}.</p>
      <nav class="ссылки-экранов т-интерфейс" aria-label="Разделы листа" style="margin-top:var(--otstup-8)">${[['цвет', 'Цвет'], ['шкала', 'Шкала'], ['действие', 'Цвет действия'], ['сетка', 'Сетка'], ['экраны', 'Экраны и строки'], ['узоры', 'Узоры'], ['достоверность', 'Достоверность'], ['состояния', '16 состояний'], ['знаки', 'Знаки'], ['нет', 'Нет сведений'], ['матрица', 'Компоненты'], ['голоса', 'Голоса'], ['материал', 'Работа с материалом'], ['движение', 'Движение'], ['зрение', 'Зрение'], ['простой', 'Простой слой'], ['образцы', 'Образцы'], ['знак', 'Знак приложения']].map(([id, т]) => `<a href="#${id}">${т}</a>`).join('')}</nav></header>
      ${раздел('цвет', 1, 'Токены цвета и контраст', цвет(), '1')}
      ${раздел('шкала', 2, 'Шкала кеглей на настоящем тексте', шкала(), '2')}
      ${раздел('действие', '2а', 'Цвет действия, тёмный текст Писания, словесный знак', действие(), '2а')}
      ${раздел('сетка', 3, 'Сетка по классам окна', сетка(), '3')}
      ${раздел('экраны', 4, 'Главный экран, каталог, два режима строки', экраны(), '4')}
      ${раздел('узоры', 5, 'Линии и узоры при 1× и 2×', узоры(), '5')}
      ${раздел('достоверность', 6, 'Язык достоверности в каждом инструменте', достоверность(), '6')}
      ${раздел('состояния', 7, '16 состояний фокуса и выбора', состояния(), '7')}
      ${раздел('знаки', 8, 'Знаки и значки', знаки(), '8')}
      ${раздел('нет', 9, '«Нет сведений» и состояния', нетСведений(), '9')}
      ${раздел('матрица', 10, 'Компоненты и синопсис', матрица(), '10')}
      ${раздел('голоса', 11, 'Голоса и скобки', голоса(), '11')}
      ${раздел('материал', 12, 'Работа с материалом', материал(), '12')}
      ${раздел('движение', 13, 'Движение', движение(), '13')}
      ${раздел('зрение', 14, 'Оттенки серого, цветовая слепота, высокая контрастность', проверкиЗрения(), '14')}
      ${раздел('простой', 15, 'Простой слой', простой(), '15')}
      ${раздел('образцы', 16, 'Образцы рядом с экранами', образцы(), '16')}
      ${раздел('знак', 17, 'Три варианта знака приложения (ВП-49)', знакПриложения(), '17')}
      <section class="раздел" id="источники"><h2 class="т-h2">Источники и права</h2><p class="т-проза">Синодальный перевод (1876); электронный текст: scrollmapper/bible_databases; нумерация Синодального издания. В электронном тексте нет буквы «ё», вместо тире стоит дефис с пробелами. Шрифты Literata и Golos Text — SIL OFL 1.1. Лица и карточка — сборка пробы ${esc(Д.проба.коммит)} (${esc(Д.проба.уровень)}).</p></section>`;
    м.querySelectorAll('.таблица-обёртка:not([tabindex])').forEach((о, i) => { о.tabIndex = 0; о.setAttribute('role', 'region'); о.setAttribute('aria-label', о.querySelector('caption')?.textContent.slice(0, 80) ?? `Таблица ${i + 1}`); });
    замерить();
  }
  function замерить() {
    document.querySelectorAll('[data-замер]').forEach((s) => {
      const el = document.querySelector(`.шкала .${s.dataset.замер}`) ?? s.closest('.шкала-строка').lastElementChild;
      const cs = getComputedStyle(s.closest('.шкала-строка').lastElementChild);
      s.textContent = `${parseFloat(cs.fontSize)}/${parseFloat(cs.lineHeight)}, ${cs.fontWeight}`;
      void el;
    });
    document.querySelectorAll('[data-счёт]').forEach((б) => {
      const узлы = [...б.querySelectorAll('p, p > span')].filter((x) => !x.closest('[data-размеров]') && !x.classList.contains('образец__подпись') && [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
      const список = [...new Set(узлы.map((x) => parseFloat(getComputedStyle(x).fontSize)))].sort((a, b) => b - a);
      б.querySelector('[data-размеров]').textContent = `Различимых размеров: ${список.length} — ${список.join(', ')} px; соседние ближе 2 px: ${список.slice(1).filter((v, i) => список[i] - v < 2).length}`;
    });
    const к = innerWidth < 600 ? 'узкое' : innerWidth < 840 ? 'среднее' : innerWidth < 1280 ? 'широкое' : 'большое';
    const кл = document.getElementById('класс-окна'); if (кл) кл.textContent = `${к} (${innerWidth} px)`;
    document.fonts.ready.then(() => {
      const ок = document.fonts.check('600 30px Literata', 'ЙЁ') && document.fonts.check('450 14px "Golos Text"', 'ЙЁ');
      const s = document.getElementById('проба-шрифтов'); if (s) s.textContent = ок ? 'шрифты Literata и Golos Text загружены' : 'шрифт не загружен — снимок недействителен';
      document.documentElement.dataset.fontsOk = String(ок);
    });
  }

  // ---------- поведение листа ----------
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-копия],[data-текст],[data-ссылка],[data-csv],[data-svg],[data-наложение],[data-зрение],[data-движение],[data-проверка-копии],[data-диалог],[data-закрыть],[data-слушать]');
    if (!t) return;
    if (t.dataset.копия) { const { plain, html } = О.строкаКопии(t.dataset.копия, t.hasAttribute('data-номера')); await О.вБуфер(plain, html, t, адрес(t.dataset.копия)); document.getElementById('копия-итог').textContent = plain; }
    else if (t.dataset.текст) await О.вБуфер(t.dataset.текст, null, t, t.dataset.текст);
    else if (t.dataset.ссылка !== undefined) await О.вБуфер(location.href.split('#')[0].split('?')[0] + '#материал', null, t, 'ссылка на это место');
    else if (t.dataset.csv !== undefined) скачать(csv(), 'библия-наглядно_каталог_бытие.csv', 'text/csv', 'таблица, 83 строки');
    else if (t.dataset.svg !== undefined) скачать(svg(), 'библия-наглядно_генеалогия_ной.svg', 'image/svg+xml', 'рисунок');
    else if (t.dataset.наложение !== undefined) { document.documentElement.toggleAttribute('data-grid'); t.setAttribute('aria-pressed', String(document.documentElement.hasAttribute('data-grid'))); }
    else if (t.dataset.зрение !== undefined) { const r = document.documentElement; r.removeAttribute('data-gray'); r.removeAttribute('data-sim'); if (t.dataset.зрение === 'gray') r.setAttribute('data-gray', '1'); else if (t.dataset.зрение) r.setAttribute('data-sim', t.dataset.зрение); }
    else if (t.dataset.движение) { О.настройки.движение = t.dataset.движение; О.записать(О.настройки); О.применить(); document.querySelectorAll('[data-движение]').forEach((b) => b.setAttribute('aria-pressed', String(b === t))); }
    else if (t.dataset.проверкаКопии !== undefined) проверитьКопию();
    else if (t.dataset.диалог !== undefined) { const д = document.getElementById('диалог-пример'); д.showModal(); д.querySelector('h2').focus(); д.addEventListener('close', () => t.focus(), { once: true }); }
    else if (t.dataset.закрыть !== undefined) t.closest('dialog').close();
    else if (t.dataset.слушать !== undefined) { const г = speechSynthesis?.getVoices?.().filter((v) => v.lang.startsWith('ru') && v.localService) ?? []; О.объявить(г.length ? 'Читаем вслух' : 'Голоса для чтения вслух на этом устройстве нет'); if (г.length) { const u = new SpeechSynthesisUtterance('Как читать эту страницу'); u.voice = г[0]; speechSynthesis.speak(u); } }
  });
  function проверитьКопию() {
    const итог = [];
    for (const p of document.querySelectorAll('[data-стих]')) {
      const a = p.dataset.стих;
      const r = document.createRange(); const текстУзлы = [...p.childNodes].slice(2); r.setStartBefore(текстУзлы[0]); r.setEndAfter(текстУзлы.at(-1));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      const копия = sel.toString().trim();
      const ожид = О.показ(Д.стихи[a]);
      итог.push(`${адрес(a)}: ${копия === ожид ? 'копия совпала с показанным текстом' : `РАЗНИЦА: «${копия}»`}`);
      sel.removeAllRanges();
    }
    document.getElementById('итог-копии').textContent = итог.join('; ');
    О.объявить(итог.join('; '));
    window.__итогКопии = итог;
  }
  function скачать(тело, имя, тип, что) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([тело], { type: тип })); a.download = имя; a.click(); О.объявить(`Сохранено: ${что}`);
    window.__последняяВыгрузка = тело;
  }
  function csv() {
    const OSIS = { Быт: 'Gen', Мк: 'Mark' };
    const q = (x) => `"${String(x).replace(/"/g, '""')}"`;
    const строки = Д.каталоги.Быт.истории.map((и) => { const p = О.разобрать(и.адрес); return [и.номер, и.название, и.вид, адрес(и.адрес).replace(/ /g, ' '), `${OSIS[p.код]}.${p.г}.${p.с}-${OSIS[p.код]}.${p.г2}.${p.с2}`, и.стихов, 'эскиз: разметка одного составителя', 'Синодальный перевод; scrollmapper/bible_databases'].map(q).join(';'); });
    return '﻿' + ['№;название;вид;адрес;адрес OSIS;стихов;уровень;источник', ...строки].join('\r\n');
  }
  function svg() {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260" lang="ru"><title>Родословие Ноя: Ламех, Ной, Сим, Хам, Иафет</title><desc>По стихам Быт 5:28–29; 5:32. Выпуск: проба ${Д.проба.коммит}. Как сослаться: Библия наглядно : сайт.</desc>
<g font-family="Literata, serif" font-size="14" text-anchor="middle" fill="#18202C"><path d="M200 40V90M200 120V150M100 150H300M100 150V190M200 150V190M300 150V190" stroke="#6E7888" stroke-width="1.5" fill="none"/><text x="200" y="34">Ламех</text><text x="200" y="110">Ной</text><text x="100" y="210">Сим</text><text x="200" y="210">Хам</text><text x="300" y="210">Иафет</text></g>
<text x="10" y="250" font-family="Golos Text, sans-serif" font-size="11" fill="#4A5463">Библия наглядно — Генеалогия: Ной. Синодальный перевод. Данные не проверены: проба.</text></svg>`;
  }
  document.addEventListener('DOMContentLoaded', () => {
    О.оболочка({ панель: new URLSearchParams(location.search).get('panel') !== '0' });
    document.title = 'Лист-образец ред. 3 — Библия наглядно';
    отрисовать();
    const выбор = document.getElementById('выбор-лиц');
    if (выбор) выбор.addEventListener('keydown', (e) => { if (e.key === 'Escape') { document.getElementById('выбранный').textContent = 'Ничего не выбрано'; document.getElementById('выбранный-имя').textContent = '—'; } });
    if (выбор) О.списокВыбор(выбор, (o) => { const имя = o.querySelector('.плашка-имени').textContent; document.getElementById('выбранный').textContent = имя; document.getElementById('выбранный-имя').textContent = имя; О.объявить(`Выбрано: ${имя}`); });
  });
  // вкладки синопсиса (APG Tabs, активация стрелками)
  function выбратьВкладку(b) {
    const об = b.closest('.синопсис-обёртка');
    об.querySelectorAll('[role="tab"]').forEach((x) => { const да = x === b; x.setAttribute('aria-selected', String(да)); x.tabIndex = да ? 0 : -1; });
    об.dataset.вкладка = b.dataset.вкладка; b.focus();
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('.синопсис-вкладки [role="tab"]'); if (b) выбратьВкладку(b); });
  document.addEventListener('keydown', (e) => {
    const b = e.target.closest?.('.синопсис-вкладки [role="tab"]'); if (!b) return;
    const все = [...b.parentElement.children]; const i = все.indexOf(b);
    if (e.key === 'ArrowRight') { e.preventDefault(); выбратьВкладку(все[(i + 1) % все.length]); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); выбратьВкладку(все[(i - 1 + все.length) % все.length]); }
  });
  document.addEventListener('слой', отрисовать);
  addEventListener('resize', () => { const кл = document.getElementById('класс-окна'); if (кл) кл.textContent = `${innerWidth} px`; });
  void полныйАдрес; void адресТекст;
})();
