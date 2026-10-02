/**
 * Сценарии приёмки этапа 14, группа graph14 (исполнитель S1 «Связи и выделение»): номера 1100–1119, решения 134–138
 * и 159, пороги Г1–Г7 (STAGE14 § 4) по настоящей отрисовке. Геометрия — из атрибутов холста: связи кадра
 * canvas[data-links] («вид|начертание|ключ|x,y,…», узлы «node|open|ключ|x,y»), подписи связей canvas[data-link-texts]
 * («текст@x,y»), имена матерей у ромбов canvas[data-mother-names], подписи лент canvas[data-ribbon-tags], выбранная
 * связь canvas[data-link-sel]. Сцены — отчёт G § 6.
 *  — 1100, 1101 Есром, Халев, Ашхур: узел не стоит на чужом пути, вертикали разных союзов не совпадают (Г2);
 *  — 1102 Давид: имена матерей у ромбов поставлены (Г4);
 *  — 1103 Иаков и Валла — Дан: жёлтое не проходит через чужой ромб; у конца — роль (Г8, G9);
 *  — 1104 Иуда: Фамарь не погашена — подписана, союз с ней в полную силу (Г5);
 *  — 1105, 1106 дальний масштаб 900 и 2000 лет: связей на экран не больше 200; подписи обрывков — только у линий (Г6);
 *  — 1107 Давид на среднем масштабе: координата у обрывка — только если второй конец за краем, одна на лицо (Г7);
 *  — 1108 Иисус: ленты подписаны «Мф 1» и «Лк 3» (решение 138);
 *  — 1109 союз «Иаков и Зелфа»: дети союза — концы связи с ролью «сын» (решение 137, Т4);
 *  — 1110, 1111 решение 159: след Мехиаеля до ромба — связь «Мехиаель — Мафусал»; у Халева — «Связи дальше по следу».
 */
import type { Page } from 'playwright';
import { pass, fail, type Scenario } from './kit.ts';

const go = async (p: Page, hash: string, ms = 3200) => {
  await p.evaluate(() => {
    localStorage.setItem('toledot:cartouche', 'folded');
    localStorage.setItem('toledot:start', JSON.stringify('all'));
    sessionStorage.clear();
  });
  await p.goto(`${p.url().replace(/[?#].*$/, '')}?g14=${Date.now()}${hash}`);
  await p.waitForTimeout(ms);
};
const data = (p: Page, k: string) => p.locator('.sky canvas').getAttribute(`data-${k}`).then((v) => v ?? '');

type Row = { kind: string; style: string; ks: string; pts: number[] };
async function rows(p: Page): Promise<Row[]> {
  return (await data(p, 'links'))
    .split(';')
    .filter(Boolean)
    .map((q) => {
      const [kind, style, ks, pts] = q.split('|');
      return { kind, style, ks, pts: (pts ?? '').split(',').map(Number) };
    });
}
/** Союз записи ключа: «k.a.b.c.ребёнок», «s.a.b.c.лицо», «u.a.b.c» → «a.b.c»; иначе — сама запись. */
const unionOf = (ks: string) => (/^[ksu]\./.test(ks) ? ks.split('.').slice(1, 4).join('.') : ks);
const segs = (pts: number[]) => {
  const out: [number, number, number, number][] = [];
  for (let k = 0; k + 3 < pts.length; k += 2) out.push([pts[k], pts[k + 1], pts[k + 2], pts[k + 3]]);
  return out;
};
const distSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

/** Г2: узлы на чужом пути (ближе r + 1 к оси, у черты брака — к её линии) и совпадающие вертикали разных союзов. */
async function falseNodes(p: Page, r = 3.5): Promise<{ nodes: string[]; same: string[] }> {
  const all = await rows(p);
  const nodes = all.filter((q) => q.kind === 'node' || q.kind === 'join');
  const paths = all.filter((q) => q.kind !== 'node' && q.kind !== 'join' && q.kind !== 'ribbon');
  const bad: string[] = [];
  for (const n of nodes) {
    const [x, y] = n.pts;
    const u = unionOf(n.ks);
    for (const q of paths) {
      if (unionOf(q.ks) === u) continue;
      const hit = segs(q.pts).some((g) => {
        if (Math.hypot(x - g[0], y - g[1]) < 1.5 || Math.hypot(x - g[2], y - g[3]) < 1.5) return false;
        return distSeg(x, y, g[0], g[1], g[2], g[3]) - (q.kind === 'bar' ? 1.6 : 0) < r + 1;
      });
      if (hit) {
        bad.push(`${n.ks} на ${q.kind} ${q.ks}`);
        break;
      }
    }
  }
  const vs = paths.flatMap((q) => segs(q.pts).filter((g) => Math.abs(g[0] - g[2]) < 0.5 && Math.abs(g[1] - g[3]) > 0.5).map((g) => ({ x: g[0], y0: Math.min(g[1], g[3]), y1: Math.max(g[1], g[3]), u: unionOf(q.ks), ks: q.ks })));
  vs.sort((a, b) => a.x - b.x);
  const same: string[] = [];
  for (let i = 0; i < vs.length; i++)
    for (let j = i + 1; j < vs.length && vs[j].x - vs[i].x < 2; j++)
      if (vs[i].u !== vs[j].u && Math.min(vs[i].y1, vs[j].y1) - Math.max(vs[i].y0, vs[j].y0) > 12) same.push(`${vs[i].ks} | ${vs[j].ks}`);
  return { nodes: bad, same };
}

