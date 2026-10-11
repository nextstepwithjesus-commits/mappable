/**
 * Настройки — уровень 5 модели возврата (08 § 6.5, § 7.23): не в адресе, только на устройстве; «Назад» их не меняет.
 * Возраст первого запуска (В-28): подсказки для детей — только при возрасте младше 13. Параметры адреса `theme`, `layer`,
 * `text`, `age`, `density`, `input`, `motion` — только для снимков и проверок: перекрывают сохранённое и не записываются.
 */
import { signal, effect } from '@preact/signals';

export interface Settings {
  тема: 'система' | 'light' | 'dark';
  слой: '1' | '2';
  текст: 'обычный' | 'крупнее' | 'самый';
  плотность: 'обычная' | 'плотная';
  ввод: 'система' | 'мышь' | 'касание';
  движение: 'система' | 'без' | 'с';
  возраст: number | null;
  возрастСпрошен: boolean;
  клавиши: boolean;
}
const КЛЮЧ = 'бн-прототип:настройки';
const ПО_УМОЛЧАНИЮ: Settings = { тема: 'система', слой: '1', текст: 'обычный', плотность: 'обычная', ввод: 'система', движение: 'система', возраст: null, возрастСпрошен: false, клавиши: true };

function прочитать(): Settings {
  try {
    return { ...ПО_УМОЛЧАНИЮ, ...(JSON.parse(localStorage.getItem(КЛЮЧ) || '{}') as Partial<Settings>) };
  } catch {
    return { ...ПО_УМОЛЧАНИЮ };
  }
}
const q = new URLSearchParams(location.search);
const сохранённые = прочитать();
const изАдреса: Partial<Settings> = {};
if (q.has('theme')) изАдреса.тема = q.get('theme') === 'dark' ? 'dark' : 'light';
if (q.has('layer')) изАдреса.слой = q.get('layer') === '2' ? '2' : '1';
if (q.has('text')) изАдреса.текст = (q.get('text') as Settings['текст']) ?? 'обычный';
if (q.has('density')) изАдреса.плотность = q.get('density') === 'плотная' ? 'плотная' : 'обычная';
if (q.has('input')) изАдреса.ввод = (q.get('input') as Settings['ввод']) ?? 'система';
if (q.has('motion')) изАдреса.движение = (q.get('motion') as Settings['движение']) ?? 'система';
if (q.has('age')) {
  const a = q.get('age');
  изАдреса.возраст = a === 'null' || a === '' ? null : Number(a);
  изАдреса.возрастСпрошен = true;
}
/** Перекрытия адреса держатся до конца сессии вкладки: снимок и проверка не теряют их после перехода. */
const СЕССИЯ = 'бн-прототип:перекрытия';
let перекрытия: Partial<Settings> = {};
try {
  перекрытия = { ...(JSON.parse(sessionStorage.getItem(СЕССИЯ) || '{}') as Partial<Settings>), ...изАдреса };
  sessionStorage.setItem(СЕССИЯ, JSON.stringify(перекрытия));
} catch {
  перекрытия = изАдреса;
}

export const настройки = signal<Settings>({ ...сохранённые, ...перекрытия });

export function изменить(patch: Partial<Settings>): void {
  for (const k of Object.keys(patch) as (keyof Settings)[]) delete (перекрытия as Record<string, unknown>)[k];
  try {
    sessionStorage.setItem(СЕССИЯ, JSON.stringify(перекрытия));
  } catch {
    /* хранилище недоступно */
  }
  const next = { ...настройки.value, ...patch };
  настройки.value = next;
  try {
    const { ...сохранить } = next;
    localStorage.setItem(КЛЮЧ, JSON.stringify(сохранить));
  } catch {
    /* хранилище недоступно — настройка действует до перезагрузки */
  }
}

export const слой2 = () => настройки.value.слой === '2';
/** В-28: подсказки для детей — только при указанном возрасте младше 13. */
export const детям = () => {
  const a = настройки.value.возраст;
  return a !== null && Number.isFinite(a) && a < 13;
};

effect(() => {
  const s = настройки.value;
  const r = document.documentElement;
  s.тема === 'система' ? r.removeAttribute('data-theme') : r.setAttribute('data-theme', s.тема);
  r.setAttribute('data-layer', s.слой);
  s.плотность === 'плотная' ? r.setAttribute('data-density', 'плотная') : r.removeAttribute('data-density');
  s.ввод === 'система' ? r.removeAttribute('data-input') : r.setAttribute('data-input', s.ввод);
  s.текст === 'обычный' ? r.removeAttribute('data-text') : r.setAttribute('data-text', s.текст);
  s.движение === 'система' ? r.removeAttribute('data-motion') : r.setAttribute('data-motion', s.движение);
});
