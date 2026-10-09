# Контраст (WCAG 2.x) для графики шкалы 04 по токенам R8 § 4.2
def lin(c):
    c = c / 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
def hx(h): h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
def L(h): r, g, b = hx(h) if isinstance(h, str) else h; return 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b)
def cr(a, b):
    la, lb = L(a), L(b); la, lb = max(la, lb), min(la, lb); return (la + 0.05) / (lb + 0.05)
def mix(fg, bg, a):
    f, b = hx(fg), hx(bg); return tuple(round(a*f[i] + (1-a)*b[i]) for i in range(3))
def h(t): return '#%02X%02X%02X' % t
T = {
 'light': dict(fon='#F4F6F9', list='#FFFFFF', pod='#E8ECF1', ink='#18202C', ink2='#4A5463', line='#6E7888', grid='#C9D0DA', sel='#FFD43B'),
 'dark':  dict(fon='#161D27', list='#1E2733', pod='#2A3442', ink='#E8ECF1', ink2='#A9B3C1', line='#7A8596', grid='#3A4555', sel='#F0D04A'),
}
CAT = ['#D55E00', '#009E73', '#E69F00', '#56B4E9']
for th, t in T.items():
    print('==', th)
    # ленты эпох: чередование фон / подложка — видна ли граница ленты
    print('лента эпохи: подложка к фону %.2f; к листу %.2f' % (cr(t['pod'], t['fon']), cr(t['pod'], t['list'])))
    print('«граница примерная» полосой цвета «сетка»: к фону %.2f, к подложке %.2f' % (cr(t['grid'], t['fon']), cr(t['grid'], t['pod'])))
    print('«граница по числам» тонкой линией «линия»: к фону %.2f, к подложке %.2f' % (cr(t['line'], t['fon']), cr(t['line'], t['pod'])))
    # ядро чернилами и края бледной полосой (способ Б)
    for a in (0.25, 0.35, 0.5):
        edge = mix(t['ink'], t['list'], a)
        print('край Б = чернила %d%% на листе %s: край к листу %.2f; ядро к краю %.2f' % (a*100, h(edge), cr(edge, t['list']), cr(t['ink'], edge)))
    for c in CAT:
        for a in (0.35,):
            edge = mix(c, t['list'], a)
            print('дорожка %s: ядро к листу %.2f; край %d%% %s к листу %.2f; ядро к краю %.2f' % (c, cr(c, t['list']), a*100, h(edge), cr(edge, t['list']), cr(c, edge)))
    # призрак модели
    for a in (0.2, 0.3, 0.4):
        g = mix(t['ink'], t['list'], a); print('призрак = чернила %d%%: к листу %.2f' % (a*100, cr(g, t['list'])))
    # приглушённые события при подсветке из Географии: подпись «чернила-2» с непрозрачностью
    for a in (0.6, 0.7, 0.8):
        g = mix(t['ink2'], t['list'], a); print('подпись чернила-2 при непрозрачности %d%%: к листу %.2f' % (a*100, cr(g, t['list'])))
    # тонкая фоновая подпись (чернила-2) на подложке ленты
    print('фоновая подпись чернила-2 на подложке: %.2f; на фоне %.2f' % (cr(t['ink2'], t['pod']), cr(t['ink2'], t['fon'])))
    # кольцо фокуса (чернила) у знака категориального цвета и у плашки выбора
    for c in CAT: print('кольцо фокуса чернилами к знаку %s: %.2f' % (c, cr(t['ink'], c)))
    print('кольцо фокуса чернилами к плашке выбора: %.2f; плашка выбора к листу %.2f' % (cr(t['ink'], t['sel']), cr(t['sel'], t['list'])))
    # перемычка общего события «линия» поверх знаков
    for c in CAT: print('перемычка «линия» к знаку %s: %.2f' % (c, cr(t['line'], c)))
    # подсветка «кольцо» жёлтым у события
print('== окно непрозрачности края Б (чернила на листе): край к листу >= 3 и ядро к краю >= 3')
for th, t in T.items():
    ok = []
    for k in range(5, 100):
        a = k / 100; e = mix(t['ink'], t['list'], a)
        if cr(e, t['list']) >= 3 and cr(t['ink'], e) >= 3: ok.append(k)
    print(th, ('%d–%d %%' % (ok[0], ok[-1])) if ok else 'нет ни одной')
    for c in CAT:
        ok = [k for k in range(5, 100) if cr(mix(c, t['list'], k/100), t['list']) >= 3 and cr(c, mix(c, t['list'], k/100)) >= 3]
        print('  дорожка', c, ('%d–%d %%' % (ok[0], ok[-1])) if ok else 'нет ни одной')
