// Скрипт контраста: читает токены.json, считает каждую пару из $extensions["app.контраст"]
// во всех четырёх режимах (А и Б × светлая и тёмная) и падает (код 1), если пара ниже нормы.
// Запуск из корня проекта: node prototypes/шаг-0/лист/контраст.mjs
import { проверитьКонтраст, РЕЖИМЫ } from './токены.mjs';
import { fileURLToPath } from 'node:url';

export function отчёт() {
  const стр = проверитьКонтраст();
  const строки = [];
  const ш = (s, n) => String(s).padEnd(n);
  строки.push(ш('передний / задний', 40) + РЕЖИМЫ.map((р) => ш(р, 11)).join('') + 'норма  что');
  let ниже = 0;
  for (const п of стр) {
    const vals = РЕЖИМЫ.map((р) => {
      const z = п.значения[р];
      if (!z.ок) ниже++;
      return ш(z.k.toFixed(2).replace('.', ',') + (z.ок ? '' : ' ✗'), 11);
    });
    строки.push(ш(`${п.передний} / ${п.задний}`, 40) + vals.join('') + ш(п.норма == null ? '—' : String(п.норма).replace('.', ','), 7) + п.что);
  }
  строки.push('');
  строки.push(`Пар: ${стр.length} × ${РЕЖИМЫ.length} режимов. Ниже нормы: ${ниже}`);
  return { текст: строки.join('\n'), ниже, стр };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { текст, ниже } = отчёт();
  console.log(текст);
  process.exit(ниже > 0 ? 1 : 0);
}
