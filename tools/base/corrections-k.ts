/**
 * Шаги правки по задачам кода 02 § 3.18 (вторая партия).
 *
 * K3 (Р-2; 02 § 3.4, § 5.2): у толкований наборов прочтений авторы строками заменены ссылками на труды `works`. Каждая
 * строка прежних авторов — одна или две ссылки на труды `w-…` реестра; издание, год и традиция — в записи труда
 * (base/sources.json), страницы, места и знаки ✔/≈ — по совету источников (docs/app/research/R9-авторитеты.md, § 1, § 2).
 * Шаг сверяет прежние строки дословно: если они изменились, шаг останавливает сборку, а не теряет автора.
 */
import type { Cite } from './types.ts';
import type { Step } from './corrections.ts';

const agent = (work: string, page: string, weight: Cite['weight'], extra: Partial<Cite> = {}): Cite => ({ work, ...extra, page, weight, checkedBy: 'agent' });

/** Прежняя строка автора → ссылки на труды. Знак — из R9: ✔ → checked, ≈ → approx. */
export const K3_WORKS: { set: string; reading: string; authors: { was: string; works: Cite[] }[] }[] = [
  {
    set: 'r-lk3-23', reading: 'mary', authors: [
      { was: 'Matthew Henry, «An Exposition of the Old and New Testament» (1708–1710), на Лк 3:23–38', works: [agent('w-henry-exposition', 'на Лк 3:23–38', 'approx', { locus: 'Лк 3:23-38' })] },
      { was: 'John MacArthur, проповедь «The Messiah’s Royal Lineage» (Grace to You, 42-48), на Лк 3:23–38', works: [agent('w-macarthur-royal-lineage', 'проповедь 42-48', 'approx', { locus: 'Лк 3:23-38' })] },
      { was: '«Толковая Библия» под ред. А. П. Лопухина (преемники), т. 9 (1912), на Лк 3:23', works: [agent('w-lopukhin-tolkovaya-bibliya', 'на Лк 3:23', 'approx', { volume: '9 (1912)', locus: 'Лк 3:23' })] },
    ],
  },
  {
    set: 'r-lk3-23', reading: 'levirate', authors: [
      { was: 'Юлий Африкан, «Послание к Аристиду» (в передаче Евсевия)', works: [agent('w-africanus-aristides', 'в передаче Евсевия, «Церковная история» I.7', 'checked')] },
      { was: 'Евсевий Кесарийский, «Церковная история» I.7', works: [agent('w-eusebius-historia', 'I.7', 'checked')] },
      { was: 'Феофилакт Болгарский, «Толкование на Евангелие от Луки», на Лк 3:23–38', works: [agent('w-theophylact-luke', 'на Лк 3:23–38', 'checked', { locus: 'Лк 3:23-38' })] },
    ],
  },
  {
    set: 'r-lk3-23', reading: 'adoption', authors: [
      {
        was: 'Августин, «О согласии евангелистов» II.3–4; «Вопросы на Евангелия» II.5',
        works: [agent('w-augustine-de-consensu', 'II.3–4', 'checked'), agent('w-augustine-quaestiones-ev', 'II.5', 'checked')],
      },
    ],
  },
  {
    set: 'r-iosif-iisus', reading: 'legal', authors: [
      { was: 'R. E. Brown, «The Birth of the Messiah» (1977; 1993), с. 139 — наречение имени (Мф 1:25) как признание отцовства', works: [agent('w-brown-birth-messiah', 'с. 139', 'approx', { locus: 'Мф 1:25' })] },
      { was: 'John MacArthur, проповедь «The Gracious King» (Grace to You)', works: [agent('w-macarthur-gracious-king', 'место в проповеди не указано (вторичная цитата)', 'approx')] },
      { was: 'Августин, «О согласии евангелистов» II — отец по усыновлению', works: [agent('w-augustine-de-consensu', 'II', 'checked')] },
    ],
  },
];

export const STEPS_K: Step[] = [
  {
    id: 'K3',
    scope: ['reading:r-lk3-23', 'reading:r-iosif-iisus'],
    run: ({ base }) => {
      let n = 0;
      for (const x of K3_WORKS) {
        const set = base.readings.find((r) => r.id === x.set);
        const rd = set?.readings.find((r) => r.id === x.reading) as ({ authors?: string[] } & NonNullable<typeof set>['readings'][number]) | undefined;
        if (!rd) throw new Error(`K3: нет прочтения ${x.set}/${x.reading}`);
        const was = rd.authors ?? [];
        if (JSON.stringify(was) !== JSON.stringify(x.authors.map((a) => a.was))) throw new Error(`K3: авторы ${x.set}/${x.reading} изменились — сверьте таблицу шага`);
        delete rd.authors;
        rd.works = x.authors.flatMap((a) => a.works.map((c) => ({ ...c })));
        n += rd.works.length;
      }
      return {
        what: `Наборы r-lk3-23 и r-iosif-iisus: авторы строками (10 строк) заменены ссылками на труды works (${n} ссылок на 10 трудов w-… реестра); издание, год и традиция — в записи труда`,
        why: '02 § 3.4, § 5.2 (Р-2; К-3): `works` — ссылка на труд, не источник материала; подпись набора переносится только при совпадении отпечатка, ссылки на труды подписываются отдельно (02 § 3.3.3, п. 6)',
        refs: ['Лк 3:23', 'Мф 1:16'],
        actors: [],
        other: ['reading:r-lk3-23', 'reading:r-iosif-iisus'],
      };
    },
  },
];
