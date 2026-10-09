"""Сжатие снимков эскиза: палитра до 96 цветов, PNG с оптимизацией.
Запуск: python3 -I prototypes/main-screen/compress.py"""
from pathlib import Path
from PIL import Image

shots = Path(__file__).resolve().parent / 'shots'
before = after = 0
for p in sorted(shots.glob('*.png')):
    before += p.stat().st_size
    im = Image.open(p).convert('RGB')
    q = im.quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    q.save(p, optimize=True)
    after += p.stat().st_size
print(f'снимков: {len(list(shots.glob("*.png")))}; было {before / 1e6:.1f} МБ, стало {after / 1e6:.1f} МБ')
