/**
 * Счётчики пробы: кадры, длинные задачи, Event Timing (INP), число узлов DOM (отрисованных и всех),
 * память. Скрипт замеров (bench/run.ts) читает их через window.__probe. Ничего не отправляется в сеть.
 */
export interface FrameStats { frames: number; dropped: number; droppedShare: number; p95ms: number; maxms: number; longTasks: number; longestTask: number }

const longTasks: { start: number; dur: number }[] = [];
const events: { id: number; dur: number; name: string; start: number }[] = [];
try {
  new PerformanceObserver((l) => l.getEntries().forEach((e) => longTasks.push({ start: e.startTime, dur: e.duration }))).observe({ type: 'longtask', buffered: true });
} catch { /* WebKit: нет longtask */ }
try {
  new PerformanceObserver((l) =>
    l.getEntries().forEach((e) => {
      const id = (e as PerformanceEventTiming).interactionId;
      if (id) events.push({ id, dur: e.duration, name: e.name, start: e.startTime });
    }),
  ).observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit);
} catch { /* WebKit: нет Event Timing */ }

let frameTs: number[] = [];
let framesOn = false;
let frameFrom = 0;
const loop = (t: number) => {
  if (!framesOn) return;
  frameTs.push(t);
  requestAnimationFrame(loop);
};

export const counters = {
  startFrames() { frameTs = []; framesOn = true; frameFrom = performance.now(); requestAnimationFrame(loop); },
  stopFrames(hz = 60): FrameStats {
    framesOn = false;
    const budget = 1000 / hz;
    const dts = frameTs.slice(1).map((t, i) => t - frameTs[i]);
    let total = 0, dropped = 0;
    for (const dt of dts) { const n = Math.max(1, Math.round(dt / budget)); total += n; dropped += n - 1; }
    const sorted = [...dts].sort((a, b) => a - b);
    const lt = longTasks.filter((x) => x.start >= frameFrom);
    return {
      frames: dts.length, dropped, droppedShare: total ? dropped / total : 0,
      p95ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0, maxms: sorted[sorted.length - 1] ?? 0,
      longTasks: lt.length, longestTask: Math.max(0, ...lt.map((x) => x.dur)),
    };
  },
  /** INP по взаимодействиям с момента since: наибольшая длительность каждого, затем 75-й процентиль и наибольшее. */
  inp(since = 0) {
    const by = new Map<number, number>();
    for (const e of events) if (e.start >= since) by.set(e.id, Math.max(by.get(e.id) ?? 0, e.dur));
    const v = [...by.values()].sort((a, b) => a - b);
    return { interactions: v.length, p75: v[Math.floor(v.length * 0.75)] ?? 0, max: v[v.length - 1] ?? 0, supported: 'PerformanceEventTiming' in window };
  },
  memory() {
    const m = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
    return m ? { usedMB: m.usedJSHeapSize / 2 ** 20, totalMB: m.totalJSHeapSize / 2 ** 20 } : null;
  },
};

/** Блоки двойника с content-visibility: auto — пропущены ли сейчас (событие или запасной путь по месту). */
const skipped = new WeakMap<Element, boolean>();
export function watchBlocks(blocks: Iterable<Element>) {
  for (const b of blocks) b.addEventListener('contentvisibilityautostatechange', (e) => skipped.set(b, (e as Event & { skipped: boolean }).skipped));
}
export function domCounts(blocks: Element[], schema: Element) {
  const total = document.getElementsByTagName('*').length;
  let hidden = 0;
  const hasEvent = 'ContentVisibilityAutoStateChangeEvent' in window;
  const vh = innerHeight;
  for (const b of blocks) {
    let isSkipped = skipped.get(b);
    if (isSkipped === undefined || !hasEvent) {
      const r = b.getBoundingClientRect();
      isSkipped = r.bottom < -vh * 0.5 || r.top > vh * 1.5;
    }
    if (isSkipped) hidden += b.getElementsByTagName('*').length;
  }
  return { total, rendered: total - hidden, schema: schema.getElementsByTagName('*').length };
}
