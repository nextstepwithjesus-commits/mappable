/**
 * Колонка рассказа (этап 16, решение 187): на широком экране — колонка справа на месте карточки (карточка открывается
 * командой «Карточка …»), на телефоне — нижний лист той же колонки с «Назад» и «Дальше» по 44 px сразу под заглавием.
 *
 * Сверху вниз: «Рассказ: от Адама до Иисуса Христа» и «Шаг 3 из 8»; ряд шагов (имена шагов, текущий — начертанием и
 * чертой, без кружков-степпера, решение 188); заглавие шага; эпоха и её годы (расч.); описание эпохи (data/epochs.json);
 * стихи шага (Синодальный перевод, скобки бледнее); строки из графа — ветви опорного лица цветом ветвей неба (решения 69,
 * 183) и ленты Мессии; команды «Назад», «Дальше», «Вернуть кадр шага», «Выйти на небо»; «Карточка: Иаков».
 *
 * Текст — только из данных (решение 187). Ход шага объявляется живой областью (storySaid). Клавиши: PageDown и PageUp —
 * следующий и предыдущий шаг, Esc — выйти на небо (src/ui/keys.ts).
 */
import { useEffect, useRef } from 'preact/hooks';
import { byId } from '../../data/atlas.ts';
import { selected, theme } from '../../state.ts';
import { goTo, Verses } from '../common.tsx';
import { typo } from '../text/typo.ts';
import { refText } from '../../engine/kinship.ts';
import { branchHue } from '../../render/light.ts';
import { factRows, type FactRow } from './facts.ts';
import {
  STORY_STEPS, STORY_TITLE, closeStory, goStep, nextStep, openStoryCard, prevStep, returnToStep, stepEpoch, stepSub, storyMoved, storySaid, storyStep,
} from './story.ts';
import '../../styles/story.css';

/** Имя лица — кнопка: выбрать и показать на небе (как ссылка на лицо, goTo). */
function Who({ id }: { id: string }) {
  const p = byId.get(id);
  if (!p) return null;
  return (
    <button type="button" class="story-who" data-id={id} title={typo(p.disambig ? `${p.name}, ${p.disambig}` : p.name)} onClick={() => goTo(id, 'link')}>
      {typo(p.name)}
    </button>
  );
}

/** Имена списком через запятую — каждое кнопкой. */
function Names({ ids }: { ids: readonly string[] }) {
  return (
    <>
      {ids.map((id, k) => (
        <span key={id}>
          {k > 0 && ', '}
          <Who id={id} />
        </span>
      ))}
    </>
  );
}

/**
 * Строка из графа: ветвь (черта цвета ветви неба, мать — дети, стих) или место на лентах Мессии. Цвет черты — тот же,
 * что у ветви на небе (src/render/light.ts, branchHue): у Иакова и его жён — оттенок колена, «без перескока» (решение 183).
 */
function Fact({ f, focus }: { f: FactRow; focus: string }) {
  if (f.kind === 'branch')
    return (
      <li class="story-fact branch" data-branch={f.i}>
        <span class="story-sw" aria-hidden="true" style={{ '--sw': branchHue(focus, f.i, theme.value) }} />
        {f.other ? (
          <>
            <Who id={f.other} />
            {' — '}
          </>
        ) : null}
        <Names ids={f.kids} />
        {f.ref && <span class="story-ref"> ({refText(f.ref)})</span>}
      </li>
    );
  const refs = f.refs.map(refText).join('; ');
  return (
    <li class="story-fact lines" data-how={f.how}>
      {f.how === 'split' ? (
        <>
          {'Ленты расходятся: '}
          <Names ids={f.ids} />
        </>
      ) : f.how === 'join' ? (
        <>
          {'Ленты сходятся: '}
          <Names ids={f.ids} />
        </>
      ) : (
        <>
          <Names ids={f.ids} />
          {' — на обеих лентах Мессии'}
        </>
      )}
      {refs && <span class="story-ref"> ({refs})</span>}
    </li>
  );
}

/** Команды шага: «Назад», «Дальше» (на последнем шаге — «Выйти на небо» главной), «Вернуть кадр шага», «Выйти на небо». */
function Cmds({ i, n, phone }: { i: number; n: number; phone: boolean }) {
  const last = i >= n - 1;
  return (
    <div class="story-cmds" role="group" aria-label="Шаги рассказа: команды">
      <button type="button" class="story-prev" disabled={i <= 0} aria-keyshortcuts="PageUp" title="Предыдущий шаг (PageUp)" onClick={() => prevStep()}>
        Назад
      </button>
      {last ? (
        <button type="button" class="story-next" aria-keyshortcuts="Escape" title="Рассказ окончен: небо остаётся, в колонке — карточка (Esc)" onClick={() => closeStory()}>
          Выйти на небо
        </button>
      ) : (
        <button type="button" class="story-next" aria-keyshortcuts="PageDown" title="Следующий шаг (PageDown)" onClick={() => nextStep()}>
          Дальше
        </button>
      )}
      {!phone && storyMoved.value && (
        <button type="button" class="story-back" title="Небо — к кадру шага, опорное лицо — снова выбрано" onClick={() => returnToStep()}>
          Вернуть кадр шага
        </button>
      )}
      {!phone && !last && (
        <button type="button" class="story-exit" aria-keyshortcuts="Escape" title="Закрыть рассказ: окно и выбранное лицо остаются (Esc)" onClick={() => closeStory()}>
          Выйти на небо
        </button>
      )}
    </div>
  );
}

