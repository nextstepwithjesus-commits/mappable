/**
 * Данные Генеалогии для проверок в Node: пакеты пробы из `public/data/pack/` (по описи) и добавочный пакет
 * `public/data/genealogy-proto.json`. Перед запуском: `npm run -s proto:data`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CoreIndex, GenealogyPack, Manifest, ToolsIndex } from '../../../core/types.ts';
import { Граф, type ДопПакет } from '../генеалогия/граф.ts';

const DATA = join(import.meta.dirname, '..', 'public', 'data');

export function загрузитьГраф(): Граф {
  if (!existsSync(join(DATA, 'genealogy-proto.json'))) throw new Error('нет данных: npm run -s proto:data');
  const man = JSON.parse(readFileSync(join(DATA, 'pack', 'manifest.json'), 'utf8')) as Manifest;
  if (man.admit !== 'probe') throw new Error('пакет не «проба»');
  const файл = (kind: string) => man.packages.find((p) => p.kind === kind)!.file;
  const read = <T>(f: string) => JSON.parse(readFileSync(join(DATA, 'pack', f), 'utf8')) as T;
  const доп = JSON.parse(readFileSync(join(DATA, 'genealogy-proto.json'), 'utf8')) as ДопПакет;
  return new Граф(read<CoreIndex>(файл('core-index')), read<ToolsIndex>(файл('tools-index')), read<GenealogyPack>(файл('genealogy')), доп);
}
