/**
 * Имена в тексте фактов — ссылки (F12; UX-37): «Прабабка царя Давида…» в карточке Руфи ведёт к Давиду.
 *
 * Ссылкой становится имя лица из окружения владельца карточки: родни в пределах четырёх шагов, супругов,
 * родни по терминам Писания, лиц встреч (§ 14). Имя ищется во всех падежах, в притяжательной форме («Давидов»)
 * и в иных формах из данных (Аврам — Авраам). Чтобы не связать не то лицо:
 * — слово должно начинаться с прописной (имя собственное, а не «он», «гад»);
 * — после основы имени допускается только падежное или притяжательное окончание («Ханан» не находит «Ханания»);
 * — у формы имени в окружении нет одноимённых (два Иуды — ни один не становится ссылкой);
 * — имя владельца карточки не ссылка; безымянные («Жена Лота») не ищутся;
 * — каждое лицо — ссылка один раз в факте, первым упоминанием.
 */
import type { ComponentChildren } from 'preact';
import { byId, graph, loadedCard } from '../../data/atlas.ts';
import { P } from '../common.tsx';

export type LinkCand = { id: string; stems: string[] };

const lower = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

/**
 * Формы имени лица для поиска в тексте: главное имя и иные имена, которые — имена, а не прозвания:
 * иная форма того же имени (Аврам — Авраам, общее начало) или переименование и иноязычное имя по § 4 карточки.
 * «Еврей» у Авраама (Быт 14:13) и «друг Божий» — прозвания: «Послание к Евреям» не ссылка на Авраама.
 */
function namesOf(id: string): string[] {
  const q = byId.get(id);
  if (!q || q.unnamed) return [];
  const kinds = new Map((loadedCard(id)?.altNames ?? []).map((a) => [a.name, a.kind]));
  const own = q.name.slice(0, 2).toLowerCase();
  const alt = q.alt.filter((a) => /^[А-ЯЁ]/.test(a) && (['variant', 'renamed', 'foreign'].includes(kinds.get(a) ?? '') || (!kinds.has(a) && a.slice(0, 2).toLowerCase() === own)));
  return [...new Set([q.name, ...alt])];
}
/** Основа слова имени: без конечной гласной, «й» и «ь» у слов длиннее трёх букв («Иуда» → «иуд», «Ной» → «ной»). */
const stemOf = (w: string) => (w.length > 3 && /[аяйьоеиыу]$/.test(w) ? w.slice(0, -1) : w);
/** Окончания после основы: падежные, притяжательные («Давидов», «Иаковлева», «Ноев»), беглые («Руфью»). */
const ENDING = /^(|а|я|у|ю|е|ы|и|о|й|ь|ом|ем|ой|ей|ою|ею|ью|ям|ах|ях|ов|ев|ова|ева|ову|еву|овы|евы|ово|ево|овым|евым|овой|евой|овых|евых|ин|ина|ину|ины|ино|ином|иной|иных|ым|им|ых|их|лев|лева|леву|левы|лево|левым|левой)$/;

/** Лица, чьи имена в фактах карточки id становятся ссылками. */
export function linkCandidates(id: string, extra: Iterable<string> = []): LinkCand[] {
  const near = new Set<string>(extra);
  const direct = (k: string) => k === 'father' || k === 'mother';
  // родня в пределах четырёх шагов по связям «родитель — ребёнок»; браки — в двух ближних шагах (тесть, невестка)
  let front = [id];
  const seen = new Set([id]);
  for (let d = 0; d < 4; d++) {
    const next: string[] = [];
    for (const x of front) {
      const ys = [
        ...(graph.parentsOf.get(x) ?? []).filter((e) => direct(e.kind)).map((e) => e.parent),
        ...(graph.childrenOf.get(x) ?? []).filter((e) => direct(e.kind)).map((e) => e.child),
        ...(d < 2 ? (graph.spousesOf.get(x) ?? []).map((s) => (s.a === x ? s.b : s.a)) : []),
      ];
      for (const y of ys)
        if (!seen.has(y)) {
          seen.add(y);
          next.push(y);
          near.add(y);
        }
    }
    front = next;
  }
  for (const k of graph.kinOf.get(id) ?? []) near.add(k.from === id ? k.to : k.from);
  for (const e of graph.parentsOf.get(id) ?? []) near.add(e.parent);
  for (const e of graph.childrenOf.get(id) ?? []) near.add(e.child);
  near.delete(id);
  // формы имени: форма, общая для двух лиц окружения или с владельцем, ссылкой не становится
  const forms = new Map<string, Set<string>>();
  const add = (form: string, who: string) => {
    const key = lower(form.trim());
    const s = forms.get(key) ?? new Set<string>();
    s.add(who);
    forms.set(key, s);
  };
  const owner = byId.get(id);
  if (owner) for (const f of [owner.name, ...owner.alt]) add(f, id);
  for (const x of near) for (const f of namesOf(x)) add(f, x);
  const byPerson = new Map<string, string[]>();
  for (const [form, who] of forms) {
    if (who.size !== 1) continue;
    const x = [...who][0];
    if (x === id || !/^[а-я-]+( [а-я-]+)*$/.test(form)) continue;
    if (form.split(' ')[0].length < 3) continue;
    byPerson.set(x, [...(byPerson.get(x) ?? []), form]);
  }
  return [...byPerson].map(([x, fs]) => ({ id: x, stems: fs.sort((a, b) => b.split(' ').length - a.split(' ').length) }));
}

