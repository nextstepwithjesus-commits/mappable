/** Типы добавочного пакета прототипа `data/proto.json` (поля историй — 11 § 11.2; эпохи и хронология — 02, 04). */

export type Cert = 'scripture' | 'inference' | 'interpretation' | string;
export interface Said { text: string; refs: string[] }
export interface Title { short: string; full?: string; by?: string; common?: string[]; manual?: string[] }
export interface Account { refs: string[]; cert?: Cert; basis?: { kind: string; refs: string[]; time?: string[]; note?: string } }
export interface Part { n: number; title: Title; refs: string[]; change?: string[] }
export interface Role { part?: number; role: 'agent' | 'undergoer' | 'addressed' | 'mentioned'; mode?: string }
export interface StoryActor {
  actor: string;
  label?: string;
  kind?: string;
  roles: Role[];
  main?: boolean;
  account?: number;
  roleText?: Said;
  refs: string[];
  cert?: Cert;
  note?: string;
}
export interface StoryPlace { place: string; label: string; role: string; account?: number; refs: string[]; cert?: Cert }
export interface Link { refs: string[]; kind: 'retelling' | 'mention' | 'allusion' | string; words?: string[]; action?: boolean; sameBook?: boolean; cert?: Cert; note?: string; teller?: string; basis?: string[] }
export interface Scene {
  id: string;
  title: Title;
  refs: { account: number; refs: string[] }[];
  split?: string[];
  moved?: { account: number; after: string }[];
  pairs?: string[][];
}
export interface Discrepancy { label: string; kind: string; scene?: string; quotes: { ref: string; text: string }[]; silent?: number[]; note?: string }
export interface Story {
  id: string;
  level: 'story' | 'cycle' | string;
  kind: string;
  partOf?: string;
  title: Title;
  summary?: { text: string; refs: string[] }[];
  accounts: Account[];
  parts?: Part[];
  actors: StoryActor[];
  places: StoryPlace[];
  links: Link[];
  scenes?: Scene[];
  discrepancies?: Discrepancy[];
  hard?: { topic: string; refs: string[] }[];
  nested?: { story: string; at: string; kind: string }[];
  relations?: { story: string; kind: string; refs: string[]; cert?: Cert }[];
  seeAlso?: { text: string; refs: string[]; story?: string }[];
  time?: { said?: Said };
  boundary?: { startRule?: number; human?: string };
  plot?: { setup: string; resolution: string }[];
  source?: { method: string };
}
export interface Epoch {
  id: string;
  name: string;
  short: string;
  start: number;
  end: number;
  basis?: string;
  refs: string[];
  summary?: string;
  books?: string[];
  keyPersons?: string[];
  events?: { year: number; text: string; refs: string[] }[];
  startEst?: boolean;
  endEst?: boolean;
}
export interface Anchor { id: string; event: string; value: number; verse: string; source: string; alternatives: string[]; layer?: string }
export interface Reign { over: string; start: number; end: number; years?: number; ageAtStart?: number; refs: string[]; sync?: { with: string; year: number; refs: string[]; note?: string }[]; note?: string; coregency?: unknown }
export interface Chrono {
  actor: string;
  chrono: {
    born?: { fatherAge?: number; fatherAgeBracket?: number; motherAge?: number; offset?: { from: string; years: number }; year?: number; refs: string[]; cert?: Cert; note?: string };
    died?: { age?: number; ageBracket?: number; year?: number; refs: string[]; cert?: Cert; note?: string };
    reign?: Reign[];
    active?: { from?: number; to?: number; refs?: string[]; note?: string };
    epoch?: string | string[];
  };
}
export interface TextParallel { id: string; refs: string[][]; basis: { ref: string; text: string }[]; cert?: Cert }
export interface VClass { book: string; ch: number; from: number; to: number; class: string; why?: string }

export interface ProtoPack {
  schema: 1;
  admit: 'probe';
  banner: string;
  base: string;
  storyChapters: string[];
  catalog: Record<string, { id: string; ref: string }[]>;
  mentions: Record<string, { id: string; ref: string; kind: string }[]>;
  stories: Story[];
  epochs: Epoch[];
  anchors: Anchor[];
  chrono: Chrono[];
  textParallels: TextParallel[];
  vclasses: VClass[];
  relations: { id: string; a: string; b: string; kind: string; refs: string[]; cert?: Cert; note?: string }[];
  keys: Record<string, string>;
  counts: { stories: number; signed: number; keys: number };
}
