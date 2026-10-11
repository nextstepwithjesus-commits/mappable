/**
 * Задача данных Д-р11 (reviews/очередь-спорных-мест.md): форма имени стоит в стихе своей ссылки — вне скобок,
 * с учётом падежей. Шаг — tools/base/corrections-d-r11.ts; отчёт — docs/app/reviews/Д-р11-отчёт.md.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Base } from '../tools/base/migrate.ts';
import { loadBase, validate } from '../tools/base/validate.ts';
import type { Actor } from '../tools/base/types.ts';
import { formMissing, norm } from '../src/engine/text.ts';

let base: Base;
let actors: Map<string, Actor>;
const refs = (id: string, form: string) => actors.get(id)!.names.find((n) => n.form === form)!.refs;

beforeAll(() => {
  base = loadBase();
  actors = new Map(base.volumes.flatMap((v) => v.actors).map((a) => [a.id, a]));
});

describe('Д-р11: форма имени — в стихе своей ссылки', () => {
  it('три места из очереди: Павел, Евника, «Ирод царь»', () => {
    expect(refs('p-pavel', 'Павел')).toEqual(['Деян 13:9']);
    expect(refs('p-evnika', 'Евника')).toEqual(['2Тим 1:5']);
    expect(refs('p-irod-antipa', 'Ирод царь')).toEqual(['Мк 6:14']);
    // «Савл» по-прежнему с Деян 7:58: там он и назван
    expect(refs('p-pavel', 'Савл')).toContain('Деян 7:58');
  });

  it('лишние ссылки многословных форм сняты; основная форма — со стихом, где стоит она сама', () => {
    expect(refs('p-avraam', 'друг Божий')).toEqual(['Иак 2:23']);
    expect(refs('p-avraam', 'Авраам')).toEqual(['Быт 17:5']);
    expect(refs('p-avraam', 'Аврам')).toContain('Быт 11:26');
    expect(refs('p-iofor', 'Иофор')).toEqual(['Исх 3:1']);
  });

  it('сравнение форм: падежи, порядок слов, многословные формы', () => {
    expect(formMissing('Ирод царь', norm('Царь Ирод, услышав об Иисусе'))).toEqual([]);
    expect(formMissing('Ирод царь', norm('И опечалился царь'))).toEqual(['ирод']);
    expect(formMissing('друг Божий', norm('Авраама, друга Моего'))).toEqual(['божий']);
    expect(formMissing('Иеремия Анафофский', norm('почему же ты не запретишь Иеремии Анафофскому'))).toEqual([]);
    expect(formMissing('Самуил провидец', norm('в записях Самуила провидца'))).toEqual([]);
  });

  it('валидатор: ссылка формы на стих без неё — ошибка; имя только в скобках — тоже', () => {
    const b = structuredClone(base);
    const a = b.volumes.flatMap((v) => v.actors).find((x) => x.id === 'p-pavel')!;
    a.names[0].refs = ['Деян 7:58'];
    const i = b.volumes.flatMap((v) => v.actors).find((x) => x.id === 'p-iofor')!;
    i.names[0].refs = ['Исх 2:16'];
    const errs = validate(b).filter((x) => x.level === 'error' && x.check === 'имя в стихе').map((x) => x.where);
    expect(errs).toEqual(expect.arrayContaining(['p-pavel «Павел»', 'p-iofor «Иофор»']));
  }, 60_000);

  it('в собранной базе ошибок «имя в стихе» нет', () => {
    expect(validate(base).filter((x) => x.check === 'имя в стихе')).toEqual([]);
  }, 60_000);
});
