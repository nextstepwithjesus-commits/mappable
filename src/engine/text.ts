/** Нормализация русского текста для поиска и сверки имён. */
export function norm(s: string): string {
  // тире внутри имени («Бен—Амми», Быт 19:38) — то же, что дефис
  return s.toLowerCase().replace(/ё/g, 'е').replace(/[́̀]/g, '').replace(/(?<=[а-я])[—–](?=[а-я])/g, '-');
}

const STRIP = /[аяйьоеиыую]$/;

/**
 * Основа имени для сверки с текстом стиха (с учётом склонения и притяжательных форм Лк 3: «Илиев», «Ноев»).
 * Возвращает регулярное выражение, ищущее слово, начинающееся с основы.
 */
export function nameMatcher(name: string): RegExp {
  const first = norm(name).split(/[\s]+/)[0].replace(/[^а-я-]/g, '');
  if (first.length >= 4 && /[уо]$/.test(first) && !first.includes('-')) {
    // несклоняемые на -у, -о: «Рафу — Рафуев», «Фаллу — Фаллуево», «Хазо»;
    // притяжательное после гласной — одним «в»: «Додо — Додова» (Суд 10:1), «Хазо — Хазов»
    return new RegExp(`(^|[^а-я])${first}(ев|ева|еву|евы|ево|евым|ов|ова|ову|в|ва|ву|вы|во|вым)?([^а-я]|$)`);
  }
  let stem = first;
  if (STRIP.test(stem) && stem.length >= 4) stem = stem.slice(0, -1);
  else if (stem.length === 3 && /[йья]$/.test(stem)) {
    // «Ной» → «Ноя», «Ною», «Ноев»: окончание обязательно, чтобы не совпасть с союзом «но»
    const root = stem.slice(0, -1);
    return new RegExp(`(^|[^а-я])${root}(й|я|ю|е|ев|ева|еву|евы|ем)([^а-я]|$)`);
  }
  if (first.length === 3 && /[ао]$/.test(stem)) {
    // «Ила» → «Илы», «Иле»; «Хазо» несклоняемо; после гласной — «Фуа» → «Фуи» (но «Ила» не совпадает с «или»)
    const root = stem.slice(0, -1);
    const i = /[аеёиоуыэюя]$/.test(root) ? '|и' : '';
    return new RegExp(`(^|[^а-я])${root}(а|ы|е|у|ой|ою|о|ин|ина${i})([^а-я]|$)`);
  }
  const esc = stem.replace(/[-]/g, '[-\\s]?');
  if (stem.length <= 3) {
    // короткие имена (Ной, Ир, Ева): основа + типичные окончания;
    // основа на мягкий знак — и «ь», «ью»: «Руфь», «Руфью» (Руф 4:13), а не только «Руфи»
    const soft = first.endsWith('ь') ? 'ь|ью|' : '';
    return new RegExp(`(^|[^а-я])${esc}(${soft}й|я|ю|е|ев|ева|еву|евы|евых|ем|ом|а|у|ы|ой|ою|ей|ею|о|ин|ина|иных|ову|ов|ова|овых|и)?([^а-я]|$)`);
  }
  return new RegExp(`(^|[^а-я])${esc}`);
}

/** Удаляет вставки в квадратных скобках (LXX-вставки и неканонические добавления Синодального текста). */
export function stripBrackets(s: string): string {
  return s.replace(/\[[^\]]*\]/g, ' ');
}

const TR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Транслитерация для идентификаторов: «Иессей» → «iessey», «сын Иессея» → «syn-iesseya». */
export function translit(s: string): string {
  return norm(s)
    .split('')
    .map((c) => (c in TR ? TR[c] : /[a-z0-9]/.test(c) ? c : '-'))
    .join('')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Имя названо в тексте: ищется среди слов с прописной буквы (имена в Синодальном тексте пишутся с прописной). */
export function namesIn(text: string, names: string[]): boolean {
  const words = ` ${(stripBrackets(text).match(/[А-ЯЁ][а-яё]*(?:[-—–][А-ЯЁа-яё][а-яё]*)*/g) ?? []).map(norm).join(' ')} `;
  return names.some((n) => nameMatcher(n).test(words));
}

/**
 * Стихи родства — свои у отца и у матери (§ 6 карточки; CARD-32). В данных у ребёнка один список `parentRefs`.
 * Стих относится к родителю, который назван в нём по имени. Стих, где не назван ни один из родителей
 * («она зачала и родила сына», Быт 29:33; «зачнешь во чреве», Лк 1:31), относится к тем, кто назван в ближайшем
 * предыдущем стихе той же главы (не дальше трёх стихов); если и там никого нет — к обоим.
 * Родитель, которому не досталось ни одного стиха, получает весь список: связь не остаётся без основания.
 * verse(ref) — текст стиха и тексты предыдущих стихов главы, ближайший первым; null — стих не найден (относится к обоим).
 */
export function splitParentRefs(
  refs: string[],
  father: string[],
  mother: string[],
  verse: (ref: string) => { text: string; before: string[] } | null,
): { father: string[]; mother: string[] } {
  const f: string[] = [];
  const m: string[] = [];
  for (const r of refs) {
    const v = verse(r);
    let who = { f: true, m: true };
    if (v) {
      for (const t of [v.text, ...v.before.slice(0, 3)]) {
        const hf = namesIn(t, father);
        const hm = namesIn(t, mother);
        if (hf || hm) {
          who = { f: hf, m: hm };
          break;
        }
      }
    }
    if (who.f) f.push(r);
    if (who.m) m.push(r);
  }
  return { father: f.length ? f : [...refs], mother: m.length ? m : [...refs] };
}
