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
  let stem = first;
  if (STRIP.test(stem) && stem.length >= 4) stem = stem.slice(0, -1);
  else if (stem.length === 3 && /[йья]$/.test(stem)) {
    // «Ной» → «Ноя», «Ною», «Ноев»: окончание обязательно, чтобы не совпасть с союзом «но»
    const root = stem.slice(0, -1);
    return new RegExp(`(^|[^а-я])${root}(й|я|ю|е|ев|ева|еву|евы|ем)([^а-я]|$)`);
  }
  if (stem.length === 3 && /[ао]$/.test(stem)) {
    // «Ила» → «Илы», «Иле»; «Хазо» несклоняемо; после гласной — «Фуа» → «Фуи» (но «Ила» не совпадает с «или»)
    const root = stem.slice(0, -1);
    const i = /[аеёиоуыэюя]$/.test(root) ? '|и' : '';
    return new RegExp(`(^|[^а-я])${root}(а|ы|е|у|ой|ою|о|ин|ина${i})([^а-я]|$)`);
  }
  const esc = stem.replace(/[-]/g, '[-\\s]?');
  if (stem.length <= 3) {
    // короткие имена (Ной, Ир, Ева): основа + типичные окончания
    return new RegExp(`(^|[^а-я])${esc}(й|я|ю|е|ев|ева|еву|евы|ем|ом|а|у|ы|ой|ою|ей|ею|о|ин|ина|ову|ов|ова|и)?([^а-я]|$)`);
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
