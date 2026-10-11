// П-Т5: службы интерфейса (09 § 4.6) — пишутся в пробе заново и в продукт не переносятся (09 § 10.1).

/** Одна область role="status" в оболочке: очистка и повтор через 100 мс (08 § 6.1 п. 15). */
export class Announcer {
  private t = 0;
  readonly log: string[] = [];
  constructor(private el: HTMLElement) {}
  say(text: string) {
    clearTimeout(this.t);
    this.el.textContent = '';
    this.t = window.setTimeout(() => {
      this.el.textContent = text;
      this.log.push(text);
    }, 100);
  }
}

/** Стек «поверх» (уровень 4): Esc закрывает последнее открытое, фокус — на кнопку, которая открыла. */
export class OverlayStack {
  private stack: { close: () => void; opener: HTMLElement | null }[] = [];
  get size() {
    return this.stack.length;
  }
  open(close: () => void, opener: HTMLElement | null) {
    this.stack.push({ close, opener });
  }
  /** Вызывается из события закрытия (в том числе родного Esc у модального dialog). */
  closed(close: () => void) {
    const i = this.stack.findIndex((x) => x.close === close);
    if (i < 0) return;
    const [x] = this.stack.splice(i, 1);
    x.opener?.focus();
  }
  closeTop(): boolean {
    const x = this.stack[this.stack.length - 1];
    if (!x) return false;
    x.close();
    return true;
  }
}

/** Снимки экранов в sessionStorage (09 § 4.4.2). */
export const sessionSnaps = {
  get(key: string) {
    try {
      const s = sessionStorage.getItem(`bn-snap:${key}`);
      return s ? JSON.parse(s) : undefined;
    } catch {
      return undefined;
    }
  },
  set(key: string, v: unknown) {
    try {
      sessionStorage.setItem(`bn-snap:${key}`, JSON.stringify(v));
    } catch {
      /* хранилище недоступно — снимок не пишется, экран откроется по адресу */
    }
  },
};

/** Переход общим элементом (09 § 4.4.2): где есть и движение не уменьшено — View Transitions; фокус — после завершения. */
export async function withTransition(update: () => void): Promise<void> {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const d = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void>; updateCallbackDone: Promise<void> } };
  if (!d.startViewTransition || reduce) {
    update();
    return;
  }
  const vt = d.startViewTransition(update);
  await vt.updateCallbackDone;
  await vt.finished.catch(() => {});
}
