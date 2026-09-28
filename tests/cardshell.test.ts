/**
 * Оболочка карточки (этап 7, K2): стопка как вкладки, свёрнутая карточка — корешок в сетке, полоса 66 книг, паспорт,
 * мини-шкала, выбор «Взять в работу», «почему лицо в наборе». Без браузера; поведение в браузере — сценарии 230–239
 * (tools/accept/cardshell.ts). Нужна свежая сборка данных: npm run -s data.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToString } from 'preact-render-to-string';
import { h, type VNode } from 'preact';
import { afterClose, clipWords, stackSummaryHead, cardFolded, cardStack, STACK_MAX, pushCard } from '../src/ui/stack.ts';
import { gridFor, panelKind, unfoldCard, SPINE_W, grid } from '../src/ui/layout.ts';
import { panel, selected, model } from '../src/state.ts';
import { contrast } from '../src/ui/contrast.ts';
import { byId, persons, loadCard } from '../src/data/atlas.ts';
import { Masthead, peopleTime, lifeBarLabels } from '../src/ui/card/Masthead.tsx';
import { viaText, onlyLabel } from '../src/ui/panels/Work.tsx';
import { passport } from './helpers/cards.ts';

const css = (f: string) => readFileSync(join(__dirname, '../src/styles', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('стопка карточек как вкладки (решение 18; IX-52, UX-49)', () => {
  it('«×» активной: она уходит из стопки, активной становится самая недавняя из оставшихся', () => {
    expect(afterClose(['moisey', 'ruf', 'avraam', 'david'], 'moisey', 'moisey')).toEqual({ stack: ['ruf', 'avraam', 'david'], next: 'ruf' });
  });
  it('последняя карточка закрывается совсем; закрытая не возвращается при следующем выборе', () => {
    expect(afterClose(['david'], 'david', 'david')).toEqual({ stack: [], next: null });
    // следующий выбор кладёт в стопку только новое лицо
    expect(pushCard('ruf', afterClose(['david'], 'david', 'david').stack)).toEqual(['ruf']);
  });
  it('«×» строки списка убирает только её: активная остаётся', () => {
    expect(afterClose(['moisey', 'ruf', 'david'], 'moisey', 'ruf')).toEqual({ stack: ['moisey', 'david'], next: 'moisey' });
  });
  it('не больше шести карточек; стопка вне браузера пуста', () => {
    let st: string[] = [];
    for (const id of ['adam', 'sif', 'enos', 'kainan', 'maleleil', 'iared', 'enokh']) st = pushCard(id, st);
    expect(st.length).toBe(STACK_MAX);
    expect(cardStack.value).toEqual([]);
  });
  it('строка «Ещё открыты (N):» согласована с «карточка»', () => {
    expect(stackSummaryHead(1)).toBe('Ещё открыта (1):');
    expect(stackSummaryHead(5)).toBe('Ещё открыты (5):');
  });
  it('уточнение в строке стопки — целыми словами, не посреди слова (VIS-48, CARD-52)', () => {
    expect(clipWords('муж Марии', 40)).toBe('муж Марии');
    const long = 'Моавитянка, жена Махлона, затем Вооза, прабабушка Давида';
    const c = clipWords(long, 40)!;
    expect(c.length).toBeLessThanOrEqual(40);
    expect(c.endsWith('…')).toBe(true);
    // до многоточия — целые слова исходной строки, без висящей запятой
    const body = c.slice(0, -1);
    expect(long.startsWith(body)).toBe(true);
    expect(/[\s,]$/.test(body)).toBe(false);
    expect([' ', ','].includes(long[body.length])).toBe(true);
    expect(clipWords('Сверхдлинноеоднословноеуточнениебезпробелов', 10)).toBeNull();
  });
});

describe('свёрнутая карточка — корешок 56 px, небо занимает место (VIS-44, UX-50; решение 18)', () => {
  const WIDTHS = [900, 1024, 1280, 1440, 1920];
  it('без панели: корешок 56 px, остальное — небо', () => {
    for (const W of WIDTHS) expect(gridFor(W, 'none', true, { folded: true }), `${W}`).toMatchObject({ folio: SPINE_W, spine: true, folded: true, sky: W - SPINE_W, sheet: 0 });
  });
  it('с панелью: панель остаётся колонкой, небо шире, чем при развёрнутой карточке; сумма — ширина окна', () => {
    for (const W of WIDTHS)
      for (const p of ['kinship', 'index'] as const) {
        const open = gridFor(W, panelKind(p), true);
        const fold = gridFor(W, panelKind(p), true, { folded: true });
        expect(fold.sheet + fold.sky + fold.folio, `${W} ${p}`).toBe(W);
        expect(fold.folio).toBe(SPINE_W);
        expect(fold.sky, `${W} ${p}`).toBeGreaterThanOrEqual(open.sky);
        expect(fold.sky).toBeGreaterThanOrEqual(W * 0.4);
      }
  });
  it('без карточки «свёрнуто» ничего не значит; на телефоне — лист', () => {
    expect(gridFor(1440, 'none', false, { folded: true })).toMatchObject({ folio: 0, spine: false });
    expect(gridFor(390, 'none', true, { folded: true })).toMatchObject({ phone: true, folio: 0 });
  });
  it('«развернуть» на корешке: свёрнутую — развернуть; если места всё равно нет (широкая панель) — закрыть и панель', () => {
    selected.value = 'david';
    panel.value = null;
    cardFolded.value = true;
    expect(grid.peek().spine).toBe(true);
    unfoldCard();
    expect(cardFolded.value).toBe(false);
    expect(grid.peek().spine).toBe(false);
    // широкая панель на 1440 сама сворачивает карточку в корешок (C1)
    panel.value = 'synopsis';
    cardFolded.value = true;
    unfoldCard();
    expect(cardFolded.value).toBe(false);
    expect(panel.value).toBe(null);
    // корешок только по нехватке места — «развернуть» закрывает панель, как прежде
    panel.value = 'index';
    expect(grid.peek().spine).toBe(true);
    unfoldCard();
    expect(panel.value).toBe(null);
    selected.value = null;
  });
});

describe('полоса 66 книг (CARD-49, VIS-43)', () => {
  /** Специфичность простого селектора: [id, классы и атрибуты, элементы]. */
  const spec = (sel: string): [number, number, number] => {
    const s = sel.replace(/::?[a-z-]+(\([^)]*\))?/g, (m) => (m.startsWith('::') ? ' x' : ' .p'));
    return [(s.match(/#/g) ?? []).length, (s.match(/\.[\w-]+|\[[^\]]+\]/g) ?? []).length, (s.match(/(^|[\s>+~])[a-z]+/gi) ?? []).length];
  };
  const cmp = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  it('ступени 1–4 не слабее клетки без упоминаний: иначе её фон перебивает ступени', () => {
    const src = css('folio.css');
    const rules = [...src.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
    const base = rules.find((r) => /\.canon \.cg > span$/.test(r.sel) && /background/.test(r.body));
    expect(base, 'правило клетки без упоминаний').toBeTruthy();
    for (const n of [1, 2, 3, 4]) {
      const r = rules.find((x) => x.sel.split(',').some((s) => new RegExp(`\\.canon\\b.*\\.l${n}$`).test(s.trim())) && /background/.test(x.body));
      expect(r, `правило ступени ${n}`).toBeTruthy();
      const sel = r!.sel.split(',').map((s) => s.trim()).find((s) => new RegExp(`\\.l${n}$`).test(s))!;
      expect(cmp(spec(sel), spec(base!.sel)), `${sel} слабее ${base!.sel}`).toBeGreaterThanOrEqual(0);
    }
  });
  it('соседние ступени различимы: не меньше 1,3 : 1 в обеих темах', () => {
    const tokens = readFileSync(join(__dirname, '../src/styles/tokens.css'), 'utf8');
    const theme = (name: string) => {
      const body = new RegExp(`:root\\[data-map='${name}'\\]\\s*\\{([^}]*)\\}`).exec(tokens)![1];
      const get = (t: string) => new RegExp(`${t}:\\s*(#[0-9a-f]{6})`, 'i').exec(body)![1];
      return { ink: get('--ink'), bg: get('--sheet-2') };
    };
    const src = css('folio.css');
    const pct = [1, 2, 3].map((n) => Number(new RegExp(`\\.l${n}\\s*\\{\\s*background:\\s*color-mix\\(in srgb, var\\(--ink\\) (\\d+)%`).exec(src)![1]) / 100);
    const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const mix = (a: string, b: string, p: number) => `#${hex(a).map((v, i) => Math.round(v * p + hex(b)[i] * (1 - p)).toString(16).padStart(2, '0')).join('')}`;
    for (const name of ['night', 'day']) {
      const { ink, bg } = theme(name);
      const steps = [bg, ...pct.map((p) => mix(ink, bg, p)), ink];
      for (let i = 1; i < steps.length; i++) expect(contrast(steps[i], steps[i - 1]), `${name}: ступени ${i - 1} и ${i}`).toBeGreaterThanOrEqual(1.3);
    }
  });
});

describe('шапка карточки (VIS-41, CARD-59, MOB-52, VIS-06)', () => {
  it('паспорт: колонка подписей постоянной ширины — по самой длинной подписи паспорта (VIS-70); подпись переносится, а не налезает на значение', () => {
    const src = css('folio.css');
    const b = /(^|\n)\.passport\s*\{([^}]*)\}/.exec(src)![2];
    // 88 px при обычном кегле (5,5rem = 88 px); при крупном шрифте читателя колонка растёт вместе с ним (MOB-71)
    expect(b).toMatch(/grid-template-columns:\s*max\(88px, 5\.5rem\) minmax\(0, 1fr\)/);
    const dt = /(^|\n)\.passport dt\s*\{([^}]*)\}/.exec(src)![2];
    expect(dt).not.toMatch(/nowrap/);
  });
  it('эпохи в паспорте видно только полосой мини-шкалы: строка «Эпоха» — для диктора; строки-легенды лент нет', async () => {
    await loadCard('david');
    const html = renderToString(h(Masthead, { id: 'david' }) as VNode);
    expect(html).toMatch(/<div class="visually-hidden"><dt>Эпоха<\/dt>/);
    expect(html).not.toMatch(/class="lines"/);
    expect(html).not.toMatch(/линия Иосифа/);
    // созвездие не повторяет колено: «Колено Иудино» и «колено Иудино» — одна строка
    const judahite = persons.find((p) => p.group === 'judah' && (byId.get(p.id)?.roles.length ?? 0) >= 0 && p.kind === 'person' && p.id !== 'iuda');
    if (judahite) {
      const pp = await passport(judahite.id);
      if (pp.get('Колено / народ') === 'колено Иудино') expect(pp.has('Созвездие')).toBe(false);
    }
  });
  it('народы и роды — без года: строка «Время» вместо «Годы», глагол по имени (CARD-59; решение 23)', async () => {
    const peoples = persons.filter((p) => p.kind === 'people' || p.kind === 'clan');
    expect(peoples.length).toBeGreaterThan(10);
    for (const p of peoples.slice(0, 40)) {
      const pp = await passport(p.id);
      expect(pp.has('Годы'), p.id).toBe(false);
      expect(pp.get('Время'), p.id).toMatch(/^назван[ыа]?\sв\sродословии,\sбез\sгода/);
      expect(pp.get('Время')).not.toMatch(/\d/);
    }
    expect(peopleTime('ludim')).toMatch(/^названы\sв\sродословии,\sбез\sгода;\sэпоха\s—\s/);
  });
  it('мини-шкала: эра — не у года конца жизни (её ставит крайняя правая подпись оси), у начала — только при переходе через эру', () => {
    const m = model.value;
    const d = lifeBarLabels(m.chrono.get('david')!);
    expect(d.right).toMatch(/^ок\.\s970$/);
    expect(d.left).not.toMatch(/Р\./);
    const j = lifeBarLabels(m.chrono.get('iisus')!);
    expect(j.left).toMatch(/до\sР\.\sХ\.$/);
    expect(j.right).not.toMatch(/Р\./);
  });
});

