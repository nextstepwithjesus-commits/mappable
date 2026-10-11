// Экран листа: главный экран — оглавление справочника (08 § 7.3) и вопрос о возрасте при первом открытии (В-28; § 7.23).
// Лица и эпохи — сборка пробы и base/epochs.json; истории — эскиз шага 0. ПРОТОТИП.
(function () {
  const О = window.ОБЩЕЕ; const { Д, esc, значок, знакВида, адрес, адресТекст, число } = О;
  const ИСТОРИИ = ['история', 'истории', 'историй'];

  // вопрос о возрасте (В-28) — одна тихая строка с «Указать» и «Не сейчас» (Л-3)
  function блокВозраста() {
    if (О.настройки.возрастСпрошен) return '';
    return `<section class="возраст-строка т-интерфейс" aria-labelledby="возраст-з"><h2 class="т-интерфейс" id="возраст-з" style="display:inline">Сколько вам лет? <span class="ч2">Это нужно только для подсказок детям; ответ останется на этом устройстве.</span></h2>
      <button class="кн кн--текст" type="button" aria-expanded="false" aria-controls="возраст-форма" id="кн-указать">Указать</button><button class="кн кн--текст" type="button" data-пропустить>Не сейчас</button>
      <form id="возраст-форма" hidden novalidate><label for="возраст-поле">Возраст, лет</label> <input class="поле-числа" id="возраст-поле" type="number" min="1" max="120" inputmode="numeric" aria-describedby="возраст-ошибка"> <button class="кн кн--текст" type="submit">Сохранить</button> <span class="т-интерфейс" id="возраст-ошибка" tabindex="-1"></span></form></section>`;
  }
  function сЧегоНачать() {
    const xs = [...Д.каталоги.Быт.истории.filter((и) => и.сЧегоНачать), ...Д.каталоги.Мк.истории.filter((и) => и.сЧегоНачать)].slice(0, 6);
    return `<ul class="список список-начать">${xs.map((и) => `<li class="строка"><div class="строка__верх"><div class="строка__зона">
      <span class="строка__номер т-адрес">${О.кодВид(О.разобрать(и.адрес.split(';')[0]).код)}</span>
      <span class="строка__название"><a class="строка__ссылка" href="${и.id === 'e-быт-6-9' ? 'история.html' : 'каталог.html'}">${esc(и.название)}</a></span>
      <span class="строка__вид"><span class="вид">${знакВида(и.вид)}${esc(и.вид)}</span><span class="адрес-в-ярусе">${адресТекст(и.адрес, '')}</span></span>
      <span class="строка__адрес">${адресТекст(и.адрес, '')}</span></div></div></li>`).join('')}</ul>`;
  }
  function инструменты() {
    const О2 = window.ОБРАЗЫ;
    const строка = (имя, ответ, вопрос, пояснение, образ, href) => `<div class="строка-инструмента-гл"><div><h3 class="т-интерфейс"><a class="сильно" href="${href}">${имя}: ${ответ}</a></h3>${О.слой2() ? '' : `<p class="т-адрес">${вопрос}</p>`}<p class="т-интерфейс ч2">${пояснение}</p></div>${образ ? `<a class="малый-образ" href="${href}" tabindex="-1" aria-hidden="true"><span class="малый-образ__рисунок" style="width:${образ[1]}px;max-width:100%">${образ[0]}</span></a>` : ''}</div>`;
    return строка('Время', число(Д.эпохи.length, ['эпоха', 'эпохи', 'эпох']), 'Когда это было?', 'Указатель эпох от сотворения до Апостолов; годы — расчёт по модели, во втором слое.', [О2.время([], 'все эпохи — по порядку Библии'), 352], '#время')
      + строка('Генеалогия', число(Д.проба.лиц, ['лицо', 'лица', 'лиц']), 'Чья это семья?', 'Родословия по стихам: кто чей сын и дочь, жёны и союзы.', [О2.генеалогия({ верх: 'Адам', середина: 'Сиф', низ: ['Енос'] }), 172], '#генеалогия')
      + `<div class="строка-инструмента-гл"><div><h3 class="т-интерфейс сильно">География</h3><p class="голос-мы">Этот раздел мы ещё не написали.</p></div></div>`
      + `<div class="строка-инструмента-гл"><div><h3 class="т-интерфейс сильно">Связи</h3><p class="голос-мы">Этот раздел мы ещё не написали.</p></div></div>`;
  }
  function отрисовать() {
    const отметки = Object.fromEntries(Object.keys(Д.каталоги).map((к) => [к, 'полная']));
    document.getElementById('главное').innerHTML = `<div class="главная"><div class="главная__лево">
      <h1 class="скрыто" id="h1" tabindex="-1">Библия наглядно — главная</h1>
      <p class="т-проза главная__эпиграф"><span class="подпись-голоса">Библия: </span><span class="т-цитата">«${esc(Д.стихи['Быт 1:1'].replace(/\.$/, ''))}»</span> <span class="т-адрес">${адрес('Быт 1:1')}</span></p>
      <search class="главная__поиск" id="поиск"><form class="поиск" onsubmit="event.preventDefault()"><label class="поиск__подпись" for="поиск-главная">Поиск</label><span class="поиск__поле">${значок('поиск')}<input id="поиск-главная" type="search" placeholder="Стих, слово, человек, место или история"></span><button class="кн кн--найти" type="submit">Найти</button></form>
        <p class="поиск__примеры т-интерфейс"><span class="ч2">Например:</span><a href="история.html#ст6.9">Быт 6:9</a><a href="#">Давид</a><a href="#">Вефиль</a><a href="история.html">ковчег</a></p></search>
      <section aria-labelledby="книги-з"><h2 class="т-книга" id="книги-з">Книги Библии</h2>
        ${О.полосаКниг({ отметки, две: matchMedia('(max-width: 37.4375em)').matches })}
        <p class="т-адрес полоса-подпись"><span>Ветхий Завет — 39 книг</span><span>Новый Завет — 27 книг</span></p>
        <ul class="книги-с-историями">${Object.entries(Д.каталоги).map(([к, кат]) => `<li><a class="ссылка-ряд" href="каталог.html${к === 'Мк' ? '?книга=Мк' : ''}">${esc(О.КНИГИ[к].имя)}${кат.охват ? ', главы 1–3' : ''}</a> <span class="т-адрес">${число(кат.истории.length, ИСТОРИИ)}</span></li>`).join('')}<li><a class="ссылка-ряд" href="каталог.html">Все 66 книг</a></li></ul></section>
      <section aria-labelledby="начать-з"><h2 class="т-книга" id="начать-з">С чего начать</h2>${сЧегоНачать()}</section>
      ${блокВозраста()}</div>
      <div class="главная__право"><section aria-labelledby="инстр-з"><h2 class="т-книга" id="инстр-з">Инструменты</h2>${инструменты()}</section>
      <p class="ссылки-внизу т-интерфейс"><a href="каталог.html">Все истории по алфавиту</a><a href="лист.html#справка">Как читать эту страницу</a><a href="лист.html#источники">Источники и права</a></p></div>
    </div>`;
  }
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'возраст-форма') return;
    e.preventDefault();
    const v = document.getElementById('возраст-поле').value.trim();
    const n = Number(v);
    if (!v || !Number.isInteger(n) || n < 1 || n > 120) { const о = document.getElementById('возраст-ошибка'); о.textContent = 'Напишите число от 1 до 120 или нажмите «Не сейчас»'; о.focus(); return; }
    О.настройки.возраст = String(n); О.настройки.возрастСпрошен = true; О.записать(О.настройки);
    отрисовать(); document.getElementById('h1').focus(); О.объявить('Возраст сохранён на этом устройстве');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-пропустить]')) return;
    О.настройки.возрастСпрошен = true; О.записать(О.настройки); отрисовать(); document.getElementById('h1').focus(); О.объявить('Вопрос о возрасте скрыт. Изменить — в настройках');
  });
  document.addEventListener('слой', отрисовать);
  document.addEventListener('DOMContentLoaded', () => {
    О.оболочка({ панель: new URLSearchParams(location.search).get('panel') !== '0', безПоиска: true });
    document.title = 'Библия наглядно';
    отрисовать();
  });
})();