export function StoryBody({ phone }: { phone: boolean }) {
  const i = storyStep.value;
  const head = useRef<HTMLHeadingElement>(null);
  const prev = useRef<number | null>(null);
  // смена шага кнопкой ряда шагов: фокус — на заглавии нового шага (кнопки «Назад» и «Дальше» остаются на месте)
  useEffect(() => {
    const was = prev.current;
    prev.current = i;
    if (was === null || i === null || was === i) return;
    const a = document.activeElement;
    if (a instanceof HTMLElement && a.closest('.story-steps')) head.current?.focus({ preventScroll: true });
  }, [i]);
  if (i === null) return null;
  const st = STORY_STEPS[i];
  if (!st) return null;
  const n = STORY_STEPS.length;
  const e = stepEpoch(st);
  const facts = factRows(st.focus, st.facts, st.frame.persons);
  const sel = selected.value;
  const sp = sel ? byId.get(sel) : undefined;
  return (
    <div class="story-in" data-step={st.id}>
      {/* телефон: шапка листа — заглавие и «Назад», «Дальше»: они видны на любом положении листа, их касание лист не
          поднимает (Folio.tsx: фокус в шапке листа его не поднимает), за шапку лист тянется */}
      <div class={phone ? 'story-bar sheet-bar' : 'story-bar'}>
        {phone && (
          <div class="grab" aria-hidden="true">
            <span />
          </div>
        )}
        <div class="story-line">
          <span class="story-name">{phone ? 'Рассказ' : typo(STORY_TITLE)}</span>
          <span class="story-count">{`Шаг ${i + 1} из ${n}`}</span>
        </div>
        {phone && (
          <h2 class="story-title" id="story-title" tabIndex={-1} ref={head}>
            {typo(st.title)}
          </h2>
        )}
        {phone && <Cmds i={i} n={n} phone />}
      </div>
      <ol class="story-steps" aria-label="Шаги рассказа">
        {STORY_STEPS.map((s, k) => (
          <li key={s.id}>
            <button type="button" aria-current={k === i ? 'step' : undefined} title={typo(s.title)} onClick={() => goStep(k, k < i ? 'back' : 'flight')}>
              {typo(s.short)}
            </button>
          </li>
        ))}
      </ol>
      {!phone && (
        <h2 class="story-title" id="story-title" tabIndex={-1} ref={head}>
          {typo(st.title)}
        </h2>
      )}
      {e && (
        <p class="story-sub">
          {typo(stepSub(st))}{' '}
          <span class="story-mk" title="Годы эпохи — расчёт по модели хронологии атласа">
            расч.
          </span>
        </p>
      )}
      {e?.summary && <p class="story-sum">{typo(e.summary)}</p>}
      {st.refs.map((r) => (
        <figure class="story-verse" key={r}>
          <blockquote>
            <Verses refText={r} max={3} />
          </blockquote>
          <figcaption class="story-ref">{refText(r)}</figcaption>
        </figure>
      ))}
      {facts.length > 0 && (
        <ul class="story-facts" aria-label={facts[0].kind === 'branch' ? 'Ветви опорного лица' : 'Ленты Мессии'}>
          {facts.map((f, k) => (
            <Fact key={k} f={f} focus={st.focus} />
          ))}
        </ul>
      )}
      {!phone && <Cmds i={i} n={n} phone={false} />}
      {phone && (
        <div class="story-cmds second">
          {storyMoved.value && (
            <button type="button" class="story-back" onClick={() => returnToStep()}>
              Вернуть кадр шага
            </button>
          )}
          <button type="button" class="story-exit" onClick={() => closeStory()}>
            Выйти на небо
          </button>
        </div>
      )}
      {sp && (
        <p class="story-card">
          <button type="button" class="cmd" title={typo(`Открыть карточку: ${sp.name}; рассказ останется открытым`)} onClick={() => openStoryCard()}>
            {typo(`Карточка: ${sp.name}`)}
          </button>
        </p>
      )}
      <p class="visually-hidden" role="status" aria-live="polite">
        {storySaid.value}
      </p>
    </div>
  );
}