/** Г6: подписи обрывков без нарисованной линии — подпись связи, у точки которой нет конца пути (и нет узла). */
async function bareTexts(p: Page): Promise<string[]> {
  const all = await rows(p);
  const ends: [number, number][] = [];
  for (const q of all) for (let k = 0; k + 1 < q.pts.length; k += 2) ends.push([q.pts[k], q.pts[k + 1]]);
  const out: string[] = [];
  for (const t of (await data(p, 'link-texts')).split('|').filter(Boolean)) {
    const [x, y] = t.slice(t.lastIndexOf('@') + 1).split(',').map(Number);
    if (!ends.some(([a, b]) => Math.abs(a - x) <= 2 && Math.abs(b - y) <= 2)) out.push(t);
  }
  return out;
}

/** Звёзды в окне: имя → места (список неба #sky-star-…; px холста). */
async function starsByName(p: Page): Promise<Map<string, { x: number; y: number }[]>> {
  const list = (await p.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[id^="sky-star-"]')].map((b) => ({ name: (b.textContent ?? '').split(',')[0].trim(), x: Number(b.dataset.x), y: Number(b.dataset.y) })),
  )) as { name: string; x: number; y: number }[];
  const m = new Map<string, { x: number; y: number }[]>();
  for (const q of list) if (Number.isFinite(q.x)) (m.get(q.name) ?? m.set(q.name, []).get(q.name)!).push(q);
  return m;
}

type Sel = { ks: string; ends: { id: string; role: string; x: number; y: number; on: boolean }[]; routes: number[][]; nodeHoles?: string[] };
const linkSel = async (p: Page): Promise<Sel | null> => {
  const raw = await data(p, 'link-sel');
  return raw ? (JSON.parse(raw) as Sel) : null;
};
const canvasBox = async (p: Page) => (await p.locator('.sky canvas').boundingBox())!;

async function noFalseNodes(p: Page, hash: string) {
  await go(p, hash);
  const f = await falseNodes(p);
  if (f.nodes.length || f.same.length) return fail(`узлов на чужом пути ${f.nodes.length} (${f.nodes.slice(0, 3).join('; ')}); совпадающих вертикалей ${f.same.length} (${f.same.slice(0, 2).join('; ')})`);
  return pass(`связей кадра ${(await rows(p)).length}: узлов на чужом пути 0, совпадающих вертикалей 0`);
}

