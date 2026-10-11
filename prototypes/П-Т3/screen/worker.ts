/// <reference lib="webworker" />
// П-Т3: рабочий поток поиска (09 § 4.5): текст всех 66 книг, таблица основ, словарь форм; наружу — только результаты.
import { loadEngine, slim, type Engine } from './engine.ts';

let eng: Engine | null = null;
self.onmessage = async (e: MessageEvent) => {
  const m = e.data as { id: number; type: 'load'; base: string } | { id: number; type: 'q'; q: string };
  if (m.type === 'load') {
    eng = await loadEngine(m.base);
    postMessage({ id: m.id, type: 'loaded', t: eng.t });
  } else if (m.type === 'q' && eng) {
    const a = performance.now();
    const r = eng.searcher.search(m.q);
    postMessage({ id: m.id, type: 'r', r: slim(r), workerMs: performance.now() - a });
  }
};
