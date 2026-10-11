/**
 * Выгрузка GEDCOM 5.5.1 (03 § 22.3; спецификация https://gedcom.io/specifications/ged551.pdf) и проверка файла.
 *
 * Правила честности (НИ4-1 … НИ4-4): стих связи «родитель — ребёнок» — у события рождения (`BIRT` с `FAMC`), у `FAMC` источника
 * нет; приёмное — `ADOP`; `MARR` — только при слове брака; «наложница» — `EVEN`; «браком не назван» и «союз без брака» — `FAM`
 * без события брака и `NOTE`; одна `FAM` на каждую известную мать; ребёнок без названной матери — своя `FAM`; Иосиф у Иисуса
 * Христа (`parents-word`) — `ASSO`, не `FAMC`; ребро другого прочтения — `NOTE`; «из сыновей» — `ASSO`; одно прочтение — текущее.
 *
 * Проверка `проверитьGedcom` повторяет то, что проверяет GED-inline (https://ged-inline.org) для 5.5.1 lineage-linked: строение
 * строк, уровни, длины, указатели и их типы, взаимность FAMS/FAMC — CHIL/HUSB/WIFE, допустимые подструктуры и значения.
 * Сам GED-inline — служба на сервере: файл туда отправляет человек (выгрузка лежит рядом, README).
 */
import type { Граф, Выбор } from './граф.ts';

export interface ОпцииGed { выбор?: Выбор; дата?: string; описание?: string }

const QUAY = (u: string) => (u === 'scripture' ? '3' : u === 'inference' ? '2' : '');

/** Строки с переносом CONC: строка не длиннее 255 знаков (по знакам, не байтам; границы суррогатов не режутся). */
function строки(уровень: number, тег: string, значение: string, out: string[], xref = '') {
  const голова = `${уровень} ${xref ? `${xref} ` : ''}${тег}`;
  const max = 255 - голова.length - 1;
  const chars = [...значение.replace(/\r?\n/g, ' ')];
  if (chars.length <= max) { out.push(значение ? `${голова} ${chars.join('')}` : голова); return; }
  let i = 0;
  // первая часть
  let part = chars.slice(0, max);
  while (part.length > 1 && (part.at(-1) === ' ' || chars[i + part.length] === ' ')) part = part.slice(0, -1); // CONC не режет у пробела
  out.push(`${голова} ${part.join('')}`);
  i = part.length;
  const maxC = 255 - `${уровень + 1} CONC `.length;
  while (i < chars.length) {
    let p = chars.slice(i, i + maxC);
    while (i + p.length < chars.length && p.length > 1 && (p.at(-1) === ' ' || chars[i + p.length] === ' ')) p = p.slice(0, -1);
    out.push(`${уровень + 1} CONC ${p.join('')}`);
    i += p.length;
  }
}

/**
 * Выгрузка набора лиц: лица, их семьи внутри набора и связи. Родители вне набора не выгружаются (как «видимая ветвь»).
 */
