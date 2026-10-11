/**
 * Службы интерфейса прототипа (09 § 4.6; 09 § 10.1 — пишутся в прототипе заново и в продукт не переносятся): одна область
 * объявлений, стек «поверх» для Esc, снимки экранов, копия в буфер с адресом, фокус после перехода.
 */

/** Одна область role="status" (08 § 6.1 п. 15): очистка и повтор через 100 мс; журнал — для поведенческих тестов. */
class Announcer {
  private t = 0;
  readonly log: string[] = [];
  say(text: string) {
    const el = document.getElementById('объявления');
    if (!el) return;
    clearTimeout(this.t);
    el.textContent = '';
    this.t = window.setTimeout(() => {
      el.textContent = text;
      this.log.push(text);
    }, 100);
  }
}
export const объявления = new Announcer();
export const объявить = (t: string) => объявления.say(t);

/** Стек «поверх» (уровень 4; 08 § 6.5): Esc закрывает последнее открытое, фокус — на кнопку, которая открыла. */
interface Over { close: () => void; opener: HTMLElement | null }
const стек: Over[] = [];
export function открыто(close: () => void, opener: HTMLElement | null): () => void {
  const x = { close, opener };
  стек.push(x);
  return () => {
    const i = стек.indexOf(x);
    if (i >= 0) стек.splice(i, 1);
  };
}
/** Закрыть последнее открытое; true — что-то было закрыто. */
export function закрытьВерхнее(): boolean {
  const x = стек.pop();
  if (!x) return false;
  x.close();
  x.opener?.focus();
  return true;
}
export const естьПоверх = () => стек.length > 0;

/** Снимки экранов в sessionStorage (09 § 4.4.2). */
export const снимки = {
  get(key: string) {
    try {
      const s = sessionStorage.getItem(`бн-снимок:${key}`);
      return s ? JSON.parse(s) : undefined;
    } catch {
      return undefined;
    }
  },
  set(key: string, v: unknown) {
    try {
      sessionStorage.setItem(`бн-снимок:${key}`, JSON.stringify(v));
    } catch {
      /* хранилище недоступно — экран откроется по адресу */
    }
  },
};

/** Копия в буфер: простой текст и HTML (08 § 16.2); итог — в общей области объявлений. */
export async function вБуфер(plain: string, html: string | null, что: string): Promise<boolean> {
  let ok = false;
  try {
    if (html && navigator.clipboard && 'ClipboardItem' in window) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([plain], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]);
    } else await navigator.clipboard.writeText(plain);
    ok = true;
  } catch {
    ok = false;
  }
  (window as unknown as { __последняяКопия: string }).__последняяКопия = plain;
  объявить(ok ? `Скопировано: ${что}` : 'Не получилось скопировать. Выделите текст и скопируйте сами');
  return ok;
}

/** Поставить фокус на элемент по номеру или селектору; если его нет — на h1 экрана. */
export function фокус(sel?: string): void {
  requestAnimationFrame(() => {
    const el = (sel && (document.getElementById(sel) ?? document.querySelector<HTMLElement>(sel))) || document.getElementById('h1');
    if (el instanceof HTMLElement) {
      if (!el.matches('a, button, input, select, textarea, [tabindex]')) el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: false });
    }
  });
}

/** Число с согласованным словом (08 § 4.3 п. 10). */
export function форма(n: number, [одна, две, пять]: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return пять;
  if (b > 1 && b < 5) return две;
  if (b === 1) return одна;
  return пять;
}
export const NB = ' ';
export const число = (n: number, ф: [string, string, string]) => `${n.toLocaleString('ru-RU').replace(/\s/g, NB)}${NB}${форма(n, ф)}`;
