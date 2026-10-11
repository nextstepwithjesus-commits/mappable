// Экран листа: страница истории «Ной и потоп» (08 § 3.3.4 — три яруса; § 7.4, § 7.5, § 7.6, § 7.28, § 16; 11).
// Текст — команда verse; лица — сборка пробы; разметка истории — эскиз шага 0. ПРОТОТИП.
(function () {
  const О = window.ОБЩЕЕ; const { Д, esc, значок, знакВида, адрес, полныйАдрес, адресТекст, htmlСтиха, стихиДиапазона, число } = О;
  const Н = Д.ной;
  const ИСТ = Д.каталоги.Быт.истории.find((и) => и.id === 'e-быт-6-9');
  let счётчик = 0;
  const uid = (p) => `${p}-${++счётчик}`;

  // адрес-кнопка с вклейкой стиха ± 2 стиха (08 § 7.6)
  function адресКн(a, вокруг = true) {
    const id = uid('вкл');
    return `<button class="адрес-кн" type="button" aria-expanded="false" aria-controls="${id}">${адрес(a)}<span class="скрыто">, ${esc(полныйАдрес(a))}</span>${значок('раскрыть')}</button><div class="вклейка" id="${id}" hidden>${вклейка(a, вокруг)}</div>`;
  }
  function вклейка(a, вокруг) {
    const p = О.разобрать(a);
    const свои = стихиДиапазона(a);
    let около = свои;
    if (вокруг && свои.length === 1) {
      const до = [p.с - 2, p.с - 1].map((с) => `${p.код} ${p.г}:${с}`), после = [p.с + 1, p.с + 2].map((с) => `${p.код} ${p.г}:${с}`);
      около = [...до, `${p.код} ${p.г}:${p.с}`, ...после].map((k) => ({ адрес: k, текст: Д.стихи[k] ?? Д.стихиКарточки[k], с: +k.split(':')[1] })).filter((x) => x.текст);
    }
    const свой = new Set(свои.map((s) => s.адрес));
    return `<div class="голос-библия т-цитата">${около.map((s) => `<p${свой.has(s.адрес) ? ' class="вклейка__свой"' : ''}><span class="т-адрес">${s.с}</span> ${htmlСтиха(s.адрес, s.текст)}</p>`).join('')}</div>
      <div class="ряд-действий"><button class="кн" type="button" data-копия="${esc(a)}">${значок('копировать')}Копировать стих с адресом</button><button class="кн" type="button" data-копия-адрес="${esc(a)}">${значок('ссылка')}Копировать адрес</button><button class="кн" type="button" data-заметка="${esc(a)}">${значок('заметка')}Заметка</button><button class="кн" type="button" data-закладка="${esc(a)}" aria-pressed="false">${значок('закладка')}Закладка</button><a class="кн" href="#часть-1">Вся глава</a></div>`;
  }

  function шапкаИстории() {
    const ш = Н.шапка;
    const т = `Трудная история: здесь есть смерть${О.детскиеПодсказки() ? '. Прочтите сначала сами' : ''}`;
    return `<nav class="хлебные т-адрес" aria-label="Путь"><a href="каталог.html">Ветхий Завет</a>${значок('вправо')}<a href="каталог.html">Бытие</a>${значок('вправо')}<span aria-current="page">Ной</span></nav>
    <header class="шапка-истории">
      <div class="шапка-истории__верх"><span class="шапка-истории__номер т-номер-истории ч-вз" aria-hidden="true">${ИСТ.номер}</span><h1 class="т-h1" id="h1" tabindex="-1"><span class="скрыто">История ${ИСТ.номер}. </span>${esc(ш.название)}</h1></div>
      <div class="шапка-истории__вид"><span class="вид т-адрес">${знакВида('событие')}событие</span>${О.слой2() ? адресТекст('Быт 6:9-9:17') + `<span class="т-адрес">название атласа</span>` : `<span class="т-адрес">${esc(полныйАдрес('Быт 6:9-9:17'))}</span>`}</div>
      <div class="ряд-действий" role="group" aria-label="Работа с материалом">
        <button class="кн" type="button" aria-expanded="false" aria-controls="как-сослаться">${значок('сослаться')}Как сослаться</button>
        <button class="кн" type="button" data-ссылка>${значок('ссылка')}Ссылка на это место</button>
        <button class="кн" type="button" onclick="print()">${значок('печать')}Печать</button>
        <span class="меню-обёртка"><button class="кн" type="button" aria-haspopup="menu" aria-expanded="false" data-menu="меню-истории">${значок('действия')}Ещё действия<span class="скрыто">: Ной и потоп</span></button>
          <div class="меню" role="menu" id="меню-истории" hidden aria-label="Ещё действия: Ной и потоп">
            <button role="menuitem" type="button" data-заметка="Быт 6:9-9:17">${значок('заметка')}Заметка к истории</button>
            <button role="menuitem" type="button" data-закладка="Быт 6:9-9:17">${значок('закладка')}Закладка</button>
            <button role="menuitem" type="button" data-слушать>${значок('слушать')}Слушать</button>
            ${О.слой2() ? `<button role="menuitem" type="button" data-номер="e-быт-6-9">${значок('копировать')}Копировать номер записи</button>` : ''}
          </div></span>
      </div>
      <div class="как-сослаться" id="как-сослаться" hidden>${какСослаться()}</div>
      <figure class="заглушка шапка-рисунок только-узко"><figcaption>Временная картинка — рисунка художника ещё нет</figcaption></figure>
      <p class="тихая-строка">${esc(т)}</p>
      <div class="коротко"><p class="подпись-голоса">Коротко, нашими словами</p><p class="т-проза">${(О.слой2() ? Н.о_чём.второй_слой : Н.о_чём.простой_слой).map((x) => esc(x.текст)).join(' ')}</p><p class="т-адрес">по стихам ${esc(Н.о_чём.формула.replace('по стихам ', ''))}</p></div>
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

  // текст Писания: часть, номер главы на поле, номера стихов, начало части насыщенностью 600, скобки, слова словаря
  const СЛОВАРЬ = Object.fromEntries((Н.история.пояснения ?? []).map((п) => [п.слово, п.текст]));
  function часть(ч, открыта) {
    const стихи = стихиДиапазона(ч.стихи);
    const id = `часть-${ч.n}`;
    let прежняяГлава = null;
    const html = стихи.map((s, i) => {
      let t = htmlСтиха(s.адрес, s.текст);
      if (i === 0) {
        // начало части: до первой запятой, не больше 5 слов (08 § 2.5)
        const слова = s.текст.split(/\s+/); const до = [];
        for (const w of слова) { до.push(w); if (/[,;:.]$/.test(w) || до.length >= 5) break; }
        const нач = esc(до.join(' '));
        if (t.startsWith(нач)) t = `<span class="начало-части">${нач}</span>${t.slice(нач.length)}`;
      }
      t = t.replace(/(^|[\s(])(ковчег|локтей)(?=[\s,.;:])/u, (m, a, w) => `${a}<button class="слово-словаря" type="button" aria-expanded="false" aria-controls="сл-${ч.n}-${i}" data-toggletip>${w}</button>`);
      const сл = /ковчег|локтей/.test(s.текст) ? `<span class="раскрытие-на-месте" id="сл-${ч.n}-${i}" hidden>${esc(СЛОВАРЬ[/ковчег/.test(s.текст) ? 'ковчег' : 'локоть'] ?? '')}. <span class="ч2">Это пояснение, а не слова Библии.</span></span>` : '';
      const глава = s.г !== прежняяГлава ? `<span class="глава-номер т-номер-главы" aria-hidden="true">${s.г}</span>` : '';
      прежняяГлава = s.г;
      return `<span class="стих" id="ст${s.г}.${s.с}">${глава}<span class="стих__номер">${s.с}</span>${t} ${сл}</span>`;
    }).join(' ');
    return `<section class="часть" aria-labelledby="${id}-з" id="${id}">
      <h2 class="часть__заголовок" id="${id}-з">Часть ${ч.n}. ${esc(ч.название)} <span class="т-адрес">${адрес(ч.стихи)}</span></h2>
      <button class="кн кн--текст" type="button" aria-expanded="${открыта}" aria-controls="${id}-т">${значок('раскрыть')}${открыта ? 'Свернуть' : 'Читать'} часть ${ч.n}: ${esc(ч.название)}</button>
      <div id="${id}-т" ${открыта ? '' : 'hidden'}>
        <div class="писание${О.настройки.писание === 'по стихам' ? ' по-стиху' : ''}" lang="ru">${html}</div>
        ${ч.n === 1 && !О.слой2() ? `<p class="что-значат т-интерфейс"><span>Что значат слова:</span><button class="слово-словаря" type="button" aria-expanded="false" aria-controls="чз-1" data-toggletip>ковчег</button><button class="слово-словаря" type="button" aria-expanded="false" aria-controls="чз-2" data-toggletip>локоть</button></p><span class="раскрытие-на-месте" id="чз-1" hidden>${esc(СЛОВАРЬ.ковчег)}. <span class="ч2">Это пояснение, а не слова Библии.</span></span><span class="раскрытие-на-месте" id="чз-2" hidden>${esc(СЛОВАРЬ.локоть)}. <span class="ч2">Это пояснение, а не слова Библии.</span></span>` : ''}
        ${ч.n === 1 && О.детскиеПодсказки() ? `<p class="т-интерфейс ч2">Найдите вместе: ${esc(Н.история.найдите_вместе[0].вопрос)} <span class="т-адрес">(ответ — ${адрес(Н.история.найдите_вместе[0].стих)})</span></p>` : ''}
      </div></section>`;
  }

  function лица() {
    const к = Н.кто.карточки;
    const строка = (имя, ссылка, роль, подпись) => `<li class="строка-лица"><span class="строка-лица__имя">${ссылка ? `<a href="${ссылка}">${esc(имя)}</a>` : esc(имя)}</span><span class="строка-лица__роль">${роль}</span>${подпись ? `<span class="т-адрес">${подпись}</span>` : ''}</li>`;
    const цит = (ц, ст) => `<span class="т-цитата голос-библия">${О.слой2() ? '' : '<span class="подпись-голоса">Библия: </span>'}«${esc(ц)}»</span>${адресКн(ст)}`;
    const сыновья = к[1].лица.map((л) => `<a href="карточка.html?p=${л.id.slice(2)}">${esc(л.имя)}</a>`).join(', ');
    return `<ul>${строка('Ной', 'карточка.html', цит(к[0].цитата, к[0].стих))}
      <li class="строка-лица"><span class="строка-лица__имя">сыновья Ноя: ${сыновья}</span><span class="строка-лица__роль">${цит('и сыновья его', 'Быт 7:7')}</span></li>
      ${строка('жена Ноя', null, `<span class="т-интерфейс">Как её звали, в Библии не сказано.</span> ${цит(к[2].цитата, к[2].стих)}`, 'Эту карточку мы ещё не написали')}
      ${строка('жёны сыновей Ноя', null, `<span class="т-интерфейс">Как их звали, в Библии не сказано.</span> ${цит(к[3].цитата, к[3].стих)}`)}
      ${строка('ворон', null, цит(к[5].цитата, к[5].стих))}</ul>
      <button class="кн кн--текст" type="button" aria-expanded="false" aria-controls="ещё-лица">${значок('раскрыть')}Показать ещё 1<span class="скрыто"> участника истории</span></button>
      <ul id="ещё-лица" hidden>${строка('звери, скот, гады и птицы', null, цит(к[4].цитаты[0].цитата, к[4].цитаты[0].стих))}</ul>`;
  }
  function гдеОбЭтом() {
    const г = Н.где;
    const у = г.упоминания.места;
    return `<p class="т-интерфейс">Рассказано: в книге Бытие, ${адресТекст('Быт 6:9-9:17', '')}.</p>
      <p class="т-интерфейс">Пересказывает Послание к Евреям: <span class="т-цитата голос-библия">«${esc(г.пересказ[0].цитата)}»</span> ${адресКн('Евр 11:7')}</p>
      <p class="т-интерфейс">Вспоминают ещё 5 книг:</p>
      <ul>${у.slice(0, 3).map((м) => `<li class="строка-лица"><span class="т-цитата голос-библия">«${esc(м.цитата)}»</span>${адресКн(м.стих)}</li>`).join('')}</ul>
      <button class="кн кн--текст" type="button" aria-expanded="false" aria-controls="ещё-места">${значок('раскрыть')}Показать ещё 2 места</button>
      <ul id="ещё-места" hidden>${у.slice(3).map((м) => `<li class="строка-лица"><span class="т-цитата голос-библия">«${esc(м.цитата)}»</span>${адресКн(м.стих)}</li>`).join('')}</ul>
      <p class="голос-мы">${esc(г.охват_строка)}</p>`;
  }
  function блок(имя, n, тело, открыт, молчание) {
    const id = uid('блок');
    if (молчание) return `<section class="блок"><h2 class="блок__заголовок"><span class="блок__молчание т-повествование">${esc(имя)}: <span class="т-интерфейс">${esc(молчание)}</span></span></h2></section>`;
    return `<section class="блок"><h2 class="блок__заголовок"><button class="блок__кнопка" type="button" aria-expanded="${открыт}" aria-controls="${id}">${esc(имя)}${n !== null ? ` (${n})` : ''}${значок('раскрыть')}</button></h2><div class="блок__тело" id="${id}" ${открыт ? '' : 'hidden'}>${тело}</div></section>`;
  }
  const узко = () => matchMedia('(max-width: 63.9375em)').matches;
  function панель() {
    const з = заметки();
    const образы = `<div class="образы">
      <a class="малый-образ" href="#генеалогия"><span class="малый-образ__подпись">Генеалогия: 3 поколения</span>${О.слой2() ? '' : '<span class="малый-образ__вопрос">Чья это семья?</span>'}<span class="малый-образ__рисунок">${window.ОБРАЗЫ.генеалогия({ верх: 'Ламех', середина: 'Ной', низ: ['Сим', 'Хам', 'Иафет'] })}</span></a>
      <a class="малый-образ" href="#география"><span class="малый-образ__подпись">География: 1 место</span>${О.слой2() ? '' : '<span class="малый-образ__вопрос">Где это было?</span>'}<span class="малый-образ__рисунок образ-нет"><span class="т-адрес">Горы Араратские (Быт 8:4). Карты на листе нет: точки мест — эскиз</span></span></a>
      <a class="малый-образ во-всю" href="#время"><span class="малый-образ__подпись">Время: До Потопа — После Потопа</span>${О.слой2() ? '' : '<span class="малый-образ__вопрос">Когда это было?</span>'}<span class="малый-образ__рисунок">${window.ОБРАЗЫ.время(['antediluvian', 'postdiluvian'], 'До Потопа — После Потопа')}</span></a>
      <p class="голос-мы во-всю">Связи: этот раздел мы ещё не написали.</p></div>`;
    return `<aside class="панель" aria-label="Справка к истории" tabindex="0"><div class="панель-блоки">
      <div class="блоки-управление"><button class="кн кн--тихо" type="button" data-все="1">Раскрыть все</button><button class="кн кн--тихо" type="button" data-все="0">Свернуть все</button></div>
      ${блок('Узнать больше', 4, образы, !узко())}
      ${блок('Кто в истории', 6, лица(), !узко())}
      ${блок('Где об этом в Библии', 7, гдеОбЭтом(), false)}
      ${блок('В книге дальше', 2, `<ul><li class="строка-лица"><span class="т-адрес">Предыдущая в книге Бытие</span><a href="каталог.html">${esc(Н.дальше.предыдущая.название)}</a></li><li class="строка-лица"><span class="т-адрес">Следующая в книге Бытие</span><a href="каталог.html">${esc(Н.дальше.следующая.название)}</a></li></ul>`, false)}
      ${блок('Мои заметки', з.length, з.length ? з.map((x) => `<div class="заметка"><span class="заметка__метка">Моя заметка к ${адрес(x.адрес)}</span>${esc(x.текст)}</div>`).join('') : '<p class="голос-мы">Заметок пока нет. Заметки хранятся только на этом устройстве.</p>', false)}
      ${О.слой2() ? блок('Для изучающих', null, `<p class="т-интерфейс">Мест в скобках: ${Н.изучающим.скобки_второй_слой.мест} (вставки по греческому тексту — ${Н.изучающим.скобки_второй_слой.по_видам.lxx}, добавленные слова — ${Н.изучающим.скобки_второй_слой.по_видам.added}).</p><p class="т-интерфейс">Номер записи: e-быт-6-9 <button class="кн кн--текст" type="button" data-текст="e-быт-6-9">Копировать номер</button></p><p class="голос-мы">${esc(Н.изучающим.колофон)}</p>`, false) : ''}
    </div></aside>`;
  }
  // заметки читателя — только на этом устройстве (08 § 16.7); в прототипе — localStorage
  const КЗ = 'лист-образец:заметки';
  function заметки() { try { return JSON.parse(localStorage.getItem(КЗ) || '[]'); } catch { return []; } }
  function сохранитьЗаметку(адрес, текст) { const з = заметки(); з.push({ адрес, текст, когда: Date.now() }); try { localStorage.setItem(КЗ, JSON.stringify(з)); } catch { /* только до перезагрузки */ } }

  function отрисовать() {
    const части = Н.история.части;
    document.getElementById('главное').innerHTML = `<div class="чтение">
      <div class="чтение__текст">${шапкаИстории()}
        <div class="строка-над-текстом"><p class="подпись-голоса">Так написано в Библии</p><button class="кн кн--тихо" type="button" data-части="1">Открыть все части</button></div>
        ${части.map((ч) => часть(ч, false)).join('')}
        <footer class="колофон т-адрес"><p>Ной и потоп — ${адрес('Быт 6:9-9:17')}. Текст: Синодальный перевод (1876); электронный текст: scrollmapper/bible_databases. ${esc(Д.эскиз)}. ${esc(Д.проба.плашка)}: сборка ${esc(Д.проба.коммит)}.</p><p><a href="#">Сообщить об ошибке</a></p></footer>
      </div>
      <div class="чтение__бок">
        <figure class="заглушка шапка-рисунок"><figcaption>Временная картинка — рисунка художника ещё нет</figcaption></figure>
        ${панель()}
      </div></div>`;
  }

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-копия],[data-копия-адрес],[data-текст],[data-ссылка],[data-части],[data-все],[data-заметка],[data-закладка],[data-слушать]');
    if (!t) return;
    if (t.dataset.копия) { const { plain, html } = О.строкаКопии(t.dataset.копия, О.слой2()); await О.вБуфер(plain, html, t, адрес(t.dataset.копия)); }
    else if (t.dataset.копияАдрес) await О.вБуфер(адрес(t.dataset.копияАдрес), null, t, адрес(t.dataset.копияАдрес));
    else if (t.dataset.текст) await О.вБуфер(t.dataset.текст, null, t, 'строка');
    else if (t.dataset.ссылка !== undefined) await О.вБуфер(location.href.split('?')[0] + '#st6.9', null, t, 'ссылка на это место');
    else if (t.dataset.части) { document.querySelectorAll('.часть > button[aria-controls]').forEach((b) => { b.setAttribute('aria-expanded', 'true'); document.getElementById(b.getAttribute('aria-controls')).hidden = false; }); О.объявить('Открыты все 6 частей'); }
    else if (t.dataset.все) { const откр = t.dataset.все === '1'; document.querySelectorAll('.панель .блок__кнопка').forEach((b) => { b.setAttribute('aria-expanded', String(откр)); document.getElementById(b.getAttribute('aria-controls')).hidden = !откр; }); О.объявить(откр ? 'Все блоки раскрыты' : 'Все блоки свёрнуты'); }
    else if (t.dataset.заметка) {
      const текст = prompt(`Заметка к ${адрес(t.dataset.заметка)}`);
      if (текст) { сохранитьЗаметку(t.dataset.заметка, текст); О.объявить('Заметка сохранена'); отрисовать(); }
    } else if (t.dataset.закладка) { const на = t.getAttribute('aria-pressed') !== 'true'; t.setAttribute('aria-pressed', String(на)); О.объявить(на ? `Закладка: ${адрес(t.dataset.закладка)}` : 'Закладка убрана'); }
    else if (t.dataset.слушать !== undefined) {
      const голоса = speechSynthesis?.getVoices?.().filter((v) => v.lang.startsWith('ru') && v.localService) ?? [];
      if (!голоса.length) { О.объявить('Голоса для чтения вслух на этом устройстве нет'); return; }
      const u = new SpeechSynthesisUtterance(document.querySelector('.коротко .т-проза').textContent); u.voice = голоса[0]; u.lang = 'ru-RU'; speechSynthesis.speak(u);
    }
  });
  // кнопка «Читать / Свернуть часть»: подпись следует состоянию
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.часть > button[aria-controls]');
    if (!b) return;
    requestAnimationFrame(() => { const откр = b.getAttribute('aria-expanded') === 'true'; b.lastChild.textContent = b.lastChild.textContent.replace(/^(Читать|Свернуть)/, откр ? 'Свернуть' : 'Читать'); });
  });
  document.addEventListener('слой', отрисовать);
  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('страница-чтения');
    О.оболочка({ активный: '', панель: new URLSearchParams(location.search).get('panel') !== '0' });
    document.title = 'Ной и потоп — Бытие — Библия наглядно';
    отрисовать();
    const q = new URLSearchParams(location.search);
    if (q.has('open')) document.querySelector(`#часть-${q.get('open')} > button[aria-controls]`)?.click();
  });
  void число;
})();
