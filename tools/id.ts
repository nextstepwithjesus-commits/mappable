/** Подсказка идентификатора: npm run -s id -- "Иессей" ["сын Овида"] */
import { translit } from '../src/engine/text.ts';
const args = process.argv.slice(2);
if (!args.length) {
  console.error('usage: npm run -s id -- "Имя" ["уточнение"]');
  process.exit(1);
}
console.log(args.map(translit).join('-'));
