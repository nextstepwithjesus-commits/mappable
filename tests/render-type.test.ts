/**
 * Кегли холста (B2; VIS-27, VIS-29, MOB-42): короткая шкала в одном месте (src/render/type.ts),
 * ничего мельче 11,5 px, на сенсорных экранах — мельче 12,5 px.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CANVAS_SIZES, NAME_SIZE, T_MAP_S, T_MAP_TOUCH, mapFont, nameFont, nameSize, siglaFont } from '../src/render/type.ts';

const sizeOf = (font: string) => Number(/([\d.]+)px/.exec(font)?.[1]);
const TOKENS = [16, 14, 13, 12, 11.5]; // --t-body, --t-note, --t-ui, --t-ui-s, --t-map-s

describe('кегли холста', () => {
  it('только ступени шкалы токенов, не мельче 11,5 px', () => {
    for (const s of [...NAME_SIZE, ...CANVAS_SIZES]) {
      expect(TOKENS).toContain(s);
      expect(s).toBeGreaterThanOrEqual(T_MAP_S);
    }
    for (let m = 0; m <= 6; m++) {
      expect(TOKENS).toContain(sizeOf(nameFont(m, false)));
      expect(TOKENS).toContain(sizeOf(siglaFont(m, false)));
      expect(sizeOf(siglaFont(m, false))).toBeLessThanOrEqual(nameSize(m, false));
    }
    for (const s of CANVAS_SIZES) expect(TOKENS).toContain(sizeOf(mapFont(s, { coarse: false })));
  });

  it('более яркая звезда подписана не мельче тусклой', () => {
    for (let m = 1; m <= 6; m++) expect(NAME_SIZE[m]).toBeLessThanOrEqual(NAME_SIZE[m - 1]);
  });

  it('на сенсорном экране подписи холста не мельче 12,5 px', () => {
    for (let m = 0; m <= 6; m++) {
      expect(sizeOf(nameFont(m, true))).toBeGreaterThanOrEqual(T_MAP_TOUCH);
      expect(sizeOf(siglaFont(m, true))).toBeGreaterThanOrEqual(T_MAP_TOUCH);
    }
    for (const s of CANVAS_SIZES) expect(sizeOf(mapFont(s, { sans: true, coarse: true }))).toBeGreaterThanOrEqual(T_MAP_TOUCH);
  });

  it('в модулях отрисовки нет разовых кеглей: размеры шрифта берутся только из type.ts', () => {
    const dir = join(__dirname, '../src/render');
    for (const f of readdirSync(dir)) {
      if (f === 'type.ts' || !f.endsWith('.ts')) continue;
      const src = readFileSync(join(dir, f), 'utf8');
      expect((src.match(/\b\d+(\.\d+)?px\b/g) ?? []).filter((m) => m !== '0px'), f).toEqual([]); // '0px' — сброс разрядки
      expect(src.match(/Literata|Jost/g), f).toBeNull();
    }
  });
});
