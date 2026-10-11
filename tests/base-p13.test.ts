/**
 * Пункт П1-3 очереди (reviews/сцены-пакет-1-второй-ключ.md, № 1–4; решения координатора): правило 26 — лицо, которое только
 * «назван», не главное; Раав без роли «праматерь»; эпохи 6–16 — в виде Д6 без готовых лет. Шаги — tools/base/corrections-p13.ts.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Base } from '../tools/base/migrate.ts';
import { loadBase, validate } from '../tools/base/validate.ts';
import { validateStories } from '../tools/base/stories.ts';
import type { Story } from '../tools/base/types.ts';

let base: Base;
beforeAll(() => {
  base = loadBase();
});

const mk = (o: Partial<Story> & { id: string }): Story => ({
  level: 'story', kind: 'event', title: { short: 'Подать кесарю', by: 'atlas' }, accounts: [{ refs: ['Мф 22:15-22'], cert: 'scripture' }],
  actors: [], places: [], links: [], source: { method: 'reading' }, ...o,
} as Story);
const mainWarnings = (s: Story) => {
  const w: string[] = [];
  validateStories({ ...base, stories: [s], verseClasses: [], textParallels: [], storyChapters: [] }, () => {}, (c, wh) => c === 'история: главные лица' && w.push(wh));
  return w;
};

describe('П1-3: правило 26 и данные', () => {
  it('лицо из названия, которое только «назван» (в чужой речи), — не главное: кесарь в «Подать кесарю»', () => {
    const kesar = { actor: 'new:kesar', label: 'кесарь', kind: 'human' as const, roles: [{ role: 'mentioned' as const }], mode: 'in-speech' as const, refs: ['Мф 22:17'], cert: 'scripture' as const };
    expect(mainWarnings(mk({ id: 'e-k1', actors: [kesar] }))).toEqual([]);
    // то же лицо с ролью «действует» — главное: без main — замечание
    expect(mainWarnings(mk({ id: 'e-k2', actors: [{ ...kesar, roles: [{ role: 'agent' }], mode: undefined }] }))).toEqual(['e-k2 участник new:kesar «кесарь»']);
  });

  it('«Притчи первосвященникам и фарисеям» — main у группы из названия; Раав — без роли «праматерь» и без формы «Раава»', () => {
    const s = base.stories!.find((x) => x.id === 'e-pritchi-pervosvyashchennikam-i-fariseyam')!;
    expect(s.actors.find((a) => a.actor === 'new:pervosvyashchenniki-i-farisei-mf21')!.main).toBe(true);
    const raav = base.volumes.flatMap((v) => v.actors).find((a) => a.id === 'p-raav')!;
    expect(raav.roles ?? []).not.toContain('matriarch');
    expect(raav.names.map((n) => n.form)).toEqual(['Раав']);
  });

  it('эпохи 6–16 — вид Д6: определение, граница событием со стихом, без готовых лет; граница без стиха — только условная', () => {
    const ids = ['era-conquest', 'era-judges', 'era-united', 'era-divided', 'era-judah-alone', 'era-exile', 'era-return', 'era-intertestamental', 'era-christ', 'era-apostolic', 'era-church'];
    for (const id of ids) {
      const e = base.epochs.find((x) => x.id === id) as any;
      expect([id, typeof e.start, !!e.definition]).toEqual([id, 'object', true]);
      expect([id, JSON.stringify(e).match(/"(year|start|end|startEst|endEst)":-?\d/)]).toEqual([id, null]);
    }
    const eras = Object.fromEntries(base.epochs.map((e) => [e.id, e as any]));
    expect(eras['era-divided'].end.rule).toMatchObject({ anchor: 'an-samaria' });
    expect(eras['era-judges'].boundary).toBe('estimated');
    expect(eras['era-church'].boundary).toBe('conventional');
    expect(validate(base).filter((i) => i.level === 'error' && i.check === 'эпоха')).toEqual([]);
    // граница без стиха у неусловной эпохи — ошибка
    const b = structuredClone(base);
    (b.epochs.find((x) => x.id === 'era-church') as any).boundary = 'estimated';
    expect(validate(b).some((i) => i.level === 'error' && i.where === 'эпоха era-church' && /без события или стиха/.test(i.msg))).toBe(true);
  });
});
