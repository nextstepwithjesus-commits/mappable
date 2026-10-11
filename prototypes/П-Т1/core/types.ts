/**
 * Типы пакета «индекс» (tools/base/bundle.ts → buildIndex, schema 1) — только поля, нужные лесу.
 * Ядро без DOM: этот модуль и соседние не знают об экране (09 § 4.1, слой 4).
 */
export type Sex = 'm' | 'f';

export interface IndexActor {
  id: string;
  k: string; // human, unnamed, people, clan, angel, group
  sk?: string;
  s?: Sex;
  n: string; // первая форма имени
  o?: string[];
  d?: string; // короткое уточнение тёзки
  r?: string[];
  p?: number; // значимость 1–5
  c?: number;
  v: string;
}

export interface IndexOrigin {
  c: string; // ребёнок
  p?: string; // родитель (нет — безымянный родитель, поле u)
  u?: string;
  r: 'f' | 'm';
  k: string; // natural, ancestor, alternative, by-luke, adoptive, parents-word
  pr?: 1;
  g?: 1;
  rs?: string; // набор прочтений
  ri?: string[]; // в каких прочтениях ребро действует
  ce?: string; // достоверность, если не «сказано»: inference, interpretation
  or?: number; // порядок в перечне
  id?: { o: string; d: string; n?: string; r?: string[] };
}

export interface IndexUnion {
  h: string;
  w: string;
  k: string[];
}

export interface IndexArea {
  id: string;
  n: string;
  k: string;
  f?: string;
  pa?: string;
}

export interface IndexReading {
  id: string;
  t: string;
  d: string;
  r: { id: string; l: string; ce: string }[];
}

export interface IndexPackage {
  schema: 1;
  admit: 'probe' | 'release';
  banner?: string;
  actors: IndexActor[];
  origins: IndexOrigin[];
  unions: IndexUnion[];
  readings: IndexReading[];
  areas: IndexArea[];
  members: (string[])[];
  kin?: unknown[];
  lines?: Record<string, unknown>;
  redirects?: unknown[];
}
