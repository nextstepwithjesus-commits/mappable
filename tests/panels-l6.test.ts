/**
 * Панели круга 3 (L6): «Указатель» — годы не налезают на координату (VIS-61, UX-78, CARD-89); синопсис — ссылки
 * в клетках (CARD-90), общее имя на оси имён (VIS-78), имена на телефоне (MOB-62); верхняя строка — «Эпохи»
 * (решение 51) и пояснение «В работе» (UX-77). Поведение в браузере — сценарии 390–409 (tools/accept/find3.ts).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { shortRef } from '../src/ui/panels/Synopsis.tsx';
import { HINTS, phoneMenuItems } from '../src/ui/top/TopBar.tsx';
import { WORK_LEAD } from '../src/ui/panels/Work.tsx';

const css = (f: string) => readFileSync(join(__dirname, '../src/styles', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** Тело первого правила с точно таким селектором (вне @media и внутри — как найдётся первым). */
function rule(src: string, selector: string): string {
  const m = new RegExp(`(^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(src);
  if (!m) throw new Error(`нет правила ${selector}`);
  return m[2];
}

describe('«Указатель»: у координаты свой столбец, годы переносятся (VIS-61, UX-78, CARD-89)', () => {
  const panels = css('panels.css');
  it('строка — два столбца: текст статьи и координата; координата — по последней строке', () => {
    const b = rule(panels, '.idx .row');
    expect(b).toMatch(/display:\s*grid/);
    expect(b).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+44px/);
    expect(b).toMatch(/align-items:\s*last baseline/);
  });
  it('строка лет — своей строкой и переносится, неразрывны только «ок. 815 г.» (типографика)', () => {
    const b = rule(panels, '.idx .sub .yrs');
    expect(b).toMatch(/display:\s*block/);
    expect(b).toMatch(/white-space:\s*normal/);
  });
  it('отточие — от конца текста до столбца координаты', () => {
    expect(rule(panels, '.idx .row .lead')).toMatch(/overflow:\s*hidden/);
    const b = rule(panels, '.idx .row .lead::after');
    expect(b).toMatch(/border-bottom:\s*1px dotted var\(--ink-3\)/);
    expect(b).toMatch(/width:\s*100%/);
    expect(b).toMatch(/margin:\s*0 -100% 0 4px/);
    expect(panels).not.toMatch(/lead-dots/);
  });
});

describe('синопсис (CARD-90, VIS-78, MOB-62)', () => {
  it('ссылка в клетке — у каждого стиха своя глава: «1:18; 1:24», тире в промежутке', () => {
    expect(shortRef('1Пар 1:18,24')).toBe('1:18; 1:24');
    expect(shortRef('Быт 11:12-13')).toBe('11:12–13');
    expect(shortRef('Руф 4:18-22')).toBe('4:18–22');
    expect(shortRef('1Пар 3:19')).toBe('3:19');
  });
  it('общее имя — на оси имён Матфея, а не по середине двух столбцов', () => {
    expect(rule(css('panels.css'), '.sheet .synopsis .nm.both')).toMatch(/text-align:\s*left/);
  });
  it('пометы столбцов Ветхого Завета — одним начертанием со стихами (Jost, --ink-2)', () => {
    const b = rule(css('panels.css'), '.synopsis .ot .odd-note,\n.synopsis .via');
    expect(b).toMatch(/font-family:\s*var\(--sans\)/);
    expect(b).toMatch(/font-style:\s*normal/);
    expect(b).toMatch(/color:\s*var\(--ink-2\)/);
  });
  it('узкий синопсис: у имён линий поле 8 px справа, столбцы номеров и стихов уже', () => {
    const narrow = css('panels.css').split('@container (max-width: 560px)')[1] ?? '';
    expect(rule(narrow, '.sheet .synopsis .split .nm')).toMatch(/padding-right:\s*8px/);
    expect(rule(narrow, '.synopsis col.c-ot')).toMatch(/width:\s*46px/);
  });
});

describe('верхняя строка: «Эпохи» и «В работе» (решение 51; UX-77)', () => {
  it('«Эпохи» — команда верхней строки и пункт меню телефона', () => {
    const items = phoneMenuItems(null, false, () => {}, () => {});
    expect(items.map((i) => i.label)).toContain('Эпохи');
    expect(HINTS.epochs).toMatch(/^Эпохи с годами и основаниями/);
  });
  it('пояснение «В работе» — те же слова, что вводка панели: набор помнится в этом браузере', () => {
    expect(HINTS.work).toBe(WORK_LEAD.replace(/\.$/, ''));
    expect(HINTS.work).toMatch(/набор помнится в этом браузере/);
    expect(HINTS.work).not.toMatch(/сеанс/);
  });
});
