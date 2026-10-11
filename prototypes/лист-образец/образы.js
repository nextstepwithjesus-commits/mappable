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

  // указатель эпох: одна полоса из 16 равных отрезков с волосной чертой между ними; залиты эпохи истории;
  // подписаны крайние эпохи и залитая; клетка 16 — за знаком разрыва (08 § 7.5.1; арт Н-7)
  function время(залитые, подпись) {
    const n = Д.эпохи.length;
    const w = 352, h = 16, разрыв = 10;
    const кл = (w - разрыв) / n;
    let r = `<rect x="0.5" y="0.5" width="${((n - 1) * кл - 1).toFixed(1)}" height="${h - 1}" fill="none" stroke="currentColor" stroke-width="1" class="клетка-пустая"/>`;
    r += `<rect x="${((n - 1) * кл + разрыв + 0.5).toFixed(1)}" y="0.5" width="${(кл - 1).toFixed(1)}" height="${h - 1}" fill="none" stroke="currentColor" stroke-width="1" class="клетка-пустая"/>`;
    for (let i = 1; i < n - 1; i++) r += `<path d="M${(i * кл).toFixed(1)} 0V${h}" stroke="currentColor" stroke-width="1" class="клетка-пустая"/>`;
    Д.эпохи.forEach((e, i) => { if (залитые.includes(e.id)) r += `<rect x="${(i * кл + (i === n - 1 ? разрыв : 0)).toFixed(1)}" y="0" width="${кл.toFixed(1)}" height="${h}" fill="currentColor"/>`; });
    const xr = (n - 1) * кл + 1;
    r += `<path d="M${xr} ${h - 2}l3 -${h - 4}M${xr + 4} ${h - 2}l3 -${h - 4}" stroke="currentColor" stroke-width="1.5" class="клетка-пустая"/>`;
    return `<span class="образ-время"><svg viewBox="0 0 ${w} ${h}" aria-hidden="true">${r}</svg><span class="образ-время__края т-адрес"><span>${esc(Д.эпохи[0].кратко)}</span><span class="образ-время__имя">${esc(подпись)}</span><span>${esc(Д.эпохи.at(-1).кратко)}</span></span><span class="т-адрес образ-время__масштаб">не в масштабе</span></span>`;
  }

  window.ОБРАЗЫ = { генеалогия, время };
})();
