/**
 * Дополнения при переносе (этап Д1, контрольный набор — docs/app/02-ДАННЫЕ.md, § 9): действующие лица и обозначения,
 * которых не было в прежних данных, но без которых контрольный набор не даёт ожидаемых ответов. Каждое — по прочитанному
 * стиху Синодального текста; статус — черновик до проверки вторым ключом.
 */
import type { Base } from './migrate.ts';
import type { Actor } from './types.ts';
import type { Step } from './corrections.ts';

export const ADDED_VOL = '90-additions-d1.json';

export const ADDITIONS: Step = {
  id: 'A1',
  scope: ['actor:p-zhena-kaina', 'actor:p-mikhail-arkhangel', 'actor:p-desyat-prokazhennykh', 'actor:p-samaryanin-iz-desyati-prokazhennykh',
    'union:u-kain--zhena-kaina', 'union:u-avraam--khettura', 'origin:p-enokh-syn-kaina|p-zhena-kaina|', 'membership:p-zhena-kaina|',
    'membership:p-samaryanin-iz-desyati-prokazhennykh|', `volume:${'90-additions-d1.json'}`],
  run: ({ base }) => applyAdditions(base),
};

const NEW = { by: 'дополнение Д1', status: 'draft' as const };

function applyAdditions(base: Base) {
  const actors: Actor[] = [];
  const add = (a: Actor) => actors.push({ ...a, prov: NEW, facts: a.facts.map((f) => ({ ...f, prov: NEW })) });
  const union = (husband: string, wife: string) => base.unions.find((u) => u.husband === husband && u.wife === wife);

  // жена Каина (Быт 4:17) — названа в тексте, безымянна; мать Еноха
  add({
    id: 'p-zhena-kaina', kind: 'unnamed', sex: 'f', descriptor: 'жена',
    names: [{ form: 'Жена Каина', type: 'main', refs: ['Быт 4:17'] }], disambig: 'мать Еноха',
    facts: [{ sec: 5, field: 'status', value: { text: '«И познал Каин жену свою; и она зачала и родила Еноха»', refs: ['Быт 4:17'] } }],
  });
  base.unions.push({ id: 'u-kain--zhena-kaina', husband: 'p-kain', wife: 'p-zhena-kaina', terms: [{ kind: 'marriage', word: 'жена', refs: ['Быт 4:17'] }], prov: NEW });
  base.origins.push({ child: 'p-enokh-syn-kaina', parent: 'p-zhena-kaina', role: 'mother', kind: 'natural', refs: ['Быт 4:17'], cert: 'scripture', primary: true, prov: NEW });
  base.memberships.push({ actor: 'p-zhena-kaina', area: 'g-cainites', basis: 'legacy-layout', refs: [], prov: NEW });

  // Хеттура — «жена» (Быт 25:1) и «наложница» (1Пар 1:32)
  const k = union('p-avraam', 'p-khettura');
  if (!k) throw new Error('нет союза Авраама и Хеттуры');
  // по стиху — своё обозначение: Быт 25:1 — «жена», 1Пар 1:32 — «наложница» (рецензия Д1, № 10)
  for (const t of k.terms) t.refs = t.refs.filter((r) => r !== 'Быт 25:1');
  for (const t of k.terms) if (t.kind === 'concubine') t.note = '«Сыновья Хеттуры, наложницы Авраамовой» (1Пар 1:32)';
  k.terms.push({ kind: 'marriage', word: 'жена', refs: ['Быт 25:1'], prov: NEW });

  // Михаил Архангел (Иуд 1:9) — тёзка людей с именем Михаил (1Пар 5:13, 14)
  add({
    id: 'p-mikhail-arkhangel', kind: 'angel',
    names: [
      { form: 'Михаил', type: 'main', refs: ['Дан 10:13', 'Дан 10:21', 'Дан 12:1', 'Иуд 1:9', 'Откр 12:7'] },
      { form: 'Михаил Архангел', type: 'title', refs: ['Иуд 1:9'] },
    ],
    disambig: 'Архангел',
    facts: [
      { sec: 5, field: 'status', value: { text: '«Михаил Архангел»', refs: ['Иуд 1:9'] } },
      { sec: 5, field: 'status', value: { text: '«Михаил, один из первых князей»; «Михаила, князя вашего»; «Михаил, князь великий, стоящий за сынов народа твоего»', refs: ['Дан 10:13', 'Дан 10:21', 'Дан 12:1'] } },
      { sec: 17, field: 'events', value: { text: 'Спорил с диаволом о Моисеевом теле и не смел произнести укоризненного суда, но сказал: «да запретит тебе Господь»', refs: ['Иуд 1:9'] } },
      { sec: 17, field: 'events', value: { text: '«Михаил и Ангелы его воевали против дракона»', refs: ['Откр 12:7'] } },
    ],
  });

  // десять прокажённых (Лк 17:12–19): группа из десяти; Самарянин — один из них и числа не увеличивает
  add({
    id: 'p-desyat-prokazhennykh', kind: 'group',
    names: [{ form: 'Десять прокажённых', type: 'main', refs: ['Лк 17:12'] }],
    count: { n: 10, refs: ['Лк 17:12', 'Лк 17:17'] },
    facts: [{ sec: 17, field: 'events', value: { text: 'Встретили Иисуса, просили: «Иисус Наставник! помилуй нас»; пошли показаться священникам и, когда шли, очистились', refs: ['Лк 17:12-14'] } }],
  });
  add({
    id: 'p-samaryanin-iz-desyati-prokazhennykh', kind: 'unnamed', sex: 'm', descriptor: 'Самарянин',
    names: [{ form: 'Самарянин', type: 'main', refs: ['Лк 17:16'] }], disambig: 'один из десяти прокажённых',
    facts: [{ sec: 17, field: 'events', value: { text: 'Один из десяти, видя, что исцелён, возвратился, прославляя Бога, пал ниц к ногам Иисуса, благодаря Его; Иисус сказал: «вера твоя спасла тебя»', refs: ['Лк 17:15-19'] } }],
  });
  base.memberships.push({ actor: 'p-samaryanin-iz-desyati-prokazhennykh', area: 'p-desyat-prokazhennykh', role: 'один из них', basis: 'named', refs: ['Лк 17:15'], prov: NEW });

  base.volumes.push({ vol: 'Д1', file: ADDED_VOL, title: 'Дополнения при переносе (контрольный набор)', scope: 'Быт 4:17; 25:1; Дан 10:13, 21; 12:1; Иуд 1:9; Откр 12:7; Лк 17:12–19', actors });
  return {
    what: 'Добавлены: жена Каина (Быт 4:17) — союз и мать Еноха; у Хеттуры обозначения разделены по стихам — «жена» (Быт 25:1) и «наложница» (1Пар 1:32); Михаил Архангел (Иуд 1:9); десять прокажённых и Самарянин — один из них (Лк 17:12–19)',
    why: 'Контрольный набор этапа Д1 (02, § 9): безымянные и неземные действующие лица, несколько обозначений союза, группа с численностью',
    refs: ['Быт 4:17', 'Быт 25:1', 'Иуд 1:9', 'Лк 17:12-19'],
    actors: ['enokh-syn-kaina', 'khettura', 'avraam', ...actors.map((a) => a.id.slice(2))],
  };
}