export function выгрузитьGedcom(г: Граф, набор: Iterable<number>, о: ОпцииGed = {}): string {
  const выбор = о.выбор ?? {};
  const к = г.кровь(выбор);
  const лица = [...new Set(набор)].sort((a, b) => a - b);
  const есть = new Set(лица);
  const xI = new Map(лица.map((p, i) => [p, `@I${i + 1}@`]));
  // семьи: ключ «отец|мать»; −1 — не назван; ребёнок без названной матери — своя семья
  interface Fam { xref: string; муж: number; жена: number; дети: number[]; союз?: number; приёмная?: 'HUSB' | 'WIFE' }
  const семьи = new Map<string, Fam>();
  let nf = 0;
  const семья = (ключ: string, муж: number, жена: number): Fam => {
    let f = семьи.get(ключ);
    if (!f) { f = { xref: `@F${++nf}@`, муж, жена, дети: [] }; семьи.set(ключ, f); }
    return f;
  };
  const famcРождения = new Map<number, Fam>();
  for (const c of лица) {
    const fe = к.отец[c], me = к.мать[c];
    const f = fe >= 0 && есть.has(г.рёбра[fe].род) ? г.рёбра[fe].род : -1;
    const m = me >= 0 && есть.has(г.рёбра[me].род) ? г.рёбра[me].род : -1;
    if (f < 0 && m < 0) continue;
    const ключ = f >= 0 && m < 0 ? `${f}|-|${c}` : `${f}|${m}`;
    const fam = семья(ключ, f, m);
    fam.дети.push(c);
    famcРождения.set(c, fam);
  }
  for (const u of г.союзы) {
    if (!есть.has(u.муж) || !есть.has(u.жена)) continue;
    семья(`${u.муж}|${u.жена}`, u.муж, u.жена).союз = u.i;
  }
  for (const f of семьи.values()) if (f.союз === undefined && f.муж >= 0 && f.жена >= 0) {
    const u = г.союзы.find((x) => x.муж === f.муж && x.жена === f.жена);
    if (u) f.союз = u.i;
  }
  // приёмные: семья с одним приёмным родителем
  const приём = new Map<number, { fam: Fam; e: number }>();
  for (const e of г.рёбра) {
    if (e.вид !== 'adoptive' || !есть.has(e.реб) || !есть.has(e.род)) continue;
    const fam = семья(`adop|${e.i}`, e.роль === 'f' ? e.род : -1, e.роль === 'm' ? e.род : -1);
    fam.приёмная = e.роль === 'f' ? 'HUSB' : 'WIFE';
    fam.дети.push(e.реб);
    приём.set(e.реб, { fam, e: e.i });
  }
  const famsOf = new Map<number, Fam[]>();
  for (const f of семьи.values()) for (const p of [f.муж, f.жена]) if (p >= 0) { if (!famsOf.has(p)) famsOf.set(p, []); famsOf.get(p)!.push(f); }

  const out: string[] = [];
  const дата = о.дата ?? new Date().toISOString().slice(0, 10);
  const месяцы = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const [Y, M, D] = дата.split('-').map(Number);
  const gdate = `${D} ${месяцы[M - 1]} ${Y}`;
  out.push('0 HEAD', '1 SOUR BIBLIYA_NAGLYADNO', '2 VERS 0.2', '2 NAME Библия наглядно (серый макет)', '2 DATA Библия наглядно, проба данных');
  out.push(`3 DATE ${gdate}`);
  строки(3, 'COPR', 'Текст: Синодальный перевод (1876), общественное достояние; электронный текст scrollmapper/bible_databases, MIT. Данные: проба, записи не проверены вторым ключом.', out);
  out.push(`1 DATE ${gdate}`, '1 SUBM @U1@', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8', '1 LANG Russian');
  const прочтение = [...г.наборы.values()].filter((н) => выбор[н.id] && выбор[н.id] !== н.поУмолчанию).map((н) => `${н.название}: ${выбор[н.id]}`).join('; ') || 'по умолчанию';
  строки(1, 'NOTE', `${о.описание ?? 'Выгрузка Генеалогии'}. Прочтение: ${прочтение}. Отпечаток базы: ${г.база}. Не выгружено как родство: другие прочтения, толкования, тождество «предположительно», ребро Иосифа у Иисуса Христа (связь ASSO).`, out);
  out.push('0 @U1@ SUBM', '1 NAME Библия наглядно');
  out.push('0 @S1@ SOUR', '1 TITL Синодальный перевод Библии (1876)', '1 ABBR Синодальный перевод');
  строки(1, 'NOTE', 'Общественное достояние. Электронный текст: scrollmapper/bible_databases, Copyright (c) 2024 Scrollmapper, MIT License.', out);

  const цитата = (уровень: number, адреса: string[], u: string, текст?: string, заметка?: string) => {
    out.push(`${уровень} SOUR @S1@`);
    строки(уровень + 1, 'PAGE', адреса.join('; ') || 'стих не указан', out);
    const q = QUAY(u);
    if (q) out.push(`${уровень + 1} QUAY ${q}`);
    if (текст) { out.push(`${уровень + 1} DATA`); строки(уровень + 2, 'TEXT', текст, out); }
    if (заметка) строки(уровень + 1, 'NOTE', заметка, out);
  };
  const словоУровня = (u: string) => (u === 'inference' ? 'уровень: вывод — так выходит, если сравнить места Библии' : u === 'scripture' ? 'уровень: сказано' : `уровень: ${u}`);

  for (const p of лица) {
    const л = г.лица[p];
    out.push(`0 ${xI.get(p)} INDI`);
    строки(1, 'NAME', л.имя.replace(/[/@]/g, ''), out);
    if (л.вид === 'unnamed') { out.push('2 TYPE описание'); out.push('2 NOTE имя в Библии не названо'); }
    for (const o of л.другие.slice(0, 10)) { строки(1, 'NAME', o.replace(/[/@]/g, ''), out); out.push('2 TYPE aka'); }
    out.push(`1 SEX ${л.пол === 'm' ? 'M' : л.пол === 'f' ? 'F' : 'U'}`);
    const номер = `p-${л.id}`;
    if (номер.length <= 20) out.push(`1 REFN ${номер}`);
    else строки(1, 'NOTE', `номер записи: ${номер}`, out);
    if (л.уточнПолн) строки(1, 'NOTE', л.уточнПолн, out);
    if (л.вид === 'people' || л.вид === 'clan') out.push(`1 NOTE в тексте — ${л.вид === 'people' ? 'народ' : 'род'}`);
    const fam = famcРождения.get(p);
    if (fam) {
      out.push('1 BIRT', `2 FAMC ${fam.xref}`);
      const fe = к.отец[p], me = к.мать[p];
      const ef = fe >= 0 && fam.муж >= 0 ? г.рёбра[fe] : undefined;
      const em = me >= 0 && fam.жена >= 0 ? г.рёбра[me] : undefined;
      const одни = ef && em && ef.стихи.join() === em.стихи.join();
      for (const [e, кто] of [[ef, 'отец'], [em, 'мать']] as const) {
        if (!e || (одни && кто === 'мать')) continue;
        const слова = e.слова?.[0];
        цитата(2, e.стихи, e.уровень, слова ? `«${слова.t}» (${слова.r})` : undefined, [одни ? 'отец и мать' : кто, e.уровень !== 'scripture' ? словоУровня(e.уровень) : '', e.поСловам ? `${e.поСловам.l} (${e.поСловам.r})` : '', `запись ${e.номер}`].filter(Boolean).join('; '));
      }
      if (fam.жена < 0 && fam.муж >= 0) out.push(me >= 0 ? '2 NOTE мать названа, но в эту выгрузку не входит' : '2 NOTE мать не названа');
    }
    const ad = приём.get(p);
    if (ad) {
      const e = г.рёбра[ad.e];
      out.push('1 ADOP', `2 FAMC ${ad.fam.xref}`, `3 ADOP ${ad.fam.приёмная}`);
      цитата(2, e.стихи, e.уровень, undefined, `приёмный; запись ${e.номер}`);
    }
    if (fam) out.push(`1 FAMC ${fam.xref}`, '2 PEDI birth');
    if (ad) out.push(`1 FAMC ${ad.fam.xref}`, '2 PEDI adopted');
    for (const f of famsOf.get(p) ?? []) if (!f.приёмная || f.муж === p || f.жена === p) out.push(`1 FAMS ${f.xref}`);
    // связи не родительства: ребро Иосифа, «из сыновей», другое прочтение, слово текста; родство словами
    for (const i of г.вверх[p]) {
      const e = г.рёбра[i];
      if (к.отец[p] === i || к.мать[p] === i || e.вид === 'adoptive') continue;
      if (e.вид === 'parents-word' && есть.has(e.род)) {
        out.push(`1 ASSO ${xI.get(e.род)}`, '2 RELA родители Его');
        цитата(2, ['Лк 2:41', ...e.стихи.filter((r) => r !== 'Лк 2:41')], 'scripture', '«родители Его» (Лк 2:41)', `запись ${e.номер}`);
        const н = г.наборы.get(e.набор ?? '');
        const авторы = н?.прочтения.flatMap((x) => x.авторы) ?? [];
        строки(1, 'NOTE', `Иосиф — муж Марии: «родители Его» (Лк 2:41); не отец по плоти — Мф 1:20; Лк 1:34–35; 3:23. Отец по закону — толкование${авторы.length ? `: ${авторы.join('; ')}` : ''}.`, out);
      } else if (e.вид === 'ancestor' && есть.has(e.род)) {
        out.push(`1 ASSO ${xI.get(e.род)}`, '2 RELA из сыновей');
        цитата(2, e.стихи, e.уровень, undefined, `запись ${e.номер}`);
      } else if (e.вид === 'text-word' && есть.has(e.род)) {
        out.push(`1 ASSO ${xI.get(e.род)}`, '2 RELA слово «отец» в тексте');
        цитата(2, e.стихи, e.уровень, undefined, `запись ${e.номер}`);
      } else if (г.кровноеПоВиду(e)) {
        строки(1, 'NOTE', `другое прочтение или другое место текста: ${e.роль === 'f' ? 'отец' : 'мать'} — ${г.имя(e.род)} (${e.стихи.join('; ')}); в этой выгрузке не родительство`, out);
      }
    }
    for (const kn of г.родство) if (kn.от === p && есть.has(kn.к)) {
      out.push(`1 ASSO ${xI.get(kn.к)}`);
      строки(2, 'RELA', kn.слово.slice(0, 25), out);
      цитата(2, kn.стихи, kn.уровень, undefined, kn.поСловам ? `${kn.поСловам.l} (${kn.поСловам.r})` : undefined);
    }
    // ребро с тождеством «предположительно» — строкой у ребёнка (03 § 3.2)
    for (const c of г.кандидаты) if (c.c === л.id && c.idt?.n) строки(1, 'NOTE', `${c.idt.n} (${c.rf.join('; ')}); не выгружено как родство`, out);
    if (л.id === 'sarra') строки(1, 'NOTE', '«она дочь отца моего, только не дочь матери моей» — по словам Авраама (Быт 20:12)', out);
  }
  for (const f of семьи.values()) {
    out.push(`0 ${f.xref} FAM`);
    if (f.муж >= 0) out.push(`1 HUSB ${xI.get(f.муж)}`);
    if (f.жена >= 0) out.push(`1 WIFE ${xI.get(f.жена)}`);
    for (const c of f.дети) out.push(`1 CHIL ${xI.get(c)}`);
    if (f.приёмная) out.push('1 NOTE семья приёмного родителя');
    if (f.союз !== undefined) {
      const u = г.союзы[f.союз];
      for (const t of u.слова) {
        if (t.k === 'marriage' || t.k === 'maid-as-wife') {
          out.push('1 MARR');
          строки(2, 'TYPE', t.w ?? (t.k === 'maid-as-wife' ? 'в жену' : 'жена'), out);
          цитата(2, t.r, t.ce ?? 'scripture', undefined, `союз ${u.номер}`);
        } else if (t.k === 'concubine') {
          out.push('1 EVEN', '2 TYPE наложница');
          цитата(2, t.r, t.ce ?? 'scripture', undefined, `союз ${u.номер}`);
        } else if (t.k === 'non-marital') {
          строки(1, 'NOTE', `союз без брака — вывод (${t.nm?.r.join('; ') ?? ''}); союз — ${t.r.join('; ')}; запись ${u.номер}`, out);
        } else if (t.k === 'not-stated') {
          строки(1, 'NOTE', `браком не назван — ${t.ce === 'interpretation' ? 'толкование' : 'вывод'} (${t.r.join('; ')}); запись ${u.номер}`, out);
        }
      }
    } else if (f.муж >= 0 && f.жена < 0 && !f.приёмная) out.push(f.дети.some((c) => к.мать[c] >= 0) ? '1 NOTE мать в эту выгрузку не входит' : '1 NOTE мать не названа');
  }
  out.push('0 TRLR');
  return out.join('\r\n') + '\r\n';
}

// ---------- проверка 5.5.1 ----------

export interface Ошибка { строка: number; текст: string }

/** Допустимые подструктуры (путь тегов → теги) — та часть грамматики 5.5.1 lineage-linked, которую пишет выгрузка. */
const ДОПУСК: Record<string, string[]> = {
  HEAD: ['SOUR', 'DEST', 'DATE', 'SUBM', 'SUBN', 'FILE', 'COPR', 'GEDC', 'CHAR', 'LANG', 'PLAC', 'NOTE'],
  'HEAD.SOUR': ['VERS', 'NAME', 'CORP', 'DATA'],
  'HEAD.SOUR.DATA': ['DATE', 'COPR'],
  'HEAD.SOUR.DATA.COPR': ['CONT', 'CONC'],
  'HEAD.COPR': ['CONT', 'CONC'],
  'HEAD.GEDC': ['VERS', 'FORM'],
  'HEAD.NOTE': ['CONT', 'CONC'],
  SUBM: ['NAME', 'ADDR', 'LANG', 'RFN', 'RIN', 'NOTE', 'CHAN'],
  SOUR: ['DATA', 'AUTH', 'TITL', 'ABBR', 'PUBL', 'TEXT', 'REPO', 'REFN', 'RIN', 'CHAN', 'NOTE', 'OBJE'],
  'SOUR.NOTE': ['CONT', 'CONC'],
  INDI: ['RESN', 'NAME', 'SEX', 'BIRT', 'CHR', 'DEAT', 'BURI', 'ADOP', 'EVEN', 'FAMC', 'FAMS', 'SUBM', 'ASSO', 'ALIA', 'REFN', 'RIN', 'CHAN', 'NOTE', 'SOUR', 'OBJE'],
  'INDI.NAME': ['TYPE', 'NPFX', 'GIVN', 'NICK', 'SPFX', 'SURN', 'NSFX', 'NOTE', 'SOUR', 'FONE', 'ROMN', 'CONC'],
  'INDI.NOTE': ['CONT', 'CONC'],
  'INDI.NAME.NOTE': ['CONT', 'CONC'],
  'INDI.BIRT': ['TYPE', 'DATE', 'PLAC', 'AGNC', 'CAUS', 'NOTE', 'SOUR', 'FAMC'],
  'INDI.BIRT.NOTE': ['CONT', 'CONC'],
  'INDI.ADOP': ['TYPE', 'DATE', 'PLAC', 'NOTE', 'SOUR', 'FAMC'],
  'INDI.ADOP.FAMC': ['ADOP'],
  'INDI.FAMC': ['PEDI', 'STAT', 'NOTE'],
  'INDI.FAMS': ['NOTE'],
  'INDI.ASSO': ['RELA', 'SOUR', 'NOTE'],
  FAM: ['RESN', 'MARR', 'EVEN', 'ANUL', 'DIV', 'ENGA', 'HUSB', 'WIFE', 'CHIL', 'NCHI', 'SUBM', 'REFN', 'RIN', 'CHAN', 'NOTE', 'SOUR', 'OBJE'],
  'FAM.NOTE': ['CONT', 'CONC'],
  'FAM.MARR': ['TYPE', 'DATE', 'PLAC', 'NOTE', 'SOUR'],
  'FAM.EVEN': ['TYPE', 'DATE', 'PLAC', 'NOTE', 'SOUR'],
  '*SOUR': ['PAGE', 'EVEN', 'DATA', 'QUAY', 'NOTE', 'OBJE'],
  '*SOUR.DATA': ['DATE', 'TEXT'],
  '*SOUR.DATA.TEXT': ['CONT', 'CONC'],
  '*SOUR.NOTE': ['CONT', 'CONC'],
  '*SOUR.PAGE': ['CONC', 'CONT'],
  '*NAME': ['CONC'],
  '*TYPE': ['CONC'],
  '*RELA': [],
};
const УКАЗАТЕЛИ: Record<string, string> = { FAMC: 'FAM', FAMS: 'FAM', HUSB: 'INDI', WIFE: 'INDI', CHIL: 'INDI', ASSO: 'INDI', SOUR: 'SOUR', SUBM: 'SUBM' };
const ДЛИНА: Record<string, number> = { NAME: 120, TYPE: 90, RELA: 25, REFN: 20, PAGE: 248, TITL: 248, ABBR: 60, QUAY: 1 };

export function проверитьGedcom(текст: string): Ошибка[] {
  const ош: Ошибка[] = [];
  const lines = текст.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  const RE = /^(0|[1-9][0-9]?) (?:(@[A-Za-z0-9_]{1,20}@) )?([A-Za-z0-9_]{1,31})(?: (.*))?$/;
  const xrefs = new Map<string, string>();
  const ptrs: { line: number; tag: string; to: string; from: string }[] = [];
  const путь: string[] = [];
  let prev = -1, rec = '', recX = '';
  const famc = new Map<string, Set<string>>(), fams = new Map<string, Set<string>>(), chil = new Map<string, Set<string>>(), spouse = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, a: string, b: string) => { if (!m.has(a)) m.set(a, new Set()); m.get(a)!.add(b); };
  if (lines[0] !== '0 HEAD') ош.push({ строка: 1, текст: 'первая строка — не «0 HEAD»' });
  if (lines.at(-1) !== '0 TRLR') ош.push({ строка: lines.length, текст: 'последняя строка — не «0 TRLR»' });
  lines.forEach((ln, i) => {
    const n = i + 1;
    if ([...ln].length > 255) ош.push({ строка: n, текст: 'строка длиннее 255 знаков' });
    const m = RE.exec(ln);
    if (!m) { ош.push({ строка: n, текст: `строка не по грамматике: ${ln.slice(0, 40)}` }); return; }
    const lvl = +m[1], x = m[2], tag = m[3], val = m[4] ?? '';
    if (lvl > prev + 1) ош.push({ строка: n, текст: 'уровень больше прежнего больше чем на 1' });
    prev = lvl;
    путь.length = lvl;
    путь[lvl] = tag;
    if (lvl === 0) {
      rec = tag; recX = x ?? '';
      if (x) { if (xrefs.has(x)) ош.push({ строка: n, текст: `номер ${x} повторяется` }); xrefs.set(x, tag); }
      if (!['HEAD', 'TRLR', 'INDI', 'FAM', 'SOUR', 'SUBM', 'NOTE', 'REPO', 'OBJE', 'SUBN'].includes(tag)) ош.push({ строка: n, текст: `неизвестная запись ${tag}` });
      return;
    }
    if (x) ош.push({ строка: n, текст: 'номер записи не на уровне 0' });
    // контекст: путь от записи; ссылка-источник «SOUR» на уровне > 1 — цитата
    const родитель = путь.slice(0, lvl).join('.');
    const ключи = [родитель];
    const iS = путь.slice(1, lvl).lastIndexOf('SOUR');
    if (iS >= 0 && rec !== 'HEAD') ключи.push('*' + путь.slice(iS + 1, lvl).join('.'));
    const последний = путь[lvl - 1];
    if (последний === 'NAME' || последний === 'TYPE' || последний === 'RELA') ключи.push('*' + последний);
    const ok = ключи.some((k) => ДОПУСК[k]?.includes(tag));
    if (!ok) ош.push({ строка: n, текст: `тег ${tag} не допускается в ${родитель}` });
    if (родитель === 'INDI.FAMC' && tag === 'SOUR') ош.push({ строка: n, текст: 'FAMC.SOUR запрещён (НИ4-1)' });
    const L = ДЛИНА[tag];
    if (L && [...val].length > L) ош.push({ строка: n, текст: `${tag} длиннее ${L}` });
    if (/^@[^@]+@$/.test(val)) {
      const типЦели = УКАЗАТЕЛИ[tag];
      if (!типЦели) ош.push({ строка: n, текст: `тег ${tag} не несёт указатель` });
      else ptrs.push({ line: n, tag, to: val, from: rec === 'HEAD' ? 'HEAD' : recX });
      if (rec === 'INDI' && lvl === 1 && tag === 'FAMC') add(famc, recX, val);
      if (rec === 'INDI' && lvl === 1 && tag === 'FAMS') add(fams, recX, val);
      if (rec === 'FAM' && tag === 'CHIL') add(chil, recX, val);
      if (rec === 'FAM' && (tag === 'HUSB' || tag === 'WIFE')) add(spouse, recX, val);
    } else if (УКАЗАТЕЛИ[tag] && tag !== 'SOUR' && !(rec === 'HEAD' && tag === 'SOUR')) ош.push({ строка: n, текст: `${tag} без указателя` });
    // значения
    if (tag === 'SEX' && !['M', 'F', 'U'].includes(val)) ош.push({ строка: n, текст: 'SEX — не M, F, U' });
    if (tag === 'PEDI' && !['adopted', 'birth', 'foster', 'sealing'].includes(val)) ош.push({ строка: n, текст: 'PEDI — не по списку' });
    if (tag === 'QUAY' && !/^[0-3]$/.test(val)) ош.push({ строка: n, текст: 'QUAY — не 0–3' });
    if (родитель === 'INDI.ADOP.FAMC' && !['HUSB', 'WIFE', 'BOTH'].includes(val)) ош.push({ строка: n, текст: 'ADOP — не HUSB, WIFE, BOTH' });
    if (родитель === 'HEAD' && tag === 'SOUR' && (/\s/.test(val) || val.length > 20)) ош.push({ строка: n, текст: 'HEAD.SOUR — с пробелом или длиннее 20' });
    if (родитель === 'HEAD.GEDC' && tag === 'VERS' && val !== '5.5.1') ош.push({ строка: n, текст: 'GEDC.VERS — не 5.5.1' });
    if (родитель === 'HEAD.GEDC' && tag === 'FORM' && val !== 'LINEAGE-LINKED') ош.push({ строка: n, текст: 'GEDC.FORM — не LINEAGE-LINKED' });
    if (родитель === 'HEAD' && tag === 'CHAR' && val !== 'UTF-8') ош.push({ строка: n, текст: 'CHAR — не UTF-8' });
    if (tag === 'CONC' && (val.startsWith(' ') || /^.* $/.test(lines[i - 1] ?? ''))) ош.push({ строка: n, текст: 'CONC режет у пробела (пробел потеряется)' });
  });
  for (const p of ptrs) {
    const t = xrefs.get(p.to);
    if (!t) ош.push({ строка: p.line, текст: `указатель ${p.to} никуда не ведёт` });
    else if (t !== УКАЗАТЕЛИ[p.tag]) ош.push({ строка: p.line, текст: `${p.tag} ведёт к ${t}, а не к ${УКАЗАТЕЛИ[p.tag]}` });
  }
  // взаимность
  for (const [i, fs] of famc) for (const f of fs) if (!chil.get(f)?.has(i)) ош.push({ строка: 0, текст: `${i} FAMC ${f}, но в ${f} нет CHIL ${i}` });
  for (const [f, cs] of chil) for (const c of cs) if (!famc.get(c)?.has(f)) ош.push({ строка: 0, текст: `${f} CHIL ${c}, но у ${c} нет FAMC ${f}` });
  for (const [i, fs] of fams) for (const f of fs) if (!spouse.get(f)?.has(i)) ош.push({ строка: 0, текст: `${i} FAMS ${f}, но в ${f} нет HUSB/WIFE ${i}` });
  for (const [f, ss] of spouse) for (const s of ss) if (!fams.get(s)?.has(f)) ош.push({ строка: 0, текст: `${f} HUSB/WIFE ${s}, но у ${s} нет FAMS ${f}` });
  const head = lines.slice(0, lines.findIndex((l, i) => i > 0 && l.startsWith('0 ')));
  for (const need of ['1 SOUR', '1 SUBM', '1 GEDC', '1 CHAR']) if (!head.some((l) => l.startsWith(need))) ош.push({ строка: 0, текст: `в HEAD нет ${need}` });
  return ош;
}

/** Разбор выгрузки, как разбор импорта (03 § 22.3 п. 3): записи по номерам. */
export function разобрать(текст: string) {
  const recs = new Map<string, { tag: string; lines: string[] }>();
  let cur: { tag: string; lines: string[] } | null = null;
  for (const ln of текст.replace(/\r\n/g, '\n').split('\n')) {
    const m = /^0 (@[^@]+@) (\w+)/.exec(ln);
    if (m) { cur = { tag: m[2], lines: [] }; recs.set(m[1], cur); continue; }
    if (ln.startsWith('0 ')) { cur = null; continue; }
    cur?.lines.push(ln);
  }
  return recs;
}