describe('«Взять в работу» и панель «В работе» (VIS-47, CARD-75; решение 26)', () => {
  it('«Только Давида» — имя склоняется функцией; не склоняется — «Только это лицо»', () => {
    expect(onlyLabel('david')).toBe('Только Давида');
    expect(onlyLabel('ruf')).toBe('Только Руфи');
    const unnamed = persons.find((p) => byId.get(p.id)?.unnamed);
    expect(unnamed).toBeTruthy();
    expect(onlyLabel(unnamed!.id)).toBe('Только это лицо');
  });
  it('почему лицо в наборе: «семья Руфи», «предок Давида, 2-е поколение», «путь родства от Руфи»; взятое само — без строки', () => {
    expect(viaText({ via: 'family', of: 'ruf', gen: 1 })).toBe('семья Руфи');
    expect(viaText({ via: 'anc', of: 'david', gen: 2 })).toBe('предок Давида, 2-е поколение');
    expect(viaText({ via: 'desc', of: 'david', gen: 1 })).toBe('потомок Давида, 1-е поколение');
    expect(viaText({ via: 'path', of: 'ruf' })).toBe('путь родства от Руфи');
    expect(viaText({ via: 'self', of: 'ruf' })).toBeNull();
    // имя, которое надёжно не склоняется, — после двоеточия, в именительном падеже
    const unnamed = persons.find((p) => byId.get(p.id)?.unnamed)!;
    expect(viaText({ via: 'family', of: unnamed.id })).toBe(`семья: ${unnamed.name}`);
  });
});
