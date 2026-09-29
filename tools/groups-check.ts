/**
 * Проверка созвездий data/groups.json (этап 11, решение 82; модуль валидатора tools/validate.ts).
 *
 *  — у каждого созвездия есть раздел листа «Показ» (section) из шести;
 *  — родитель (parent) — существующее созвездие того же раздела, без циклов;
 *  — дом в разделе «Колена Израилевы» вложен в своё колено (Дом Давидов — в Иудино, Священники — в Левиино,
 *    Дом Саулов — в Вениаминово); Ефремово и Манассиино колена — в «Доме Иосифа»;
 *  — родоначальник (founder) — существующее лицо, член созвездия (или вложенного дома) либо родитель члена;
 *    у вложенного дома родоначальник — потомок родоначальника колена.
 *
 * Модуль чистый: получает созвездия и лица, возвращает замечания.
 */
import type { Group, GroupSection, Person } from '../src/data/types.ts';

export const SECTIONS: readonly GroupSection[] = ['origins', 'patriarchs', 'tribes', 'kingdoms', 'nt', 'other'];
const KEYS = new Set(['id', 'name', 'kind', 'foreign', 'parent', 'founder', 'section', 'hue']);
/** Колена, вложенные в «Дом Иосифа» (Быт 48:5; Нав 14:4). */
export const JOSEPH_TRIBES = ['ephraim', 'manasseh'] as const;

export interface GroupIssue {
  where: string;
  msg: string;
}

export function checkGroups(groups: readonly Group[], persons: ReadonlyMap<string, Pick<Person, 'id' | 'group' | 'father' | 'mother' | 'otherParents'>>): GroupIssue[] {
  const out: GroupIssue[] = [];
  const err = (g: Group, msg: string) => out.push({ where: `group:${g.id}`, msg });
  const byId = new Map(groups.map((g) => [g.id, g]));
  // родители лица: основные и иные утверждения текста
  const parentsOf = (id: string): string[] => {
    const p = persons.get(id);
    if (!p) return [];
    return [p.father, p.mother, ...(p.otherParents ?? []).map((o) => o.id)].filter((x): x is string => !!x);
  };
  // члены созвездия вместе с вложенными домами
  const members = new Map<string, string[]>();
  for (const p of persons.values()) {
    for (let g: string | undefined = p.group, k = 0; g && k < 8; g = byId.get(g)?.parent, k++) {
      const a = members.get(g);
      if (a) a.push(p.id);
      else members.set(g, [p.id]);
    }
  }
  /** Потомок ли лицо x лица anc (по отцам, матерям и иным утверждениям). */
  const descends = (x: string, anc: string): boolean => {
    const seen = new Set<string>();
    const q = [x];
    while (q.length) {
      const y = q.pop()!;
      for (const par of parentsOf(y)) {
        if (par === anc) return true;
        if (!seen.has(par)) {
          seen.add(par);
          q.push(par);
        }
      }
    }
    return false;
  };

  for (const g of groups) {
    for (const k of Object.keys(g)) if (!KEYS.has(k)) err(g, `неизвестное поле «${k}»`);
    if (!g.section || !SECTIONS.includes(g.section)) err(g, `section: раздел листа «Показ» — один из ${SECTIONS.join(', ')}`);
    if (g.parent !== undefined) {
      const par = byId.get(g.parent);
      if (!par) err(g, `parent: неизвестное созвездие «${g.parent}»`);
      else if (par.section !== g.section) err(g, `parent: «${g.parent}» лежит в другом разделе (${par.section ?? '—'})`);
      // циклы
      const seen = new Set([g.id]);
      for (let x: string | undefined = g.parent; x; x = byId.get(x)?.parent) {
        if (seen.has(x)) {
          err(g, `parent: цикл ${[...seen, x].join(' → ')}`);
          break;
        }
        seen.add(x);
      }
    }
    // дома колен: вложены в своё колено
    if (g.section === 'tribes' && g.kind === 'house' && g.id !== 'joseph') {
      const par = g.parent ? byId.get(g.parent) : undefined;
      if (!par || par.kind !== 'tribe') err(g, 'дом в разделе колен вкладывается в своё колено (parent — созвездие вида tribe)');
    }
    if ((JOSEPH_TRIBES as readonly string[]).includes(g.id) && g.parent !== 'joseph') err(g, 'Ефремово и Манассиино колена вкладываются в «Дом Иосифа» (parent — joseph)');
    if (g.founder !== undefined) {
      const f = persons.get(g.founder);
      if (!f) {
        err(g, `founder: нет лица «${g.founder}»`);
        continue;
      }
      const own = members.get(g.id) ?? [];
      const inside = own.includes(g.founder);
      const parentOfMember = own.some((m) => parentsOf(m).includes(g.founder!));
      if (!inside && !parentOfMember) err(g, `founder: «${g.founder}» не член созвездия и не родитель его члена`);
      // вложенный дом: его родоначальник — потомок родоначальника колена
      const par = g.parent ? byId.get(g.parent) : undefined;
      if (par?.founder && persons.has(par.founder) && g.founder !== par.founder && !descends(g.founder, par.founder))
        err(g, `founder: «${g.founder}» не потомок родоначальника «${par.founder}» созвездия «${par.id}»`);
    }
  }
  return out;
}
