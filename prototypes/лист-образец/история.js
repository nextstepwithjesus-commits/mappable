// Экран листа: страница истории «Ной и потоп» (08 § 3.3.4; § 7.4–7.6, § 7.28, § 16; 11 § 4.1). Ред. 3.1 листа:
// номер стиха — в строке, на поле — номер главы (Л-1); колонка 36 em от кегля Писания (Л-2); рисунок — отдельный вариант
// `?рисунок=1`, 16 : 9, не выше 300 px, на телефоне — после первой части (Л-4); у каждого факта «Коротко» — свой стих,
// числа блоков — из выведенных строк (Л-10); второй слой — все части открыты; переключатель слоя в ряду действий. ПРОТОТИП.
(function () {
  const О = window.ОБЩЕЕ; const { Д, esc, значок, знакВида, адрес, полныйАдрес, адресТекст, htmlСтиха, стихиДиапазона, число } = О;
  const Н = Д.ной;
  const ИСТ = Д.каталоги.Быт.истории.find((и) => и.id === 'e-быт-6-9');
  const q = new URLSearchParams(location.search);
  const сРисунком = q.get('рисунок') === '1';
  const ТРУДНЫЕ = new Set(ИСТ.трудная.flatMap((т) => т.стихи.flatMap((a) => стихиДиапазона(a).map((s) => s.адрес))));
  let счётчик = 0;
  const uid = (p) => `${p}-${++счётчик}`;
  const библия = (html, блок = false) => (блок
    ? `<blockquote class="голос-библия т-цитата"><span class="${О.слой2() ? 'скрыто не-копировать' : 'подпись-голоса не-копировать'}">Библия: </span>${html}</blockquote>`
    : `<span class="${О.слой2() ? 'скрыто не-копировать' : 'подпись-голоса не-копировать'}">Библия: </span><q class="т-цитата голос-библия">${html}</q>`);
  window.ОБЪЯВЛЕНИЕ_СЛОЯ = (второй) => (второй ? 'Показаны все части, подробный пересказ и блок «Для изучающих»' : 'Показано для начинающих: открыта первая часть');

  // адрес-кнопка с вклейкой стиха ± 2 стиха (08 § 7.6); имя — через aria-label, в копию не попадает
  function адресКн(a, вокруг = true) {
    const id = uid('вкл');
    return `<button class="адрес-кн" type="button" aria-expanded="false" aria-controls="${id}" aria-label="${esc(О.имяАдреса(a))}">${адрес(a)}${значок('раскрыть')}</button><div class="вклейка" id="${id}" hidden>${вклейка(a, вокруг)}</div>`;
  }
  function вклейка(a, вокруг) {
    const p = О.разобрать(a);
    const свои = стихиДиапазона(a);
    let около = свои;
    if (вокруг && свои.length === 1) {
      около = [-2, -1, 0, 1, 2].map((d) => `${p.код} ${p.г}:${p.с + d}`).map((k) => ({ адрес: k, текст: Д.стихи[k] ?? Д.стихиКарточки[k], с: +k.split(':')[1] })).filter((x) => x.текст);
    }
    const свой = new Set(свои.map((s) => s.адрес));
    return `<blockquote class="голос-библия т-цитата">${около.map((s) => `<p${свой.has(s.адрес) ? ' class="вклейка__свой"' : ''}><span class="т-адрес не-копировать">${s.с} </span>${htmlСтиха(s.адрес, s.текст)}</p>`).join('')}</blockquote>
      <div class="ряд-действий"><button class="кн" type="button" data-копия="${esc(a)}">${значок('копировать')}Копировать стих с адресом</button><button class="кн" type="button" data-копия-адрес="${esc(a)}">${значок('ссылка')}Копировать адрес</button><button class="кн" type="button" data-заметка="${esc(a)}">${значок('заметка')}Заметка</button><button class="кн" type="button" data-закладка="${esc(a)}" aria-pressed="false">${значок('закладка')}Закладка</button></div>`;
  }

  function шапкаИстории() {
    const т = `Трудная история: здесь есть смерть${О.детскиеПодсказки() ? '. Прочтите сначала сами' : ''}`;
    // С10 (интерфейс): третья фраза простого слоя — по примеру 11 § 4.1, слова — как в Быт 7:22–23
    const коротко = О.слой2() ? Н.о_чём.второй_слой : [...Н.о_чём.простой_слой.slice(0, 2), { текст: 'Всё живое на суше умерло.', стихи: ['Быт 7:22'] }, { текст: 'Остался только Ной и все, кто был с ним в ковчеге.', стихи: ['Быт 7:23'] }];
    const естьГолос = О.голоса().length > 0;
    return `<div class="полоса-шапки"><nav class="хлебные т-адрес" aria-label="Путь"><a href="каталог.html">Ветхий Завет</a>${значок('вправо')}<a href="каталог.html">Бытие</a>${значок('вправо')}<span aria-current="page">Ной</span></nav>
      <div class="ряд-действий" role="group" aria-label="Работа с материалом">
        <button class="кн на-ноутбуке" type="button" aria-expanded="false" aria-controls="как-сослаться">${значок('сослаться')}Как сослаться</button>
        <button class="кн на-ноутбуке" type="button" data-ссылка>${значок('ссылка')}Ссылка на это место</button>
        <button class="кн на-ноутбуке от-1280" type="button" onclick="print()">${значок('печать')}Печать</button>
        <span class="меню-обёртка на-ноутбуке"><button class="кн" type="button" aria-haspopup="menu" aria-expanded="false" data-menu="меню-истории" aria-label="Ещё действия: Ной и потоп">${значок('действия')}Ещё действия</button>
          <div class="меню меню--справа" role="menu" id="меню-истории" hidden aria-label="Ещё действия: Ной и потоп">
            <button role="menuitem" type="button" class="до-1280" onclick="print()">${значок('печать')}Печать</button>
            <button role="menuitem" type="button" data-заметка="Быт 6:9-9:17">${значок('заметка')}Заметка к истории</button>
            <button role="menuitem" type="button" data-закладка="Быт 6:9-9:17">${значок('закладка')}Закладка</button>
            ${естьГолос ? `<button role="menuitem" type="button" data-слушать>${значок('слушать')}Слушать</button>` : ''}
            ${О.слой2() ? `<button role="menuitem" type="button" data-текст="e-быт-6-9">${значок('копировать')}Копировать номер записи</button>` : ''}
          </div></span>
        <span class="слушать-место" id="слушать-место"></span>
        <span class="слой-в-ряду">${О.переключательСлоя()}</span>
        ${О.показТелефон()}
      </div></div>
    <!--ШАПКА--><div class="как-сослаться" id="как-сослаться" hidden>${какСослаться()}</div>
    <header class="шапка-истории">
      <div class="шапка-истории__верх"><h1 class="т-h1" id="h1" tabindex="-1">Ной и потоп</h1>
      <span class="меню-обёртка на-телефоне-блок"><button class="кн" type="button" aria-haspopup="menu" aria-expanded="false" data-menu="меню-истории-т" aria-label="Ещё действия: Ной и потоп">${значок('действия')}Ещё действия</button>
        <div class="меню меню--справа" role="menu" id="меню-истории-т" hidden aria-label="Ещё действия: Ной и потоп">
          <button role="menuitem" type="button" data-раскрыть="как-сослаться">${значок('сослаться')}Как сослаться</button>
          <button role="menuitem" type="button" data-ссылка>${значок('ссылка')}Ссылка на это место</button>
          <button role="menuitem" type="button" onclick="print()">${значок('печать')}Печать</button>
          <button role="menuitem" type="button" data-заметка="Быт 6:9-9:17">${значок('заметка')}Заметка к истории</button>
          <button role="menuitem" type="button" data-закладка="Быт 6:9-9:17">${значок('закладка')}Закладка</button>
          ${естьГолос ? `<button role="menuitem" type="button" data-слушать>${значок('слушать')}Слушать</button>` : ''}
        </div></span></div>
      <p class="шапка-истории__вид т-адрес"><span class="номер-истории ч3">История ${ИСТ.номер}</span><span class="вид">${знакВида('событие')}событие</span><span>${О.слой2() ? адресТекст('Быт 6:9-9:17', '') : `<span class="полный-адрес">${esc(полныйАдрес('Быт 6:9-9:17'))}</span><span class="краткий-адрес">${адресТекст('Быт 6:9-9:17', '')}</span>`}</span><span class="тихая-строка">${esc(т)}</span></p>
      <p class="коротко т-проза"><span class="подпись-голоса">Коротко, нашими словами. </span>${О.коротко(коротко.slice(0, 1))}${коротко.length > 1 ? ` <button class="кн кн--текст кн-дальше" type="button" aria-expanded="false" aria-controls="коротко-дальше">дальше<span class="скрыто">: коротко, нашими словами</span></button><span id="коротко-дальше" hidden> ${О.коротко(коротко.slice(1))}</span>` : ''}</p>
    </header>`;
  }
  function какСослаться() {
    const дата = '11.10.2026', выпуск = `проба ${Д.проба.коммит}`, url = 'https://…/istoriya/e-byt-6-9';
    const сноска = `Ной и потоп // Библия наглядно : сайт. Выпуск данных ${выпуск}. URL: ${url} (дата обращения: ${дата}).`;
    const список = `Ной и потоп. – Текст : электронный // Библия наглядно : сайт. – Выпуск данных ${выпуск}. – URL: ${url} (дата обращения: ${дата}).`;
    return `<p class="т-адрес">Для ссылки в тексте или сноске (ГОСТ Р 7.0.108-2022)</p><p><code>${esc(сноска)}</code></p><button class="кн кн--текст" type="button" data-текст="${esc(сноска)}">${значок('копировать')}Копировать ссылку для сноски</button>
      <p class="т-адрес">Для списка литературы (ГОСТ Р 7.0.100-2018)</p><p><code>${esc(список)}</code></p><button class="кн кн--текст" type="button" data-текст="${esc(список)}">${значок('копировать')}Копировать запись для списка литературы</button>
      <p class="т-адрес">Адрес на сайте — эскиз: адресов продукта ещё нет; выпуск данных — проба.</p>`;
  }

  // текст части: номер главы на поле, номер стиха в строке, начало части насыщенностью 600; слово словаря — при первом появлении
  const СЛОВАРЬ = Object.fromEntries((Н.история.пояснения ?? []).map((п) => [п.слово, п.текст]));
  function часть(ч, открыта) {
    const стихи = стихиДиапазона(ч.стихи);
    const id = `часть-${ч.n}`;
    const трудная = стихи.some((s) => ТРУДНЫЕ.has(s.адрес));
    const отмечено = new Set();
    let прежняяГлава = null;
    const html = стихи.map((s, i) => {
      let t = htmlСтиха(s.адрес, s.текст);
      if (i === 0) {
        const слова = s.текст.split(/\s+/); const до = [];
        for (const w of слова) { до.push(w); if (/[,;:.!?]$/.test(w) || до.length >= 5) break; }
        const нач = esc(до.join(' '));
        if (t.startsWith(нач)) t = `<span class="начало-части">${нач}</span>${t.slice(нач.length)}`;
      }
      let сл = '';
      for (const [w, ключ] of [['ковчег', 'ковчег'], ['локтей', 'локоть']]) {
        if (отмечено.has(ключ) || !new RegExp(`(^|[\\s(])${w}(?=[\\s,.;:])`, 'u').test(t)) continue;
        отмечено.add(ключ);
        const sid = `сл-${ч.n}-${ключ}`;
        // слово остаётся текстом (копируется во всех браузерах); кнопка раскрытия лежит поверх без своего текста (Л-д2)
        t = t.replace(new RegExp(`(^|[\\s(])${w}(?=[\\s,.;:])`, 'u'), (m, a) => `${a}<span class="слово-обёртка"><span class="слово-словаря-текст" aria-hidden="true">${w}</span><button class="слово-словаря-кн" type="button" aria-expanded="false" aria-controls="${sid}" aria-label="${w}, что значит это слово" data-toggletip></button></span>`);
        сл += `<span class="раскрытие-на-месте" id="${sid}" hidden>${esc(СЛОВАРЬ[ключ] ?? '')}. <span class="ч2">Это пояснение, а не слова Библии.</span></span>`;
      }
      const новаяГлава = s.г !== прежняяГлава;
      const глава = новаяГлава ? `<span class="глава-номер т-номер-главы не-копировать" aria-hidden="true">${s.г}</span><span class="скрыто не-копировать">Глава ${s.г}. </span>` : '';
      прежняяГлава = s.г;
      return `<span class="стих" id="ст${s.г}.${s.с}">${глава}<span class="стих__номер не-копировать">${новаяГлава ? `<span class="глава-в-строке" aria-hidden="true">${s.г}:</span>` : ''}${s.с} </span>${t} ${сл}</span>`;
    }).join(' ');
    return `<section class="часть" aria-labelledby="${id}-з" id="${id}">
      <h3 class="часть__заголовок" id="${id}-з"><button class="часть__кнопка" type="button" aria-expanded="${открыта}" aria-controls="${id}-т">${значок('раскрыть')}<span class="часть__текст">Часть ${ч.n}. ${esc(ч.название)} <span class="т-адрес">${адресТекст(ч.стихи, '')}</span>${трудная ? ' <span class="т-адрес">трудное: здесь есть смерть</span>' : ''}</span></button></h3>
      <div id="${id}-т" ${открыта ? '' : 'hidden'}>
        <div class="писание" lang="ru">${html}</div>
        ${ч.n === 1 && !О.слой2() ? `<p class="что-значат т-интерфейс"><span>Что значат слова:</span><button class="слово-словаря" type="button" aria-expanded="false" aria-controls="чз-1" data-toggletip>ковчег</button><button class="слово-словаря" type="button" aria-expanded="false" aria-controls="чз-2" data-toggletip>локоть</button></p><span class="раскрытие-на-месте" id="чз-1" hidden>${esc(СЛОВАРЬ.ковчег)}. <span class="ч2">Это пояснение, а не слова Библии.</span></span><span class="раскрытие-на-месте" id="чз-2" hidden>${esc(СЛОВАРЬ.локоть)}. <span class="ч2">Это пояснение, а не слова Библии.</span></span>` : ''}
        ${ч.n === 1 && О.детскиеПодсказки() ? `<p class="т-интерфейс ч2">Найдите вместе: ${esc(Н.история.найдите_вместе[0].вопрос)} <span class="т-адрес">(ответ — ${адрес(Н.история.найдите_вместе[0].стих)})</span></p>` : ''}
      </div>
      ${ч.n === 1 && сРисунком ? '<figure class="заглушка рисунок-телефон"><figcaption>Временная картинка — рисунка художника ещё нет</figcaption></figure>' : ''}
    </section>`;
  }

  // строки лиц: каждое лицо — строка (§ 7.4); число блока — число строк
  function лица() {
    const к = Н.кто.карточки;
    const строка = (имя, ссылка, роль, подпись) => `<li class="строка-лица"><span class="строка-лица__имя">${ссылка ? `<a href="${ссылка}">${esc(имя)}</a>` : esc(имя)}</span><span class="строка-лица__роль">${роль}</span>${подпись ? `<span class="т-адрес">${подпись}</span>` : ''}</li>`;
    const цит = (ц, ст) => `${библия(`«${esc(ц)}»`)} ${адресКн(ст)}`;
    const сыновья = к[1].лица.map((л) => строка(л.имя, `карточка.html?p=${л.id.slice(2)}`, `<span class="т-интерфейс">сын Ноя</span> ${адресКн('Быт 5:32', false)}`));
    const строки = [
      строка('Ной', 'карточка.html', цит(к[0].цитата, к[0].стих)),
      ...сыновья,
      строка('жена Ноя', null, `<span class="т-интерфейс">Как её звали, в Библии не сказано.</span> ${цит(к[2].цитата, к[2].стих)}`, 'Эту карточку мы ещё не написали'),
      строка('жёны сыновей Ноя', null, `<span class="т-интерфейс">Как их звали, в Библии не сказано.</span> ${цит(к[3].цитата, к[3].стих)}`),
      строка('ворон', null, цит(к[5].цитата, к[5].стих)),
      строка('звери, скот, гады и птицы', null, цит(к[4].цитаты[0].цитата, к[4].цитаты[0].стих)),
    ];
    return { html: `<ul>${строки.join('')}</ul>`, n: строки.length };
  }
  function гдеОбЭтом() {
    const г = Н.где; const у = г.упоминания.места;
    const строки = [
      `<li class="строка-лица"><span class="т-интерфейс">Рассказано: книга Бытие, ${адресТекст('Быт 6:9-9:17', '')}</span></li>`,
      `<li class="строка-лица"><span class="т-интерфейс">Пересказывает Послание к Евреям:</span> ${библия(`«${esc(г.пересказ[0].цитата)}»`)} ${адресКн('Евр 11:7')}</li>`,
      ...у.map((м) => `<li class="строка-лица">${библия(`«${esc(м.цитата)}»`)} ${адресКн(м.стих)}</li>`),
    ];
    return { html: `<ul>${строки.join('')}</ul><p class="голос-мы">${esc(г.охват_строка)}</p>`, n: строки.length };
  }
  function блок(имя, { html, n }, открыт) {
    if (!n) return ''; // пустой блок не рисуется (08 § 7.28)
    const id = uid('блок');
    return `<section class="блок"><h2 class="блок__заголовок"><button class="блок__кнопка" type="button" aria-expanded="${открыт}" aria-controls="${id}">${esc(имя)} (${n})${значок('раскрыть')}</button></h2><div class="блок__тело" id="${id}" ${открыт ? '' : 'hidden'}>${html}</div></section>`;
  }
  const узко = () => matchMedia('(max-width: 63.9375em)').matches;
  function инструменты() {
    const xs = [
      `<a class="малый-образ" href="#генеалогия"><span class="малый-образ__подпись">Генеалогия: 3 поколения</span>${О.слой2() ? '' : '<span class="малый-образ__вопрос">Чья это семья?</span>'}<span class="малый-образ__рисунок образ-без-рамки">${window.ОБРАЗЫ.генеалогия({ верх: 'Ламех', середина: 'Ной', низ: ['Сим', 'Хам', 'Иафет'] })}</span></a>`,
      `<a class="малый-образ во-всю" href="#время"><span class="малый-образ__подпись">Время: до потопа</span>${О.слой2() ? '' : '<span class="малый-образ__вопрос">Когда это было?</span>'}<span class="малый-образ__рисунок образ-без-рамки">${window.ОБРАЗЫ.время(['era-antediluvian'], 'До Потопа')}</span></a>`,
    ];
    return { html: `<div class="образы">${xs.join('')}</div><p class="голос-мы">География: место названо одно — горы Араратские (${адрес('Быт 8:4')}); карты на листе нет. Связи: этот раздел мы ещё не написали.</p>`, n: xs.length };
  }
  function панель() {
    const з = заметки();
    const дальше = { html: `<ul class="в-книге"><li class="строка-лица"><span class="т-адрес">Предыдущая в книге Бытие</span><a href="каталог.html">${esc(Н.дальше.предыдущая.название)}</a></li><li class="строка-лица"><span class="т-адрес">Следующая в книге Бытие</span><a href="каталог.html">${esc(Н.дальше.следующая.название)}</a></li></ul>`, n: 2 };
    const мои = { html: з.map((x) => `<aside class="заметка" aria-label="Моя заметка к ${esc(адрес(x.адрес))}"><span class="заметка__метка">Моя заметка к ${адрес(x.адрес)}</span>${esc(x.текст)}</aside>`).join(''), n: з.length };
    const изуч = { html: `<p class="т-интерфейс">Мест в скобках: ${Н.изучающим.скобки_второй_слой.мест} (вставки по греческому тексту — ${Н.изучающим.скобки_второй_слой.по_видам.lxx}, добавленные слова — ${Н.изучающим.скобки_второй_слой.по_видам.added}).</p><p class="т-интерфейс">Номер записи: e-быт-6-9 <button class="кн кн--текст" type="button" data-текст="e-быт-6-9">Копировать номер</button></p><p class="голос-мы">${esc(Н.изучающим.колофон)}</p>`, n: 1 };
    return `<aside class="панель" aria-label="Справка к истории"><div class="панель-блоки">
      <div class="блоки-управление"><button class="кн кн--тихо" type="button" data-все="1">Раскрыть все</button><button class="кн кн--тихо" type="button" data-все="0">Свернуть все</button></div>
      ${блок('В инструментах', инструменты(), !узко())}
      ${блок('Кто в истории', лица(), !узко())}
      ${блок('Где об этом в Библии', гдеОбЭтом(), false)}
      ${блок('В книге дальше', дальше, false)}
      ${блок('Мои заметки', мои, false)}
      ${О.слой2() ? блок('Для изучающих', изуч, false).replace(/ \(1\)/, '') : ''}
    </div></aside>`;
  }
  const КЗ = 'лист-образец:заметки';
  function заметки() { try { return JSON.parse(localStorage.getItem(КЗ) || '[]'); } catch { return []; } }
  function сохранитьЗаметку(адрес, текст) { const з = заметки(); з.push({ адрес, текст, когда: Date.now() }); try { localStorage.setItem(КЗ, JSON.stringify(з)); } catch { /* только до перезагрузки */ } }

  function отрисовать() {
    const части = Н.история.части;
    const открытаЛи = (ч) => (О.слой2() ? true : ч.n === 1 && !стихиДиапазона(ч.стихи).some((s) => ТРУДНЫЕ.has(s.адрес)));
    const [полоса, ...шапка] = шапкаИстории().split('<!--ШАПКА-->');
    document.getElementById('главное').innerHTML = `${полоса}<div class="чтение">
      <div class="чтение__текст">${шапка.join('')}
        <h2 class="подпись-голоса так-написано" id="так-написано">Так написано в Библии</h2>
        <div class="части">${части.map((ч) => часть(ч, открытаЛи(ч))).join('')}</div>
        <p><button class="кн кн--тихо" type="button" data-части="1">Раскрыть все части</button></p>
        <footer class="колофон т-адрес"><p>Ной и потоп — ${адрес('Быт 6:9-9:17')}. Текст: Синодальный перевод (1876); электронный текст: scrollmapper/bible_databases. ${esc(Д.эскиз)}. ${esc(Д.проба.плашка)}: сборка ${esc(Д.проба.коммит)}.</p><p><a href="#">Сообщить об ошибке</a></p></footer>
      </div>
      <div class="чтение__бок">
        ${сРисунком ? '<figure class="заглушка шапка-рисунок рисунок-ноутбук"><figcaption>Временная картинка — рисунка художника ещё нет</figcaption></figure>' : ''}
        ${панель()}
      </div></div>`;
    const п = document.querySelector('.панель');
    const прокр = () => { const да = п.scrollHeight > п.clientHeight + 2; да ? п.setAttribute('tabindex', '0') : п.removeAttribute('tabindex'); };
    прокр(); addEventListener('resize', прокр);
    О.обновитьОтступ();
  }

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-копия],[data-копия-адрес],[data-текст],[data-ссылка],[data-части],[data-все],[data-заметка],[data-закладка],[data-слушать],[data-раскрыть]');
    if (!t) return;
    if (t.dataset.копия) { const { plain, html } = О.строкаКопии(t.dataset.копия, О.слой2()); await О.вБуфер(plain, html, t, адрес(t.dataset.копия)); }
    else if (t.dataset.копияАдрес) await О.вБуфер(адрес(t.dataset.копияАдрес).replace(/ /g, ' '), null, t, адрес(t.dataset.копияАдрес));
    else if (t.dataset.текст) await О.вБуфер(t.dataset.текст, null, t, 'строка');
    else if (t.dataset.ссылка !== undefined) await О.вБуфер(location.href.split('?')[0].split('#')[0] + '#ст6.9', null, t, 'ссылка на это место');
    else if (t.dataset.раскрыть) { const ц = document.getElementById(t.dataset.раскрыть); ц.hidden = false; ц.setAttribute('tabindex', '-1'); ц.focus(); }
    else if (t.dataset.части) { document.querySelectorAll('.часть__кнопка').forEach((b) => { b.setAttribute('aria-expanded', 'true'); document.getElementById(b.getAttribute('aria-controls')).hidden = false; }); О.объявить('Раскрыты все 6 частей'); }
    else if (t.dataset.все) { const откр = t.dataset.все === '1'; document.querySelectorAll('.панель .блок__кнопка').forEach((b) => { b.setAttribute('aria-expanded', String(откр)); document.getElementById(b.getAttribute('aria-controls')).hidden = !откр; }); О.объявить(откр ? 'Все блоки раскрыты' : 'Все блоки свёрнуты'); }
    else if (t.dataset.заметка) {
      const текст = prompt(`Заметка к ${адрес(t.dataset.заметка)}`);
      if (текст) { сохранитьЗаметку(t.dataset.заметка, текст); О.объявить('Заметка сохранена'); отрисовать(); }
    } else if (t.dataset.закладка) { const на = t.getAttribute('aria-pressed') !== 'true'; t.setAttribute('aria-pressed', String(на)); О.объявить(на ? `Закладка: ${адрес(t.dataset.закладка)}` : 'Закладка убрана'); }
    else if (t.dataset.слушать !== undefined) О.слушать(document.querySelector('.коротко').textContent, document.getElementById('слушать-место'));
  });
  document.addEventListener('click', (e) => { const b = e.target.closest('.кн-дальше'); if (!b) return; requestAnimationFrame(() => { b.firstChild.textContent = b.getAttribute('aria-expanded') === 'true' ? 'свернуть' : 'дальше'; }); });
  document.addEventListener('слой', отрисовать);
  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('страница-чтения');
    О.оболочка({ панель: q.get('panel') !== '0' });
    document.title = 'Ной и потоп — Бытие — Библия наглядно';
    отрисовать();
    if (q.has('open')) { const b = document.querySelector(`#часть-${q.get('open')} .часть__кнопка`); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); }
  });
  void число;
})();
