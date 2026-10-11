/**
 * Рабочий прототип пакета 1 «Истории и Время» (10 § 4.2.2; 09 § 10.1). Оболочка: шапка, плашка пробы, экран по адресу.
 * Стек 09: TypeScript, Vite, Preact и signals. Ядро — `core/` (загрузчик, книги, адреса, годы, поиск); токены — `tokens/`;
 * облик — лист-образец 3.2 (В-31). В продукт не переносится.
 */
import { render } from 'preact';
import '../../tokens/dist/tokens.css';
import './общее/основа.css';
import './общее/компоненты.css';
import './общее/экраны.css';
import './общее/прототип.css';
import { начать, Д, загружено, книгаЕсть } from './общее/данные.ts';
import { маршрут, начатьМаршруты, задатьИмена, показ } from './общее/приложение.ts';
import type { Route } from './общее/маршруты.ts';
import { Шапка, Плашка, Ошибка } from './общее/компоненты.tsx';
import { настройки } from './общее/настройки.ts';
import { История } from './истории/история.tsx';
import { Каталог } from './истории/каталог.tsx';
import { Глава } from './истории/глава.tsx';
import { Карточка } from './истории/карточка.tsx';
import { Главная, ВсеИстории, Параллели, Сравнение, Поиск, Настройки } from './истории/экраны.tsx';
import { Время } from './время/время.tsx';
import { BOOK_BY_CODE } from '../../core/books.ts';

function имяЭкрана(r: Route): string {
  switch (r.screen) {
    case 'glavnaya':
      return 'Главная';
    case 'kniga':
      return BOOK_BY_CODE.get(r.book ?? '')?.name ?? 'Книга';
    case 'glava':
      return `${BOOK_BY_CODE.get(r.book ?? '')?.name ?? ''}, глава ${r.ch}`;
    case 'istoriya':
      return Д?.stories.get(r.id ?? '')?.title.short ?? 'История';
    case 'kartochka':
      return Д?.names.get(r.id ?? '') ?? 'Карточка';
    case 'vremya': {
      const s = r.params.sel?.startsWith('e-') ? Д?.stories.get(r.params.sel)?.title.short : undefined;
      const p = r.params.p?.split(',')[0];
      return s ? `${s} — Время` : p ? `${Д?.names.get(p) ?? p} — Время` : 'Время';
    }
    case 'istorii':
      return 'Все истории';
    case 'paralleli':
      return 'Параллельные тексты';
    case 'sravnenie':
      return 'Сравнение по выбору';
    case 'poisk':
      return 'Результаты поиска';
    case 'nastroyki':
      return 'Настройки';
  }
}

function Экран() {
  const r = маршрут.value;
  void показ.value;
  void настройки.value;
  switch (r.screen) {
    case 'glavnaya':
      return <Главная />;
    case 'kniga':
      return <Каталог book={r.book!} key={r.book} />;
    case 'glava':
      return <Глава book={r.book!} ch={r.ch!} key={`${r.book}${r.ch}`} />;
    case 'istoriya':
      return <История id={r.id!} key={`${r.id}-${показ.value}`} />;
    case 'kartochka':
      return <Карточка id={r.id!} key={r.id} />;
    case 'vremya':
      return <Время key={показ.value} />;
    case 'istorii':
      return <ВсеИстории />;
    case 'paralleli':
      return <Параллели id={r.id!} />;
    case 'sravnenie':
      return <Сравнение />;
    case 'poisk':
      return <Поиск />;
    case 'nastroyki':
      return <Настройки />;
  }
}

function Приложение() {
  return (
    <>
      <a class="скрыто-пропуск" href="#главное">
        Перейти к содержимому
      </a>
      <Шапка />
      <Плашка />
      <main id="главное" class={`оболочка экран-${маршрут.value.screen}`} tabIndex={-1}>
        <Ошибка />
        <Экран />
      </main>
    </>
  );
}

async function запуск() {
  const корень = document.getElementById('приложение')!;
  try {
    await начать();
  } catch (e) {
    корень.innerHTML = `<main class="оболочка"><h1 class="т-h1">Не получилось открыть данные</h1><p class="т-проза">${String((e as Error).message)}</p><p><button class="кн" onclick="location.reload()">Повторить</button></p></main>`;
    return;
  }
  задатьИмена(имяЭкрана);
  начатьМаршруты();
  render(<Приложение />, корень);
  document.documentElement.dataset.готово = '1';
  (window as unknown as { __бн: unknown }).__бн = { загружено, книгаЕсть, маршрут };
}
void запуск();
