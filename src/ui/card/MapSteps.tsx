/**
 * Команды шагов карты у лица (этап 21, решения 197–198) — одни и те же в карточке справа (src/ui/Folio.tsx) и в листе
 * карточки на телефоне (src/ui/sky/DotCard.tsx):
 *  — «Жена и дети» / «Жёны и дети» / «Муж и дети» / «Все дети (13)» — шаг вперёд; «Родители» — шаг назад;
 *  — «Свернуть потомков», «Свернуть предков» — когда на карте есть что сворачивать;
 *  — «Только это лицо» — свернуть всю карту в это лицо (и со всего неба, и из любого показа).
 * В показе «набор» своего набора — все команды; в других показах и при наборе из ссылки — только «Только это лицо»:
 * оно и начинает свою карту. Команды без цели не показываются (одно слово — одно действие).
 */
import { foldAncestorsOf, foldDescendantsOf, foldMapTo, mapCmds, stepBack, stepForward } from '../reveal.ts';
import { linkSet, show, workSet } from '../work.ts';
import { forwardLabel } from '../sky/text.ts';

export function MapSteps({ id, cls = 'map-cmds' }: { id: string; cls?: string }) {
  const own = show.value.kind === 'set' && !linkSet.value;
  // подписка на набор: команды перестраиваются после каждого шага
  void workSet.value;
  const c = own ? mapCmds(id) : null;
  const items: { key: string; label: string; title: string; run: () => void }[] = [];
  if (c?.forward)
    items.push({
      key: 'fwd',
      label: forwardLabel(id, c.forward),
      title: c.forward.kind === 'spouses' ? 'Супруги — на карту; у каждого союза — ромб с числом детей' : c.forward.kind === 'kids' ? 'Все дети всех союзов — на карту' : 'Супруг и дети — на карту',
      run: () => stepForward(id),
    });
  if (c && c.back > 0) items.push({ key: 'back', label: 'Родители', title: 'Родители, братья и сёстры — на карту', run: () => stepBack(id) });
  if (c?.foldDesc) items.push({ key: 'fdesc', label: 'Свернуть потомков', title: 'Убрать с карты потомков лица и их супругов; лицо остаётся', run: () => foldDescendantsOf(id) });
  if (c?.foldAnc) items.push({ key: 'fanc', label: 'Свернуть предков', title: 'Убрать с карты предков лица, их братьев и сестёр; лицо остаётся', run: () => foldAncestorsOf(id) });
  if (!c || c.others)
    items.push({
      key: 'only',
      label: 'Только это лицо',
      title: own ? 'Свернуть всю карту в это лицо; вернуть — «Отменить шаг» (Ctrl+Z)' : 'Свернуть небо в это лицо: на карте останется только оно, дальше — шагами «+»',
      run: () => foldMapTo(id),
    });
  if (!items.length) return null;
  return (
    <div class={`actions ${cls}`} role="group" aria-label="Шаги карты">
      {items.map((q) => (
        <button key={q.key} type="button" class={`cmd step-${q.key}`} title={q.title} onClick={q.run}>
          {q.label}
        </button>
      ))}
    </div>
  );
}
