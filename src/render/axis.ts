/**
 * Шкала неба «по эпохам» (этап 21, решение 196; src/engine/timescale.ts): масштаб ближе к ней, чем к равномерной по годам,
 * и у модели есть поколения эпох (у синтетических шкал проверок их нет). Тогда линейка рамки называет эпохи, а не годы
 * (src/render/frame.ts), масштабная линейка — местная, «≈ N лет», меридианы событий подписаны без годов
 * (src/render/labels.ts). Год лица — в карточке, год окна — на полосе времени внизу.
 */
import type { TimeScale } from '../engine/timescale.ts';

export const byEpochs = (v: { readonly lambda: number; readonly scale: Pick<TimeScale, 'gens'> }): boolean => v.lambda >= 0.5 && !!v.scale.gens;