/**
 * Все формы имени лица — для имени лица встречи в тексте встречи (§ 14): «помазан Самуилом», «встретил Аврама».
 * Лицо встречи известно заранее, поэтому у составного имени годится и первое слово: «Иисус приблизился…»
 * в карточке Клеопы — это Иисус Христос, «с Иисусом, сыном Навиным» у Халева — Иисус Навин.
 */
export function candidateFor(id: string): LinkCand {
  const names = namesOf(id).map((f) => lower(f.trim()));
  const firsts = names.filter((f) => f.includes(' ')).map((f) => f.split(' ')[0]);
  const forms = [...new Set([...names, ...firsts])].filter((f) => /^[а-я-]+( [а-я-]+)*$/.test(f) && f.split(' ')[0].length >= 3);
  return { id, stems: forms.sort((a, b) => b.split(' ').length - a.split(' ').length) };
}

/** Названо ли лицо в тексте (любой формой имени, в любом падеже, с прописной). */
export function mentionsPerson(text: string, id: string): boolean {
  const c = candidateFor(id);
  const low = lower(text);
  return c.stems.some((f) => findForm(text, low, f, 0) !== null);
}

const LETTER = /[а-яё-]/i;

/** Где в тексте стоит форма имени: начало и конец всех её слов; null — нет. */
function findForm(text: string, low: string, form: string, from: number): { a: number; b: number } | null {
  const words = form.split(' ');
  const head = stemOf(words[0]);
  for (let i = low.indexOf(head, from); i >= 0; i = low.indexOf(head, i + 1)) {
    if (i > 0 && LETTER.test(low[i - 1])) continue;
    // имя собственное — с прописной
    if (text[i] === text[i].toLowerCase()) continue;
    let b = i + head.length;
    while (b < low.length && LETTER.test(low[b])) b++;
    if (!ENDING.test(low.slice(i + head.length, b))) continue;
    // остальные слова многословного имени («Иисус Навин») — подряд, каждое со своей основой
    let ok = true;
    for (const w of words.slice(1)) {
      let c = b;
      while (c < low.length && low[c] === ' ') c++;
      const st = stemOf(w);
      if (!low.startsWith(st, c)) {
        ok = false;
        break;
      }
      b = c + st.length;
      while (b < low.length && LETTER.test(low[b])) b++;
      if (!ENDING.test(low.slice(c + st.length, b))) {
        ok = false;
        break;
      }
    }
    if (ok) return { a: i, b };
  }
  return null;
}

/**
 * Текст факта с именами-ссылками. cands — linkCandidates владельца карточки.
 * Знак препинания сразу за именем держится за ссылку (.nobr): кнопка — строчный блок, и перед знаком браузер
 * перенёс бы строку. after(id) — что поставить сразу за ссылкой (уточнение одноимённого в § 14).
 * Если ссылок нет, возвращает ту же строку (typoTree и проверки видят тот же текст).
 */
export function linkNames(text: string, cands: LinkCand[], after?: (id: string) => ComponentChildren): ComponentChildren {
  if (!text || !cands.length) return text;
  const low = lower(text);
  const spans: { a: number; b: number; id: string }[] = [];
  for (const c of cands) {
    let hit: { a: number; b: number } | null = null;
    for (const f of c.stems) {
      const h = findForm(text, low, f, 0);
      if (h && (!hit || h.a < hit.a)) hit = h;
    }
    if (!hit || spans.some((s) => hit!.a < s.b && hit!.b > s.a)) continue;
    spans.push({ ...hit, id: c.id });
  }
  if (!spans.length) return text;
  spans.sort((x, y) => x.a - y.a);
  const out: ComponentChildren[] = [];
  let at = 0;
  for (const s of spans) {
    if (s.a > at) out.push(text.slice(at, s.a));
    const link = (
      <P id={s.id} key={`${s.id}@${s.a}`}>
        {text.slice(s.a, s.b)}
      </P>
    );
    const punct = /^[,.;:!?…»)]+/.exec(text.slice(s.b))?.[0] ?? '';
    const extra = after?.(s.id);
    if (extra) {
      out.push(link, ' ', <span class="nobr" key={`${s.id}~${s.a}`}>{extra}{punct}</span>);
    } else if (punct) {
      out.push(
        <span class="nobr" key={`${s.id}~${s.a}`}>
          {link}
          {punct}
        </span>,
      );
    } else out.push(link);
    at = s.b + punct.length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}
