/**
 * Сценарии приёмки этапа 6b: решения владельца 16 и 17.
 * view — масштаб по двум осям и размер областей (J1, J2), номера 190–199;
 * workset — рабочий набор, небо по набору, свёртка, стопка карточек (J3–J6), номера 200–219.
 * Каждый агент правит только свой блок.
 */
import type { Scenario } from './kit.ts';

// view
const view: Scenario[] = [];

// workset
const workset: Scenario[] = [];

export const work: Scenario[] = [...view, ...workset];
