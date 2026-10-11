// Малые образы инструментов на настоящих данных (08 § 7.5): Генеалогия — HTML-подписи поверх линий SVG
// (в SVG нет текста, WCAG 1.4.5), Время — указатель 16 эпох. Образ — ссылка; картинка aria-hidden. ПРОТОТИП.
(function () {
  const О = window.ОБЩЕЕ; const { Д, esc } = О;

  // три поколения: родитель → лицо → дети (рёбра со стихом берутся из карточки: Быт 5:28–29; Быт 5:32)
  function генеалогия({ верх, середина, низ, ширина = 172, высота = 129 }) {
    const y = [18, 64, 110];
    const xs = низ.map((_, i) => Math.round(((i + 0.5) / низ.length) * ширина));
    const сер = Math.round(ширина / 2);
    const линии = `<path d="M${сер} ${y[0] + 10}V${y[1] - 10}M${сер} ${y[1] + 10}V${(y[1] + y[2]) / 2}M${xs[0]} ${(y[1] + y[2]) / 2}H${xs.at(-1)}${xs.map((x) => `M${x} ${(y[1] + y[2]) / 2}V${y[2] - 10}`).join('')}" stroke="currentColor" stroke-width="1.5" fill="none"/>`;
    const метка = (имя, x, yy, сильно) => `<span class="образ-метка${сильно ? ' сильно' : ''}" style="left:${(x / ширина) * 100}%;top:${(yy / высота) * 100}%">${esc(имя)}</span>`;
    return `<span class="образ-генеалогия" style="aspect-ratio:${ширина}/${высота}"><svg viewBox="0 0 ${ширина} ${высота}" aria-hidden="true" class="образ-линии">${линии}</svg>${метка(верх, сер, y[0])}${метка(середина, сер, y[1], true)}${низ.map((н, i) => метка(н, xs[i], y[2])).join('')}</span>`;
  }

  // указатель эпох: 16 равных клеток, клетка 16 — за знаком разрыва; залиты эпохи истории; имя — словом под лентой
  function время(залитые, подпись) {
    const n = Д.эпохи.length; // 16
    const w = 352, h = 24, разрыв = 10;
    const кл = (w - разрыв) / n;
    let r = '';
    Д.эпохи.forEach((e, i) => {
      const x = i * кл + (i === n - 1 ? разрыв : 0);
      const з = залитые.includes(e.id);
      r += `<rect x="${(x + 0.5).toFixed(1)}" y="0.5" width="${(кл - 1.5).toFixed(1)}" height="${h - 1}" ${з ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="1"'} class="${з ? '' : 'клетка-пустая'}"/>`;
    });
    const xr = (n - 1) * кл + 1;
    r += `<path d="M${xr} ${h - 4}l4 -${h - 8}M${xr + 4} ${h - 4}l4 -${h - 8}" stroke="currentColor" stroke-width="1.5"/>`;
    const первая = Д.эпохи.findIndex((e) => залитые.includes(e.id));
    const xs = первая * кл + (кл * залитые.length) / 2;
    r += `<path d="M${xs.toFixed(1)} ${h}v8" stroke="currentColor" stroke-width="1"/>`;
    return `<span class="образ-время"><svg viewBox="0 0 ${w} ${h + 8}" aria-hidden="true">${r}</svg><span class="образ-время__имя т-адрес" style="padding-left:${Math.max(0, (xs / w) * 100 - 2)}%">${esc(подпись)}</span><span class="т-адрес образ-время__масштаб">не в масштабе</span></span>`;
  }

  window.ОБРАЗЫ = { генеалогия, время };
})();
