/**
 * Этап 13, решения 126, 127, 130 (T6): набор в файле и его проверка схемы; оговорка о ссылке для набора больше 12 лиц;
 * отмена очистки набора живёт до следующего изменения набора; «Отмечено поиском: N»; «В данных атласа путь родства
 * не найден»; «Указатель» на букве запроса, если поиск никого не нашёл.
 */
import { beforeAll, describe, expect, it } from 'vitest';

const store = new Map<string, string>();
const storage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

let work: typeof import('../src/ui/work.ts');
let panel: typeof import('../src/ui/panels/Work.tsx');
let overlays: typeof import('../src/ui/sky/Overlays.tsx');
let kinship: typeof import('../src/ui/panels/Kinship.tsx');
let search: typeof import('../src/ui/top/Search.tsx');

beforeAll(async () => {
  Object.assign(globalThis, {
    window: { localStorage: storage, sessionStorage: storage, addEventListener: () => {}, removeEventListener: () => {}, matchMedia: () => ({ matches: false, addEventListener: () => {} }) },
    document: { documentElement: { dataset: {} }, getElementById: () => null, querySelector: () => null, addEventListener: () => {} },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    requestAnimationFrame: (cb: (t: number) => void) => setTimeout(() => cb(performance.now()), 0) as unknown as number,
    cancelAnimationFrame: (id: number) => clearTimeout(id),
  });
  work = await import('../src/ui/work.ts');
  panel = await import('../src/ui/panels/Work.tsx');
  overlays = await import('../src/ui/sky/Overlays.tsx');
  kinship = await import('../src/ui/panels/Kinship.tsx');
  search = await import('../src/ui/top/Search.tsx');
}, 120_000);

describe('решение 130: набор в файле', () => {
  it('файл набора туда и обратно: лица, откуда взяты, порядок', () => {
    const set = new Map([
      ['david', { via: 'self' as const, of: 'david' }],
      ['iessey', { via: 'anc' as const, of: 'david', gen: 1 }],
    ]);
    const text = work.setFileText(set, new Date('2026-09-30T12:00:00Z'));
    const data = JSON.parse(text);
    expect(data).toMatchObject({ kind: 'toledot-set', version: 1, saved: '2026-09-30', names: ['Давид', 'Иессей'] });
    const back = work.parseSetFile(text);
    expect('set' in back && [...back.set]).toEqual([...set]);
  });
  it('не JSON, чужой файл, JSON null, набор без лиц атласа — ошибка словами; чужие id пропускаются и считаются', () => {
    expect(work.parseSetFile('{oops')).toEqual({ error: 'Это не файл набора атласа: файл не читается как JSON.' });
    expect(work.parseSetFile('null')).toEqual({ error: 'Это не файл набора атласа.' });
    expect(work.parseSetFile('[["david",{"via":"self","of":"david"}]]')).toEqual({ error: 'Это не файл набора атласа.' });
    expect(work.parseSetFile('{"kind":"toledot-set","persons":[["nobody",{}]]}')).toEqual({ error: 'В файле нет лиц этого атласа.' });
    const r = work.parseSetFile('{"kind":"toledot-set","persons":[["david",{"via":"x","of":"david"}],["nobody",{}],"мусор",["ruf",{"via":"anc","of":"nobody"}]]}');
    expect('set' in r && [...r.set]).toEqual([
      ['david', { via: 'self', of: 'david' }],
      ['ruf', { via: 'self', of: 'ruf' }],
    ]);
    expect('skipped' in r && r.skipped).toBe(2);
  });
  it('набор больше 12 лиц — видимая оговорка о ссылке с советом сохранить файл; до 12 — без оговорки', () => {
    expect(panel.setLinkWarning(12)).toBeNull();
    expect(panel.setLinkWarning(13)).toBe('В наборе 13 лиц — больше 12, поэтому ссылка на вид передаёт только показ «набор», без его лиц. Чтобы передать сам набор, сохраните его в файл.');
  });
});

describe('решение 126: отмена очистки набора живёт до следующего изменения набора', () => {
  it('очистка — «вернуть» доступно и после закрытия панели; новое лицо в наборе снимает отмену', () => {
    work.workSet.value = new Map([
      ['david', { via: 'self', of: 'david' }],
      ['ruf', { via: 'self', of: 'ruf' }],
    ]);
    panel.clearWorkUndoable();
    expect(work.workSet.value.size).toBe(0);
    expect(panel.cleared.value?.entries.length).toBe(2);
    panel.undoClear();
    expect([...work.workSet.value.keys()]).toEqual(['david', 'ruf']);
    expect(panel.cleared.value).toBeNull();
    panel.clearWorkUndoable();
    work.addToWork('iessey');
    expect(panel.cleared.value).toBeNull();
    expect([...work.workSet.value.keys()]).toEqual(['iessey']);
  });
  it('открытие набора из файла заменяет набор; прежний можно вернуть', () => {
    work.workSet.value = new Map([['david', { via: 'self', of: 'david' }]]);
    const said = panel.openSetText(work.setFileText(new Map([['ruf', { via: 'self', of: 'ruf' }]])));
    expect(said).toBe('Открыт набор из файла: 1 лицо.');
    expect([...work.workSet.value.keys()]).toEqual(['ruf']);
    expect(panel.cleared.value?.entries.map(([id]) => id)).toEqual(['david']);
    panel.undoClear();
    expect([...work.workSet.value.keys()]).toEqual(['david']);
    expect(panel.openSetText('null')).toBe('Это не файл набора атласа.');
    expect([...work.workSet.value.keys()]).toEqual(['david']);
    work.workSet.value = new Map();
  });
  it('отметки поиска — своим именем: «Отмечено поиском: N лиц по запросу «…»»', () => {
    expect(overlays.searchPinText(10, 'Иосиф')).toBe('Отмечено поиском: 10 лиц по запросу «Иосиф»');
    expect(overlays.searchPinText(1, ' ')).toBe('Отмечено поиском: 1 лицо');
  });
});

describe('решение 127: ответ не сильнее данных', () => {
  it('родство: «не найден в данных атласа» с тем, где искали; не «Писание не называет»', () => {
    expect(kinship.KIN_NONE).toBe('В данных атласа путь родства между ними не найден.');
    expect(kinship.KIN_WHERE).toMatch(/^Искали общих предков по всем связям «родитель — ребёнок» атласа/);
    expect(kinship.KIN_ONLY_INLAW).toBe('Кровного родства в данных атласа не найдено: общих предков нет. Через брак:');
    for (const t of [kinship.KIN_NONE, kinship.KIN_WHERE, kinship.KIN_ONLY_INLAW]) expect(t).not.toMatch(/Писание не называет/);
  });
  it('поиск: отказ загрузки — не «не найдено»', () => {
    expect(search.LOAD_FAILED).toMatch(/^Не удалось загрузить данные/);
    expect(search.LOAD_FAILED).not.toMatch(/не найдено/);
  });
});

describe('решение 120: пустой поиск ведёт в «Указатель»', () => {
  it('буква запроса — с исправлением раскладки', () => {
    expect(search.indexCmd('Фаддей')).toEqual({ letter: 'Ф', label: 'Открыть «Указатель» на букве «Ф»' });
    expect(search.indexCmd('lfdbl')).toEqual({ letter: 'Д', label: 'Открыть «Указатель» на букве «Д»' });
    expect(search.indexCmd('123')).toEqual({ letter: null, label: 'Открыть «Указатель»' });
  });
});