export const graph14: Scenario[] = [
  {
    n: 1100,
    title: 'Г2 (решение 134): Есром, Халев, Ашхур, 172 года — ромб не на чужом пути, вертикали разных союзов не совпадают',
    run: (p) => noFalseNodes(p, '#/~y-1839~w172~l-5.4~s1'),
  },
  {
    n: 1101,
    title: 'Г2 (решение 134): Халев выбран, 60 лет — шина многожёнца разведена, ромбы Ефы и Маахи не на чужих чертах',
    run: (p) => noFalseNodes(p, '#/khalev-syn-esroma~y-1800~w60~l-2~s1'),
  },
  {
    n: 1102,
    title: 'Г4 (решение 137): Давид выбран — имена матерей у ромбов поставлены (не меньше пяти: Ахиноама, Авигея, Мааха, Вирсавия…)',
    run: async (p) => {
      await go(p, '#/david');
      const m = (await data(p, 'mother-names')).split('|').filter(Boolean);
      if (m.length < 5) return fail(`имён матерей у ромбов: ${m.length} (${m.join(', ')})`);
      return pass(`у ромбов Давида: ${m.map((q) => q.split('@')[0]).join(', ')}`);
    },
  },
  {
    n: 1103,
    // этап 14, второй круг (решение 166, R1-10): жёлтое не обходит чужие ромбы П-образными вырезами (они читались
    // заходом в те союзы) — идёт прямо поверх, а под чужим ромбом прерывается
    title: 'Г8, G9, решение 166: связь «Иаков и Валла — Дан» — под чужими ромбами жёлтое прервано, без обходов; концы — с ролями',
    run: async (p) => {
      await go(p, '#/iakov~ck.iakov.valla._.dan', 3600);
      const sel = await linkSel(p);
      if (!sel || sel.ks !== 'k.iakov.valla._.dan') return fail(`выбранная связь: ${sel?.ks ?? 'нет'}`);
      const nodes = (await rows(p)).filter((q) => q.kind === 'node' && unionOf(q.ks) !== 'iakov.valla._');
      const holes = new Set(sel.nodeHoles ?? []);
      const under: string[] = [];
      const bad: string[] = [];
      for (const n of nodes)
        for (const r of sel.routes)
          for (const g of segs(r)) {
            const [x, y] = n.pts;
            if (Math.hypot(x - g[0], y - g[1]) < 2 || Math.hypot(x - g[2], y - g[3]) < 2) continue;
            if (distSeg(x, y, g[0], g[1], g[2], g[3]) >= 1.5) continue;
            under.push(n.ks);
            if (!holes.has(unionOf(n.ks))) bad.push(n.ks);
          }
      if (bad.length) return fail(`жёлтое без разрыва под чужими ромбами: ${[...new Set(bad)].join(', ')}`);
      // обхода нет: ни один отрезок пути не короче 2·(r + 3) поперёк хода (ступенька обхода)
      const jogs = sel.routes.flatMap((r) => segs(r)).filter((g) => Math.hypot(g[2] - g[0], g[3] - g[1]) < 7 && Math.hypot(g[2] - g[0], g[3] - g[1]) > 0.5).length;
      if (jogs > 2) return fail(`в пути ${jogs} коротких ступенек — обход чужих ромбов`);
      const roles = sel.ends.map((e) => `${e.id}:${e.role}`);
      if (!roles.includes('valla:мать') || !roles.includes('dan:сын')) return fail(`концы: ${roles.join(' ')}`);
      return pass(`чужих ромбов под путём ${new Set(under).size}, все — с разрывом; концы ${roles.join(', ')}`);
    },
  },
  {
    n: 1104,
    title: 'Г5 (решение 137): Иуда выбран — Фамарь, мать Фареса и Зары, не погашена: подписана, линии союза с ней в кадре',
    run: async (p) => {
      await go(p, '#/iuda~y-1900~w70~l0~s1');
      const ids = (await data(p, 'label-ids')).split(' ');
      const lines = (await rows(p)).filter((q) => unionOf(q.ks) === 'iuda.famar._');
      if (!ids.includes('famar')) return fail('имя Фамари не поставлено (погашена?)');
      if (!lines.length) return fail('линий союза «Иуда и Фамарь» в кадре нет');
      return pass(`Фамарь подписана; линий союза — ${lines.length}`);
    },
  },
  {
    n: 1105,
    title: 'Г6 (решение 135): дальний масштаб, 900 лет — связей на экран не больше 200; подписей обрывков без линий нет',
    run: async (p) => {
      await go(p, '#/~y-1500~w900~l0~s1');
      const paths = (await rows(p)).filter((q) => q.kind !== 'node' && q.kind !== 'join');
      const bare = await bareTexts(p);
      if (paths.length > 200) return fail(`связей на экран: ${paths.length}`);
      if (bare.length) return fail(`подписи без линий: ${bare.slice(0, 4).join(', ')}`);
      return pass(`связей на экран ${paths.length}; подписей обрывков без линий 0`);
    },
  },
  {
    n: 1106,
    title: 'Г6 (решения 135, 136): дальний масштаб, 2000 лет — подписей обрывков без линий нет',
    run: async (p) => {
      await go(p, '#/~y-1500~w2000~l0~s1');
      const bare = await bareTexts(p);
      if (bare.length) return fail(`подписи без линий: ${bare.length} (${bare.slice(0, 4).join(', ')})`);
      return pass(`подписей связей ${(await data(p, 'link-texts')).split('|').filter(Boolean).length}, все — у своих линий`);
    },
  },
  {
    n: 1107,
    title: 'Г7 (решение 136): Давид, 172 года — координата у обрывка только при втором конце за краем; одна на лицо',
    run: async (p) => {
      await go(p, '#/~y-1024~w172~l-5.4~s1');
      const texts = (await data(p, 'link-texts')).split('|').filter(Boolean).map((t) => t.slice(0, t.lastIndexOf('@')));
      const stars = await starsByName(p);
      const c = await canvasBox(p);
      const both: string[] = [];
      const count = new Map<string, number>();
      for (const t of texts) {
        for (const m of t.matchAll(/(?:^|; )(?:[↑↓←→] )?([^;,]+), (\d+ [А-ЯЁ])/g)) {
          const name = m[1].trim();
          count.set(`${name}, ${m[2]}`, (count.get(`${name}, ${m[2]}`) ?? 0) + 1);
          const at = stars.get(name) ?? [];
          if (at.some((q) => q.x >= 0 && q.x <= c.width && q.y >= 0 && q.y <= c.height)) both.push(t);
        }
      }
      const rep = [...count].filter(([, n]) => n > 1).map(([k, n]) => `${k} ×${n}`);
      if (both.length) return fail(`координата при лице в окне: ${both.slice(0, 4).join(' | ')}`);
      if (rep.length) return fail(`повтор координаты: ${rep.join(', ')}`);
      return pass(`подписей связей ${texts.length}: координат при обоих концах на экране 0, повторов 0`);
    },
  },
  {
    n: 1108,
    title: 'Решение 138: Иисус, 90 лет — ленты подписаны у края видимого участка «Мф 1» и «Лк 3» (различимы без цвета)',
    run: async (p) => {
      await go(p, '#/iisus~y-10~w90~l0~s1');
      const t = await data(p, 'ribbon-tags');
      if (!t.includes('Мф 1') || !t.includes('Лк 3')) return fail(`подписи лент: «${t}»`);
      return pass(`подписи лент: ${t}`);
    },
  },
  {
    n: 1109,
    title: 'Т4 (решение 137): союз «Иаков и Зелфа» выбран — Гад и Асир — концы связи с ролью «сын» (кольцо или указатель у края)',
    run: async (p) => {
      await go(p, '#/iakov~cu.iakov.zelfa._', 3600);
      const sel = await linkSel(p);
      if (!sel) return fail('союз не выбран');
      const kids = sel.ends.filter((e) => e.id === 'gad' || e.id === 'asir');
      if (kids.length < 2 || kids.some((e) => e.role !== 'сын')) return fail(`концы: ${sel.ends.map((e) => `${e.id}:${e.role}`).join(' ')}`);
      return pass(`концы союза: ${sel.ends.map((e) => `${e.id}:${e.role}:${e.on ? 'кольцо' : 'указатель'}`).join(', ')}`);
    },
  },
  {
    n: 1110,
    title: 'Решение 159: след Мехиаеля от звезды до ромба — связь «Мехиаель — Мафусал»: подсказка связи, щелчок выбирает её',
    run: async (p) => {
      await go(p, '#/mekhiael');
      const all = await rows(p);
      const node = all.find((q) => q.kind === 'node' && unionOf(q.ks) === 'mekhiael._._');
      if (!node) return fail('ромба союза Мехиаеля в кадре нет');
      const c = await canvasBox(p);
      // Мехиаель выбран: место его звезды — .sky[data-sel] (px холста)
      const star = await p.evaluate(() => {
        const s = (document.querySelector('.sky') as HTMLElement).dataset.sel;
        if (!s) return null;
        const [x, y] = s.split(' ').map(Number);
        return { x, y };
      });
      if (!star) return fail('выбранной звезды Мехиаеля нет');
      // имя под указателем — это лицо (решение 154): точка — на свободном от подписей участке следа между звездой и ромбом
      const y = node.pts[1];
      const boxes = (await data(p, 'label-boxes')).split(';').filter(Boolean).map((q) => q.split(':')[1].split(',').map(Number));
      let lo = star.x + 8;
      const hi = node.pts[0] - 6;
      for (const [bx, by, bw, bh] of boxes) if (y >= by - 1 && y <= by + bh + 1 && bx < hi && bx + bw > lo) lo = Math.max(lo, bx + bw + 2);
      if (hi - lo < 3) return fail(`след между звездой (${star.x}) и ромбом (${node.pts[0]}) весь под подписями`);
      const x = (lo + hi) / 2;
      await p.mouse.move(c.x + x, c.y + y);
      await p.waitForTimeout(700);
      const tip = ((await p.locator('.tip').first().textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ');
      if (!/Мафусал/.test(tip)) return fail(`подсказка на следе между звездой и ромбом (x ${Math.round(x)}): «${tip.slice(0, 120)}»`);
      await p.mouse.click(c.x + x, c.y + y);
      await p.waitForTimeout(1200);
      if (!/~c[ku]\.mekhiael\._\._/.test(p.url())) return fail(`после щелчка адрес: ${p.url()}`);
      return pass(`подсказка «${tip.trim().slice(0, 80)}»; выбрана связь ${p.url().split('~c')[1]}`);
    },
  },
  {
    n: 1111,
    // у Давида след от звезды до ромба Вирсавии — путь обеих лент (Соломон, Нафан): там лента и есть связь (решение 79),
    // и подсказка — шаг ленты; несколько союзов на следе без лент — у Халева, сына Есрома.
    // Этап 15 («Отчий дом», решение 173): Халев рождается в доме Есрома и переходит в свой дом; черты его браков и стволы
    // детей от матери не названной — на его следе в его доме (после перехода), туда и наводим: строку дома — по корням
    // черт его браков (data-links, вид bar, первый конец — на его следе), небо сдвигается к ней перетаскиванием
    title: 'Решение 159: след Халева в его доме — через него идут пути нескольких его союзов: подсказка «Связи дальше по следу»',
    run: async (p) => {
      await go(p, '#/khalev-syn-esroma');
      const c = await canvasBox(p);
      const KH = 'khalev-syn-esroma';
      const roots = async () =>
        (await rows(p)).filter((q) => q.kind === 'bar' && q.ks.startsWith(`s.${KH}.`) && q.ks.endsWith(`.${KH}`)).map((q) => ({ x: q.pts[0], y: q.pts[1] }));
      // строка дома — та, где корней больше
      const rowOf = (list: { y: number }[]) => {
        const by = new Map<number, number>();
        for (const q of list) by.set(Math.round(q.y), (by.get(Math.round(q.y)) ?? 0) + 1);
        return [...by].sort((a, b) => b[1] - a[1])[0][0];
      };
      // перетаскивание неба на dy px (шагами, чтобы указатель оставался над холстом)
      const drag = async (dy: number) => {
        const step = Math.max(-c.height / 3, Math.min(c.height / 3, dy));
        const x0 = c.x + c.width * 0.85;
        const y0 = c.y + c.height / 2 - step / 2;
        await p.mouse.move(x0, y0);
        await p.mouse.down();
        await p.mouse.move(x0, y0 + step / 2, { steps: 4 });
        await p.mouse.move(x0, y0 + step, { steps: 4 });
        await p.mouse.up();
        await p.waitForTimeout(500);
      };
      // дом Халева — выше его звезды (указатели шатра «↑ Азува» у верхней кромки): небо — вниз, пока не покажутся черты
      let rs = await roots();
      for (let k = 0; k < 12 && !rs.length; k++) {
        await drag(c.height / 3);
        rs = await roots();
      }
      if (!rs.length) return fail('черт браков Халева в кадре нет и выше его звезды');
      // строка дома — к середине холста
      for (let k = 0; k < 8; k++) {
        const dy = c.height / 2 - rowOf(rs);
        if (Math.abs(dy) < 40) break;
        await drag(dy);
        rs = await roots();
        if (!rs.length) return fail('черты браков Халева пропали при сдвиге неба');
      }
      const y = rowOf(rs);
      if (y < 0 || y > c.height) return fail(`строка дома Халева вне холста: ${y}`);
      // станции на следе Халева в его доме — узлы и концы линий его союзов на этой строке; точка — между соседними,
      // разошедшимися на 24 px: дальше по следу ещё несколько союзов
      const xs = [
        ...new Set(
          (await rows(p))
            .filter((q) => q.ks.includes(`.${KH}.`) || q.ks.endsWith(`.${KH}`))
            .flatMap((q) => segs(q.pts.length >= 4 ? q.pts : [...q.pts, ...q.pts]).flatMap((g) => [[g[0], g[1]], [g[2], g[3]]]))
            .filter(([x, yy]) => Math.abs(yy - y) < 1.5 && x > 0 && x < c.width)
            .map(([x]) => Math.round(x)),
        ),
      ].sort((a, b) => a - b);
      const gap = xs.findIndex((x, k) => k > 0 && x - xs[k - 1] >= 24);
      if (gap < 1) return fail(`на следе Халева в его доме нет двух станций дальше 24 px: ${xs.join(', ')}`);
      await p.mouse.move(c.x + (xs[gap - 1] + xs[gap]) / 2, c.y + y);
      await p.waitForTimeout(700);
      const tip = ((await p.locator('.tip').first().textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ');
      if (!/Связи дальше по следу/.test(tip)) return fail(`подсказка на следе (x ${Math.round((xs[gap - 1] + xs[gap]) / 2)}, y ${y}; станции ${xs.join(', ')}): «${tip.slice(0, 120)}»`);
      return pass(`строка дома ${y}, станции ${xs.join(', ')}; подсказка «${tip.trim().slice(0, 100)}»`);
    },
  },
];
