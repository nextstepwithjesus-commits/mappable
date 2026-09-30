/**
 * «Писание молчит» только там, где молчит (этап 13, решение 128; TOL 001): раздел из card.silent противоречит данным,
 * если сведения для него в данных есть. Правило — у валидатора (tools/validate.ts, ошибка) и в тесте
 * (tests/silent-sections.test.ts):
 *  — § 8 «Рождение»: место или обстоятельства рождения (card.birth, места с ролью birth) либо число текста о рождении
 *    (born.year, fatherAge, motherAge, offset);
 *  — § 9 «Супруги»: супруг в данных (у лица или у супруга) или card.spousesNote;
 *  — § 10 «Дети»: ребёнок в данных (отец, мать или «иной родитель» — приёмный, законный, по Луке) или card.childrenNote;
 *  — § 16 «Занятие и служение»: card.offices, царствование, роль-служение (царь, священник, пророк, судья, пастух…) или
 *    занятие, названное в § 5 (пас скот, сеял, служанка, блудница, рыболов…);
 *  — § 20 «Смерть и погребение»: card.death, места с ролью death или burial, died.year или died.age.
 */
import type { Person } from '../src/data/types.ts';

/** Роли-служения: сами по себе — сведения § 16. patriarch, matriarch, forefather, prince, messiah — положение (§ 5). */
export const OFFICE_ROLES = new Set(['king', 'queen', 'queen-mother', 'high-priest', 'priest', 'levite', 'prophet', 'judge', 'apostle', 'disciple', 'commander', 'official', 'scribe', 'musician', 'craftsman', 'shepherd', 'tribal-leader', 'foreign-ruler']);

/**
 * Занятие в тексте § 5: слово о труде или службе самого лица (именительный падеж или глагол): «Двадцать лет пас стада
 * Лавана», «Пасла мелкий скот отца», «Служанка, рабыня Сарры», «Блудница в Иерихоне», «стада, пахотные поля» (Исаак). «Родоначальник», «правителя»,
 * «сын рабыни» — не занятие лица.
 */
export const OCCUPATION = /(?:^|[^а-яё])(пас|пасла|пасли|пастух|пастушка|пастырь|сеял|сеяла|земледелец|скотовод|охотник|звероловец|рыболов|рыбак|ловец|кузнец|ковач|ремесленник|мастер|плотник|медник|писец|певец|певица|привратник|придверник|кормилица|служанка|рабыня|раб|слуга|блудница|виночерпий|хлебодар|мытарь|сотник|воин|стражник|казначей|домоправитель|управитель|евнух|торговец|торговка|стада|пахотные|пахотных)(?=$|[^а-яё])/i;

export interface SilentConflict {
  id: string;
  section: number;
  why: string;
}

export function silentConflicts(persons: Person[]): SilentConflict[] {
  const spouses = new Map<string, Set<string>>();
  const children = new Map<string, string[]>();
  for (const p of persons) {
    for (const s of p.spouses ?? []) {
      if (!spouses.has(p.id)) spouses.set(p.id, new Set());
      if (!spouses.has(s.id)) spouses.set(s.id, new Set());
      spouses.get(p.id)!.add(s.id);
      spouses.get(s.id)!.add(p.id);
    }
    for (const par of [p.father, p.mother, ...(p.otherParents ?? []).map((o) => o.id)]) if (par) children.set(par, [...(children.get(par) ?? []), p.id]);
  }
  const out: SilentConflict[] = [];
  for (const p of persons) {
    const c = p.card;
    const silent = new Set(c?.silent ?? []);
    if (!c || !silent.size) continue;
    const hit = (section: number, why: string | null) => {
      if (why && silent.has(section)) out.push({ id: p.id, section, why });
    };
    const b = p.chrono?.born;
    const d = p.chrono?.died;
    const places = (role: string[]) => (c.places ?? []).filter((x) => role.includes(x.role)).map((x) => x.name);
    hit(
      8,
      c.birth?.place || c.birth?.facts?.length
        ? `в card.birth — «${c.birth.place ?? c.birth.facts![0].text}»`
        : places(['birth']).length
          ? `место рождения: ${places(['birth']).join(', ')}`
          : b && (b.year !== undefined || b.fatherAge !== undefined || b.motherAge !== undefined || b.offset)
            ? `число текста о рождении (chrono.born${b.fatherAge !== undefined ? `.fatherAge ${b.fatherAge}` : b.motherAge !== undefined ? `.motherAge ${b.motherAge}` : b.offset ? '.offset' : `.year ${b.year}`}; ${(b.refs ?? []).join('; ')})`
            : null,
    );
    hit(9, spouses.get(p.id)?.size ? `супруги в данных: ${[...spouses.get(p.id)!].join(', ')}` : c.spousesNote?.length ? 'card.spousesNote' : null);
    hit(10, children.get(p.id)?.length ? `дети в данных: ${children.get(p.id)!.join(', ')}` : c.childrenNote?.length ? 'card.childrenNote' : null);
    const roles = (p.roles ?? []).filter((r) => OFFICE_ROLES.has(r));
    const occ = (c.status ?? []).find((f) => OCCUPATION.test(f.text));
    hit(
      16,
      c.offices?.length
        ? `card.offices: ${c.offices[0].title}`
        : p.chrono?.reign?.length
          ? 'царствование (chrono.reign)'
          : roles.length
            ? `роль: ${roles.join(', ')}`
            : occ
              ? `занятие в § 5: «${occ.text}»`
              : null,
    );
    hit(
      20,
      c.death?.place || c.death?.facts?.length || c.death?.burial?.length
        ? 'card.death'
        : places(['death', 'burial']).length
          ? `место смерти или погребения: ${places(['death', 'burial']).join(', ')}`
          : d && (d.year !== undefined || d.age !== undefined)
            ? `число текста о смерти (chrono.died; ${(d.refs ?? []).join('; ')})`
            : null,
    );
  }
  return out;
}
