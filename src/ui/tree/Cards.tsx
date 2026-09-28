/**
 * Карточки древа (решение 73): лицо, союз, пустое место («не названа в Писании») и «другие сыновья и дочери».
 * Вид — атласа: тонкая рамка, Literata в именах, Jost в командах и пометах. Образ лица — условный силуэт
 * (решение 74, Avatar.tsx); изображение — только файлом из src/assets/portraits с пометой «худож.»: изображений лиц
 * в Писании нет (П-1). Все сведения — из данных со стихами: годы (как в паспорте карточки), возраст при смерти по числу
 * текста, вид союза, первый стих.
 *
 * Карточка — остановка Tab (role="group" с именем): щелчок и Enter выбирают лицо (справа — подробная карточка),
 * пробел — главная команда карточки; стрелки ведёт TreeView.
 */
import type { ComponentChildren } from 'preact';
import { byId, loadedCard } from '../../data/atlas.ts';
import type { TreeNode } from '../../engine/tree.ts';
import type { Union } from '../../engine/unions.ts';
import { yearsWord } from '../../engine/years.ts';
import { lifeText } from '../sky/text.ts';
import { isPeople } from '../card/Masthead.tsx';
import { isClaimUnion, unionTitle } from '../card/Union.tsx';
import { refLabel } from '../common.tsx';
import { bySex, lowerFirst, nameCase, otherParentLabel } from '../text/ru.ts';
import { typo } from '../text/typo.ts';
import { nodeBox } from './geom.ts';
import { Avatar, OthersAvatar, UnionAvatar, UnnamedAvatar } from './Avatar.tsx';
import { ageAtDeath, cardsTick, othersNote, onLines, type PersonCmds } from './model.ts';

const nameOf = (id: string | null) => (id ? (byId.get(id)?.name ?? id) : '');
const gen = (id: string) => {
  const p = byId.get(id);
  return p ? nameCase(p.name, p.sex, 'gen', p.unnamed, p.alt) : null;
};

// ---------- строки ----------

/** Годы лица, как в паспорте карточки: «4174–3244 гг. до Р. Х.», «время не установлено». */
export function yearsLine(id: string): string {
  if (!byId.has(id)) return '';
  return typo(lifeText(id, { when: false }) || (isPeople(id) ? 'без года' : 'время не установлено'));
}
/** Возраст при смерти по числу текста: «жил 930 лет» (Быт 5:5); нет числа — пустая строка. */
export function ageLine(id: string): string {
  const p = byId.get(id);
  const age = ageAtDeath(id);
  return p && age !== null ? typo(`${bySex(p.sex, 'жил', 'жила')} ${yearsWord(age)}`) : '';
}

/** Уточнение одноимённого — коротко, одной строкой (скобки — через запятую). */
export const disLine = (id: string) => typo((byId.get(id)?.disambig ?? '').replace(/\s*\(([^)]*)\)/g, ', $1'));

/** Помета уровня достоверности (П-4). */
const CERT: Record<string, string> = { inference: 'выв.', interpretation: 'толк.' };
const marked = (s: string, cert?: string) => (cert && CERT[cert] ? `${s}, ${CERT[cert]}` : s);

/**
 * Вид союза одной строкой: «Ева — жена Адама», «Хеттура — наложница Авраама», «мать детей не названа в Писании»,
 * «Иосиф — законный отец», «отец по родословию Луки». Склонение — только функцией ru.ts, иначе без имени.
 */
export function unionKindLine(u: Union): string {
  if (isClaimUnion(u)) return marked(lowerFirst(otherParentLabel(u.claim!, u.a ? 'father' : 'mother')), u.kidsCert);
  if (u.claim === 'legal' && u.a) return marked(`${nameOf(u.a)} — законный отец`, u.kidsCert);
  const named = u.a ?? u.b;
  if (named && isPeople(named)) return '';
  if (!u.b) return marked('мать детей не названа в Писании', u.kidsCert);
  if (!u.a) return marked('отец детей не назван в Писании', u.kidsCert);
  if (u.kind === 'wife' || u.kind === 'concubine') {
    const word = u.kind === 'concubine' ? 'наложница' : 'жена';
    const g = gen(u.a);
    return marked(g ? `${nameOf(u.b)} — ${word} ${g}` : `${word}: ${nameOf(u.b)}`, u.cert);
  }
  return marked('отец и мать детей', u.kidsCert);
}

