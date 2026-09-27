/**
 * Оболочка атласа без браузера: ранжирование поиска на настоящих данных (D9), пара «первое — второе» (D6, A13),
 * творительный падеж имени для строки выбора второго лица (D6), зоны захвата рамки полосы времени (D12).
 * Нужна свежая сборка данных: npm run -s data.
 */
import { describe, it, expect } from 'vitest';
import { persons, byId } from '../src/data/atlas.ts';
import { SearchIndex } from '../src/engine/search.ts';
import { selected, second, first, panel, pickMode, kinPath, pickSecond, clearPair } from '../src/state.ts';
import { pairPath } from '../src/ui/SkyView.tsx';
import { pickBarText } from '../src/ui/sky/text.ts';
import { nameCase } from '../src/ui/text/ru.ts';
import { frameGrip } from '../src/ui/TimeStrip.tsx';

const index = new SearchIndex(
  persons.map((p) => ({ id: p.id, name: p.name, alt: p.alt, disambig: p.disambig, prominence: p.prominence, magnitude: p.magnitude, refs: p.parentRefs })),
);
const ids = (q: string, n = 10) => index.search(q, n).map((h) => h.id);

describe('поиск: класс совпадения, внутри класса — значимость (D9)', () => {
  it('«Иисус» — Иисус Христос первым, Иисус Навин в первой тройке', () => {
    const top = ids('Иисус');
    expect(top[0]).toBe('iisus');
    expect(top.slice(0, 3)).toContain('iisus-navin');
  });
  it('косвенная форма «Иисуса» — тоже Иисус Христос первым', () => {
    expect(ids('Иисуса')[0]).toBe('iisus');
  });
  it('одноимённые — по значимости: Иосиф, Мария, Иаков, Иуда, Захария, Давид', () => {
    expect(ids('Иосиф').slice(0, 2)).toEqual(['iosif', 'iosif-muzh-marii']);
    expect(ids('Мария')[0]).toBe('mariya');
    expect(ids('Иаков')[0]).toBe('iakov');
    expect(ids('Иуда').slice(0, 2)).toEqual(['iuda', 'iuda-iskariot']);
    expect(ids('Захария')[0]).toBe('zakhariya-syn-varakhii');
    expect(ids('Давид')[0]).toBe('david');
    expect(ids('Давида')[0]).toBe('david');
    expect(ids('lfdbl')[0]).toBe('david');
  });
  it('лица, чьё имя совпало с запросом целиком или первым словом, идут раньше прочих и по величине звезды', () => {
    for (const q of ['Иисус', 'Иосиф', 'Мария', 'Иаков', 'Иуда', 'Захария', 'Давид', 'Симеон', 'Анна']) {
      const hits = index.search(q, 40).map((h) => byId.get(h.id)!);
      const lead = (name: string) => name.toLowerCase() === q.toLowerCase() || name.toLowerCase().split(' ')[0] === q.toLowerCase();
      const firstOther = hits.findIndex((p) => !lead(p.name));
      const head = firstOther < 0 ? hits : hits.slice(0, firstOther);
      expect(head.length, q).toBeGreaterThan(0);
      // после первого «чужого» имени одноимённых с запросом уже нет
      if (firstOther >= 0) expect(hits.slice(firstOther).some((p) => lead(p.name)), q).toBe(false);
      for (let i = 1; i < head.length; i++) expect(head[i].magnitude, `${q}: ${head[i - 1].id} → ${head[i].id}`).toBeGreaterThanOrEqual(head[i - 1].magnitude);
    }
  });
  it('начало имени — после точного совпадения: «Иос» не ставит Иосифию выше Иосифа', () => {
    const top = ids('Иос', 30);
    expect(top.indexOf('iosif')).toBeLessThan(top.indexOf('iosifiya'));
  });
});

const reset = () => {
  panel.value = null;
  pickMode.value = null;
  clearPair();
  selected.value = null;
};

