/** Часы ядра без DOM и Node: `performance.now()`, где он есть (браузер, рабочий поток, Node), иначе `Date.now()`. */
const perf = (globalThis as { performance?: { now(): number } }).performance;
export const now = (): number => (perf ? perf.now() : Date.now());
