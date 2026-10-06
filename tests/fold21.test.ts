/**
 * Этап 21, решения 197–198: шаги и свёртки карты «набор» на данных атласа (src/ui/fold.ts, src/ui/reveal.ts).
 *  — шаг вперёд: один союз — супруг и дети сразу; несколько — сначала супруги, следующий шаг — все дети;
 *  — шаг назад: родители, братья и сёстры;
 *  — свёртка потомков и предков: закреплённые лица остаются, лицо, у которого свернули, — тоже (закрепляется, если
 *    держалось на свёрнутом); несвязанное уходит; раскрытые союзы с ушедшими лицами сворачиваются;
 *  — «только это лицо»: на карте одно лицо.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { batch } from '@preact/signals';
import { workSet, show, setShowState, linkSet } from '../src/ui/work.ts';
import { expanded, opened, stepForward, stepBack, foldDescendantsOf, foldAncestorsOf, foldMapTo, mapCmds, unionsOf } from '../src/ui/reveal.ts';

const self = (id: string) => [id, { via: 'self' as const, of: id }] as const;
function startWith(...ids: string[]) {
  batch(() => {
    linkSet.value = null;
    workSet.value = new Map(ids.map(self));
    expanded.value = {};
    opened.value = [];
    setShowState({ kind: 'set' });
  });
}
const ids = () => [...workSet.peek().keys()].sort();

describe('шаги карты (решение 197)', () => {
  beforeEach(() => startWith('adam', 'iisus'));

  it('Адам: один союз — Ева и дети сразу; свёртка потомков возвращает начало «Адам и Иисус Христос»', () => {
    expect(mapCmds('adam').forward?.kind).toBe('union');
    expect(stepForward('adam')).toBe('union');
    for (const x of ['eva', 'kain', 'avel', 'sif']) expect(workSet.peek().has(x), x).toBe(true);
    expect(mapCmds('adam').foldDesc).toBe(true);
    expect(stepForward('sif')).not.toBe('none');
    expect(workSet.peek().has('enos')).toBe(true);
    const removed = foldDescendantsOf('adam');
    expect(removed).toBeGreaterThanOrEqual(5);
    expect(ids()).toEqual(['adam', 'iisus']);
    expect(Object.keys(expanded.peek())).toEqual([]);
    expect(show.peek().kind).toBe('set');
  });

  it('Иаков: сначала жёны (четыре), следующий шаг — все дети', () => {
    startWith('iakov');
    expect(unionsOf('iakov').length).toBeGreaterThan(1);
    expect(stepForward('iakov')).toBe('spouses');
    for (const w of ['liya', 'rakhil', 'valla', 'zelfa']) expect(workSet.peek().has(w), w).toBe(true);
    expect(workSet.peek().has('iuda')).toBe(false);
    expect(opened.peek()).toContain('iakov');
    expect(mapCmds('iakov').forward?.kind).toBe('kids');
    expect(stepForward('iakov')).toBe('kids');
    for (const k of ['ruvim', 'iuda', 'iosif', 'veniamin', 'dan', 'asir']) expect(workSet.peek().has(k), k).toBe(true);
    expect(mapCmds('iakov').forward).toBeNull();
  });

  it('шаг назад: родители, братья и сёстры; свёртка предков их убирает, лицо остаётся', () => {
    startWith('iakov');
    expect(mapCmds('iakov').back).toBeGreaterThan(0);
    expect(stepBack('iakov')).toBe('parents');
    for (const x of ['isaak', 'revekka', 'isav']) expect(workSet.peek().has(x), x).toBe(true);
    expect(stepBack('isaak')).toBe('parents');
    expect(workSet.peek().has('avraam')).toBe(true);
    expect(mapCmds('iakov').foldAnc).toBe(true);
    foldAncestorsOf('iakov');
    expect(ids()).toEqual(['iakov']);
  });

  it('свёртка предков лица, раскрытого от родителя: лицо закрепляется, закреплённый Адам остаётся, промежуточные уходят', () => {
    stepForward('adam');
    stepForward('sif');
    stepForward('enos');
    expect(workSet.peek().has('kainan')).toBe(true);
    foldAncestorsOf('kainan');
    expect(workSet.peek().get('kainan')?.via).toBe('self');
    expect(workSet.peek().has('adam')).toBe(true);
    expect(workSet.peek().has('iisus')).toBe(true);
    for (const x of ['sif', 'enos', 'eva', 'kain', 'avel']) expect(workSet.peek().has(x), x).toBe(false);
  });

  it('свёртка потомков: супруг со своей роднёй на карте остаётся (Ревекка при Вафуиле)', () => {
    startWith('isaak', 'vafuil');
    stepForward('vafuil');
    expect(workSet.peek().has('revekka')).toBe(true);
    stepForward('isaak');
    expect(workSet.peek().has('iakov')).toBe(true);
    foldDescendantsOf('isaak');
    expect(workSet.peek().has('iakov')).toBe(false);
    expect(workSet.peek().has('revekka')).toBe(true);
  });

  it('«только это лицо»: со всего неба и с карты — на карте одно лицо, небо — «набор»', () => {
    stepForward('adam');
    foldMapTo('sif');
    expect(ids()).toEqual(['sif']);
    expect(workSet.peek().get('sif')?.via).toBe('self');
    setShowState({ kind: 'all' });
    foldMapTo('david');
    expect(ids()).toEqual(['david']);
    expect(show.peek().kind).toBe('set');
  });

  it('набор из ссылки не меняется шагами (решение 45)', () => {
    linkSet.value = new Map([self('noy')]);
    expect(stepForward('noy')).toBe('none');
    expect(foldDescendantsOf('noy')).toBe(0);
    linkSet.value = null;
  });
});

/**
 * Рецензия этапа 21 (библеист): шаг называет супругов словами текста, раскрывает только детей, а не «из сыновей» и не
 * усыновлённых, два прочтения Лк 3:23 — одно, по переключателю; свёртка одного прочтения не убирает другого.
 */