describe('пара «первое — второе» (D6, A13)', () => {
  it('в режиме «Родство с…» выбор записывает второе лицо, первое остаётся, открывается «Родство»', () => {
    reset();
    selected.value = 'david';
    pickMode.value = 'kinship';
    expect(pickSecond('ioav')).toBe(true);
    expect([selected.value, first.value, second.value, panel.value, pickMode.value]).toEqual(['david', 'david', 'ioav', 'kinship', null]);
    expect(pairPath()?.[0]).toBe('david');
    expect(pairPath()?.at(-1)).toBe('ioav');
  });
  it('без режима и для самого первого лица выбор второго не срабатывает', () => {
    reset();
    selected.value = 'david';
    expect(pickSecond('ioav')).toBe(false);
    pickMode.value = 'spread';
    expect(pickSecond('david')).toBe(false);
    expect(second.value).toBe(null);
  });
  it('«Разворот с…» открывает разворот и не рисует пути родства', () => {
    reset();
    selected.value = 'ruf';
    pickMode.value = 'spread';
    expect(pickSecond('david')).toBe(true);
    expect(panel.value).toBe('spread');
    expect(pairPath()).toBe(null);
  });
  it('пока «Родство» открыто, переход по ссылке не меняет пару; после закрытия новый выбор снимает пару и путь (MAP-19)', () => {
    reset();
    selected.value = 'ioav';
    pickMode.value = 'kinship';
    pickSecond('david');
    selected.value = 'saruiya'; // ссылка в цепочке
    expect([first.value, second.value]).toEqual(['ioav', 'david']);
    panel.value = null;
    selected.value = 'saul';
    expect([first.value, second.value, kinPath.current]).toEqual([null, null, null]);
    expect(pairPath()).toBe(null);
  });
  it('смена первого лица снимает режим выбора второго', () => {
    reset();
    selected.value = 'david';
    pickMode.value = 'kinship';
    selected.value = 'saul';
    expect(pickMode.value).toBe(null);
  });
  it('путь чужой пары не показывается', () => {
    reset();
    selected.value = 'david';
    kinPath.current = ['ioav', 'saruiya', 'david'];
    second.value = 'ruf';
    expect(pairPath()).toBe(null);
    reset();
  });
});

describe('строка выбора второго лица (D6)', () => {
  it('имя в творительном падеже, без подстановки несклонённого имени', () => {
    const t = (mode: 'kinship' | 'spread', id: string) => pickBarText(mode, id).split(':')[0];
    expect(pickBarText('kinship', 'david')).toBe('Родство с Давидом: выберите второе лицо на небе или найдите его в поле «Найти»');
    expect(t('spread', 'ruf')).toBe('Разворот с Руфью');
    expect(t('kinship', 'iisus')).toBe('Родство с Иисусом Христом');
    expect(t('kinship', 'iisus-navin')).toBe('Родство с Иисусом Навиным');
    expect(t('kinship', 'mariya')).toBe('Родство с Марией');
    expect(t('kinship', 'iessey')).toBe('Родство с Иессеем');
  });
  it('у каждого лица строка грамматична: падеж выведен или имя стоит в именительном после тире', () => {
    const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const p of persons) {
      const ins = nameCase(p.name, p.sex, 'ins', p.unnamed);
      const t = pickBarText('kinship', p.id);
      expect(t, p.id).toMatch(new RegExp(ins ? `^Родство со? ${esc(ins)}:` : `^Родство; первое лицо — ${esc(p.name)}:`));
      expect(t, p.id).toMatch(/: выберите второе лицо на небе или найдите его в поле «Найти»$/);
    }
  });
});

describe('рамка полосы времени (D12)', () => {
  it('у узкой рамки тело — сдвиг, ручки снаружи', () => {
    // рамка «Царства» ~32 px
    expect(frameGrip(716, 700, 732)).toBe('move');
    expect(frameGrip(701, 700, 732)).toBe('move');
    expect(frameGrip(731, 700, 732)).toBe('move');
    expect(frameGrip(690, 700, 732)).toBe('left');
    expect(frameGrip(742, 700, 732)).toBe('right');
    expect(frameGrip(600, 700, 732)).toBe('new');
    // совсем узкая рамка: тело не меньше 44 px
    expect(frameGrip(718, 700, 703)).toBe('move');
    expect(frameGrip(675, 700, 703)).toBe('left');
  });
  it('у широкой рамки края ловятся на ±22 px, середина — сдвиг', () => {
    expect(frameGrip(710, 700, 900)).toBe('left');
    expect(frameGrip(690, 700, 900)).toBe('left');
    expect(frameGrip(890, 700, 900)).toBe('right');
    expect(frameGrip(800, 700, 900)).toBe('move');
    expect(frameGrip(500, 700, 900)).toBe('new');
  });
});