/** Имя карточки лица для диктора: имя, уточнение, годы, линии Мессии. */
function personAria(id: string): string {
  const p = byId.get(id)!;
  const l = onLines(id);
  const line = l.mt && l.lk ? 'в родословии по Матфею и по Луке' : l.mt ? 'в родословии по Матфею' : l.lk ? 'в родословии по Луке' : '';
  return [p.name, p.disambig ? disLine(id) : '', [yearsLine(id), ageLine(id)].filter(Boolean).join(', '), line].filter(Boolean).join('; ');
}

// ---------- знаки ----------

/** Знак лент у имени: золотая точка — линия по Матфею, лазурная — по Луке (у Иисуса Христа звезда — в образе). */
function LineMarks({ id }: { id: string }) {
  const l = onLines(id);
  if (!l.mt && !l.lk) return null;
  return (
    <span class="tc-lines" aria-hidden="true" title={l.mt && l.lk ? 'В родословии по Матфею (Мф 1) и по Луке (Лк 3)' : l.mt ? 'В родословии по Матфею (Мф 1)' : 'В родословии по Луке (Лк 3)'}>
      {l.mt && <i class="mt" />}
      {l.lk && <i class="lk" />}
    </span>
  );
}

// ---------- карточки ----------

export interface CardProps {
  node: TreeNode;
  /** выбранная карточка */
  current: boolean;
  /** подсветка: класс и цвет ветви */
  glow: string;
  color?: string;
  onSelect: () => void;
  onKey: (e: KeyboardEvent) => void;
}