describe('правда шагов (рецензия этапа 21)', () => {
  beforeEach(() => startWith('adam', 'iisus'));

  it('Давид: «Все дети» — без Исмаила, сына Нафании, и Хаттуша («из сыновей Давида»); Иаков — без усыновлённых Ефрема и Манассии', () => {
    startWith('david');
    stepForward('david');
    stepForward('david');
    expect(workSet.peek().has('solomon') || workSet.peek().has('solomon-tsar') || [...workSet.peek().keys()].some((x) => x.startsWith('solomon'))).toBe(true);
    expect(workSet.peek().has('ismail-syn-nafanii')).toBe(false);
    expect(workSet.peek().has('khattush-iz-synovey-davida')).toBe(false);
    startWith('iakov');
    stepForward('iakov');
    stepForward('iakov');
    expect(workSet.peek().has('iosif')).toBe(true);
    expect(workSet.peek().has('efrem')).toBe(false);
    expect(workSet.peek().has('manassiya')).toBe(false);
  });

  it('Илий: по умолчанию (Лк 3 — родословие Марии) шаг вперёд раскрывает Марию, при переключателе — Иосифа; не обоих', async () => {
    const { lineFlip } = await import('../src/state.ts');
    startWith('iliy-otets-marii');
    stepForward('iliy-otets-marii');
    expect(workSet.peek().has('mariya')).toBe(true);
    expect(workSet.peek().has('iosif-muzh-marii')).toBe(false);
    lineFlip.value = true;
    try {
      startWith('iliy-otets-marii');
      stepForward('iliy-otets-marii');
      expect(workSet.peek().has('iosif-muzh-marii')).toBe(true);
      expect(workSet.peek().has('mariya')).toBe(false);
    } finally {
      lineFlip.value = false;
    }
  });

  it('свёртка потомков Каинана (Лк 3:36) не убирает Салу, пока на карте Арфаксад (Быт 11:12); свёртка Арфаксада — убирает', () => {
    startWith('arfaksad');
    stepForward('arfaksad');
    expect(workSet.peek().has('sala')).toBe(true);
    expect(workSet.peek().has('kainan-syn-arfaksada')).toBe(true);
    foldDescendantsOf('kainan-syn-arfaksada');
    expect(workSet.peek().has('sala')).toBe(true);
    foldDescendantsOf('arfaksad');
    expect(workSet.peek().has('sala')).toBe(false);
    expect(workSet.peek().has('kainan-syn-arfaksada')).toBe(false);
  });

  // Валла — «в жену» (Быт 30:4) и «наложница» (Быт 35:22): в данных — наложница с этой заметкой
  it('слова супругов — по тексту: Иаков — «Жёны и наложница (4)», Лот — «Жена и матери детей (3)», Иуда — «Жена и мать детей (2)», Фамарь — «Мужья и отец детей (3)»', async () => {
    const { forwardLabel } = await import('../src/ui/sky/text.ts');
    const label = (id: string) => {
      startWith(id);
      const f = mapCmds(id).forward;
      return f ? forwardLabel(id, f) : '';
    };
    expect(label('iakov')).toBe('Жёны и наложница (4)');
    expect(label('lot')).toBe('Жена и матери детей (3)');
    expect(label('iuda')).toBe('Жена и мать детей (2)');
    expect(label('famar')).toBe('Мужья и отец детей (3)');
    expect(label('adam')).toBe('Жена и дети');
  });
});