function Shell({ node, current, glow, color, onSelect, onKey, label, cls, children }: CardProps & { label: string; cls: string; children: ComponentChildren }) {
  const b = nodeBox(node);
  return (
    <div
      class={['tc', cls, glow].filter(Boolean).join(' ')}
      role="group"
      tabIndex={0}
      aria-label={label}
      aria-current={current ? 'true' : undefined}
      data-key={node.key}
      style={{ left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px`, '--c': color }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        onSelect();
      }}
      onKeyDown={onKey}
    >
      {children}
    </div>
  );
}

/** Команда карточки: остановка Tab внутри карточки; щелчок не выбирает саму карточку. */
function Cmd({ onRun, children, label, title }: { onRun: () => void; children: string; label?: string; title?: string }) {
  return (
    <button type="button" class="cmd" aria-label={label} title={title} onClick={onRun}>
      {children}
    </button>
  );
}

export function PersonCard(p: CardProps & { id: string; cmds: PersonCmds; onMore: () => void; onFold: () => void; onParents: () => void; onHideParents: () => void }) {
  const q = byId.get(p.id)!;
  const dis = disLine(p.id);
  void cardsTick.value;
  const age = ageLine(p.id);
  return (
    <Shell {...p} label={personAria(p.id)} cls="tc-person">
      <div class="tc-top">
        <Avatar id={p.id} size={64} />
        <div class="tc-info">
          <div class="tc-nm">
            <span class="nm">{q.name}</span>
            <LineMarks id={p.id} />
          </div>
          {dis && <div class="tc-dis">{dis}</div>}
          <div class="tc-yrs">{yearsLine(p.id)}</div>
          {age && <div class="tc-yrs">{age}</div>}
        </div>
      </div>
      <div class="tc-cmds">
        {p.cmds.more ? (
          <Cmd onRun={p.onMore} title="Показать союзы лица справа от карточки">
            Продолжить ветвь
          </Cmd>
        ) : p.cmds.fold ? (
          <Cmd onRun={p.onFold} title="Убрать союзы лица и раскрытое от них">
            Свернуть ветвь
          </Cmd>
        ) : null}
        {p.cmds.parents ? (
          <Cmd onRun={p.onParents} title="Показать союз родителей слева от карточки">
            Родители
          </Cmd>
        ) : p.cmds.hideParents ? (
          <Cmd onRun={p.onHideParents} title="Убрать союз родителей и раскрытое от него">
            Скрыть родителей
          </Cmd>
        ) : null}
      </div>
    </Shell>
  );
}

/**
 * Команда раскрытия детей союза: подпись, имя для диктора и число. Часть детей уже на древе — «Раскрыть ещё (6)»:
 * «Раскрыть остальных детей (6)» рядом с «Подробнее» в карточку шириной 260 px не входит; полное — в имени и подсказке
 * (видимая подпись — начало имени, WCAG 2.5.3).
 */
export function kidsCommand(u: Union, open: boolean, hidden: number): { text: string; label?: string; open: boolean } | null {
  if (open) return { text: 'Свернуть детей', open: true };
  if (!u.kids.length || hidden <= 0) return null;
  if (hidden === u.kids.length) return { text: `Раскрыть детей (${hidden})`, open: false };
  return { text: `Раскрыть ещё (${hidden})`, label: `Раскрыть ещё (${hidden}): остальных детей союза`, open: false };
}

export function UnionCard(p: CardProps & { u: Union; open: boolean; hidden: number; noKids?: boolean; onKids: () => void; onMore: () => void }) {
  const title = unionTitle(p.u);
  const kind = unionKindLine(p.u);
  const ref = p.u.refs[0] ? refLabel(p.u.refs[0]) : '';
  const cmd = p.noKids ? null : kidsCommand(p.u, p.open, p.hidden);
  const n = p.u.kids.length;
  const label = typo(`Союз: ${title}${kind ? `; ${kind}` : ''}${ref ? `; ${ref}` : ''}; ${n ? `детей — ${n}, на древе — ${n - p.hidden}` : 'дети не названы'}`);
  return (
    <Shell {...p} label={label} cls="tc-union">
      <div class="tc-head">
        <span class="tc-kind">союз</span>
        {ref && <span class="tc-ref">{ref}</span>}
      </div>
      <div class="tc-top">
        <UnionAvatar a={p.u.a} b={p.u.b} size={40} />
        <div class="tc-info">
          <div class="tc-nm">
            <span class="nm">{title}</span>
          </div>
          <div class="tc-sub">{typo(kind)}</div>
        </div>
      </div>
      <div class="tc-cmds">
        {cmd && (
          <Cmd onRun={p.onKids} label={cmd.label} title={cmd.open ? 'Убрать детей союза и раскрытое от них' : cmd.label ? 'Показать остальных детей союза справа' : 'Показать детей союза справа'}>
            {cmd.text}
          </Cmd>
        )}
        <Cmd onRun={p.onMore} label={`Подробнее о союзе: ${title}`} title="Карточка союза справа">
          Подробнее
        </Cmd>
      </div>
    </Shell>
  );
}

/** Пустое место союза: «Мать не названа в Писании», «Отец не назван в Писании» и стих союза. */
export function unnamedText(u: Union, role: 'a' | 'b'): string {
  // чья мать (чей отец): единственного ребёнка — по имени, если склонение надёжно; иначе — «детей Сифа»
  const kid = u.kids.length === 1 ? gen(u.kids[0]) : null;
  const other = role === 'b' ? u.a : u.b;
  const whose = kid ?? (other && gen(other) ? `детей ${gen(other)}` : null);
  if (role === 'b') return whose ? `Мать ${whose} не названа в Писании` : 'Мать не названа в Писании';
  return whose ? `Отец ${whose} не назван в Писании` : 'Отец не назван в Писании';
}

export function UnnamedCard(p: CardProps & { u: Union; role: 'a' | 'b' }) {
  const text = unnamedText(p.u, p.role);
  const ref = p.u.refs[0] ? refLabel(p.u.refs[0]) : '';
  return (
    <Shell {...p} label={typo(`${text}${ref ? `; ${ref}` : ''}`)} cls="tc-unnamed">
      <div class="tc-top">
        <UnnamedAvatar size={44} />
        <div class="tc-info">
          <div class="tc-txt">{text}</div>
          {ref && <div class="tc-ref">{ref}</div>}
        </div>
      </div>
    </Shell>
  );
}

/** «Другие сыновья и дочери: имена не названы» — у раскрытого союза отца, который «родил сынов и дочерей» (Быт 5:4). */
export function OthersCard(p: CardProps & { u: Union }) {
  void cardsTick.value;
  const note = othersNote(loadedCard(p.u.a ?? ''));
  const ref = note?.refs[0] ? refLabel(note.refs[0]) : '';
  const g = p.u.a ? gen(p.u.a) : null;
  const sub = 'имена не названы';
  const mother = p.u.b ? 'мать не названа' : '';
  return (
    <Shell {...p} label={typo(`Другие сыновья и дочери${g ? ` ${g}` : ''}: ${sub}${mother ? `; ${mother}` : ''}${ref ? `; ${ref}` : ''}`)} cls="tc-others">
      <div class="tc-top">
        <OthersAvatar size={64} />
        <div class="tc-info">
          <div class="tc-txt">Другие сыновья и дочери</div>
          <div class="tc-sub">{sub}</div>
          {mother && <div class="tc-sub">{mother}</div>}
          {ref && <div class="tc-ref">{ref}</div>}
        </div>
      </div>
    </Shell>
  );
}

