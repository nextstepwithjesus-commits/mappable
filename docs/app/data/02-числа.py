"""Числа документа 02 «Данные», редакция 4 (поправка).

Запуск из корня: python3 -I docs/app/data/02-числа.py
Читает: base/*.json, base/actors/*.json, base/lines/*.json, tools/base/admit.ts, tools/base/types.ts,
tools/bible/tsk.tsv, tools/bible/tsk-quarantine.tsv. Ничего не пишет. Вывод — приложение А документа 02.

Части:
  1. коллекции базы и число записей; коллекции, которые знает допуск (admit.ts);
  2. происхождение: виды, уровни, поля identity, saidBy, words, reading, refsShared, gapSuspected, skipped, outsideLists;
  3. союзы: виды обозначений, уровни, notMarriage, saidBy;
  4. родство словами Писания: уровни (остаток Д3-11);
  5. утверждения лиц: число, уровни, needsSources, saidBy, годы без модели, номер утверждения;
  6. «нет сведений»: виды, read, needsReading;
  7. наборы прочтений: толкования и авторы (строкой или ссылкой на реестр);
  8. реестр источников: по use и redistribute;
  9. номера: префиксы, эпохи без префикса, тёзки без уточнения;
 10. подписи второго ключа: ключи по коллекциям;
 11. TSK: строки таблицы и карантина.
"""
import collections, glob, json, re

C = collections.Counter


def load(f):
    return json.load(open(f, encoding='utf-8'))


def part(t):
    print(f'\n== {t}')


actors = {}
for f in sorted(glob.glob('base/actors/*.json')):
    for a in load(f)['items']:
        actors[a['id']] = a
origins = load('base/origins.json')['items']
unions = load('base/unions.json')['items']
kin = load('base/kin.json')['items']
readings = load('base/readings.json')['items']
nodata = load('base/nodata.json')['items']
epochs = load('base/epochs.json')['items']
areas = load('base/areas.json')['items']
members = load('base/memberships.json')['items']
chrono = load('base/chrono.json')['items']
sources = load('base/sources.json')['items']
checks = load('base/checks.json')['items']
redirects = load('base/redirects.json')['items']
anchors = load('base/anchors.json')
lines = {f: load(f) for f in sorted(glob.glob('base/lines/*.json'))}

# ---------------------------------------------------------------- 1
part('1. Коллекции базы')
facts = [(a['id'], f) for a in actors.values() for f in a.get('facts', [])]
for name, n in [('лица', len(actors)), ('утверждения лиц', len(facts)), ('происхождение (рёбра)', len(origins)),
                ('союзы', len(unions)), ('родство словами', len(kin)), ('наборы прочтений', len(readings)),
                ('области', len(areas)), ('членства', len(members)), ('нет сведений', len(nodata)),
                ('время (прежний вид)', len(chrono)), ('эпохи', len(epochs)), ('переадресации', len(redirects)),
                ('линии', len(lines)), ('опоры', len(anchors.get('anchors', []))), ('источники реестра', len(sources)),
                ('подписи', len(checks))]:
    print(f'{name}: {n}')
admit = open('tools/base/admit.ts', encoding='utf-8').read()
m = re.search(r"export const COLLS: Coll\[\] = \[(.*?)\];", admit)
colls = re.findall(r"'([a-z]+)'", m.group(1)) if m else []
print('коллекций в допуске:', len(colls), '—', ', '.join(colls))
for want in ['story', 'place', 'relation', 'event', 'model', 'mention', 'route']:
    print(f'  коллекция «{want}» в допуске:', 'да' if want in colls else 'нет')
types = open('tools/base/types.ts', encoding='utf-8').read()
for t in ['interface Story', 'interface Place', 'interface Relation', 'interface Understanding', 'interface Cite',
          'interface Model', 'interface Tension']:
    print(f'  в types.ts «{t.splitlines()[0]}»:', 'есть' if t in types else 'нет')

# ---------------------------------------------------------------- 2
part('2. Происхождение')
print('вид:', ', '.join(f'{k} {v}' for k, v in C(o['kind'] for o in origins).most_common()))
print('уровень:', ', '.join(f'{k} {v}' for k, v in C(o['cert'] for o in origins).most_common()))
print('уровень «толкование» вне набора прочтений:', sum(o['cert'] == 'interpretation' and 'reading' not in o for o in origins))
print('с номером ребра (id):', sum('id' in o for o in origins), 'из', len(origins))
idt = [o for o in origins if 'identity' in o]
print('с полем identity:', len(idt), '—', ', '.join(f'{k} {v}' for k, v in C(o['identity']['degree'] for o in idt).items()),
      '; чьё:', ', '.join(f'{k} {v}' for k, v in C(o['identity']['of'] for o in idt).items()))
print('рисуемых (без identity «possible»):', sum(not ('identity' in o and o['identity']['degree'] == 'possible') for o in origins))
for fld in ['saidBy', 'words', 'reading', 'refsShared', 'gapSuspected', 'gapPossible', 'skipped', 'outsideLists', 'unnamedParent', 'gap']:
    print(f'с полем {fld}:', sum(fld in o for o in origins))
print('parents-word:', [(o['child'], o['parent']) for o in origins if o['kind'] == 'parents-word'])
v = [o for o in origins if o['child'] == 'p-valtasar-tsar']
print('Валтасар:', [(o['parent'], o['kind'], o['cert'], o['primary']) for o in v])

# ---------------------------------------------------------------- 3
part('3. Союзы')
terms = [(u['id'], t) for u in unions for t in u['terms']]
print('обозначений:', len(terms), '; виды:', ', '.join(f'{k} {v}' for k, v in C(t['kind'] for _, t in terms).most_common()))
print('уровни обозначений:', ', '.join(f'{k} {v}' for k, v in C(t.get('cert', 'scripture') for _, t in terms).most_common()))
print('notMarriage:', [u for u, t in terms if 'notMarriage' in t])
print('saidBy:', [u for u, t in terms if 'saidBy' in t])
print('ended:', [u for u, t in terms if 'ended' in t])

# ---------------------------------------------------------------- 4
part('4. Родство словами Писания')
print('уровни:', ', '.join(f'{k} {v}' for k, v in C(k_.get('cert', 'scripture') for k_ in kin).most_common()))
print('saidBy:', sum('saidBy' in k_ for k_ in kin))

# ---------------------------------------------------------------- 5
part('5. Утверждения лиц')
print('уровни:', ', '.join(f'{k} {v}' for k, v in C(f.get('cert', 'scripture') for _, f in facts).most_common()))
q = sum(((f.get('prov') or {}).get('status') or (actors[a].get('prov') or {}).get('status')) == 'quarantine' for a, f in facts)
print('в карантине:', q)
print('needsSources:', sum(bool(f.get('needsSources')) for _, f in facts))
print('saidBy у утверждений:', sum('saidBy' in f for _, f in facts))
print('с номером утверждения (id):', sum('id' in f for _, f in facts))
yr = 0
for _, f in facts:
    val = f.get('value')
    if isinstance(val, dict) and any(k in val for k in ('year', 'from', 'to')):
        yr += 1
print('с годом внутри значения (year/from/to):', yr)
print('полей-ящиков:', len(C(f['field'] for _, f in facts)))

# ---------------------------------------------------------------- 6
part('6. «Нет сведений»')
print('виды:', ', '.join(f'{k} {v}' for k, v in C(n['kind'] for n in nodata).most_common()))
print('с read:', sum(bool(n.get('read')) for n in nodata), '; needsReading:', sum(bool(n.get('needsReading')) for n in nodata))

# ---------------------------------------------------------------- 7
part('7. Наборы прочтений')
interp = [(r['id'], x) for r in readings for x in r['readings'] if x['cert'] == 'interpretation']
print('прочтений всего:', sum(len(r['readings']) for r in readings), '; толкований:', len(interp))
print('толкований с авторами строкой:', sum(bool(x.get('authors')) and all(isinstance(a, str) for a in x['authors']) for _, x in interp))
print('толкований с авторами ссылкой на реестр (cites):', sum(bool(x.get('cites')) for _, x in interp))
print('наборы с толкованиями:', sorted({r for r, _ in interp}))

# ---------------------------------------------------------------- 8
part('8. Реестр источников')
print('по use:', ', '.join(f'{k} {v}' for k, v in C(s['use'] for s in sources).most_common()))
print('redistribute true:', sum(s['redistribute'] for s in sources), '; false:', sum(not s['redistribute'] for s in sources))
print('src-r9-*:', sum(s['id'].startswith('src-r9-') for s in sources), '; из них redistribute false:',
      sum(s['id'].startswith('src-r9-') and not s['redistribute'] for s in sources))
print('NOASSERTION:', [s['id'] for s in sources if s['spdx'] == 'NOASSERTION'])
tsk = [s for s in sources if s['id'] == 'src-tsk']
print('src-tsk:', (tsk[0]['spdx'], tsk[0]['use'], tsk[0]['redistribute']) if tsk else 'нет')
for want in ['src-wikidata', 'src-strong', 'src-openbible-xref', 'src-oshb', 'src-macula-greek']:
    print(f'  {want}:', 'есть' if any(s['id'] == want for s in sources) else 'нет')

# ---------------------------------------------------------------- 9
part('9. Номера')
print('префиксы лиц:', C(a.split('-')[0] for a in actors))
print('эпохи с префиксом вида записи:', sum(e['id'].startswith(('e-', 'era-')) for e in epochs), 'из', len(epochs), '— номера:', ', '.join(e['id'] for e in epochs))
print('наборы прочтений «r-»:', sum(r['id'].startswith('r-') for r in readings), 'из', len(readings))
forms = C()
for a in actors.values():
    if a.get('names'):
        forms[a['names'][0]['form']] += 1
namesakes = [a for a in actors.values() if a.get('names') and forms[a['names'][0]['form']] > 1]
print('лиц с тёзками (по основному имени):', len(namesakes), '; без disambig:',
      sorted({a['names'][0]['form'] for a in namesakes if not a.get('disambig')}))
print('номеров лиц длиннее 24 знаков:', sum(len(i) > 24 for i in actors))
print('лиц вида divine:', sum(a['kind'] == 'divine' for a in actors.values()))

# ---------------------------------------------------------------- 10
part('10. Подписи второго ключа')
print('по коллекциям:', ', '.join(f'{k} {v}' for k, v in C(c['key'].split(':')[0] for c in checks).most_common()))
print('кем:', ', '.join(f'{k} {v}' for k, v in C(c['kind'] for c in checks).most_common()))

# ---------------------------------------------------------------- 11
part('11. TSK')
n = sum(1 for _ in open('tools/bible/tsk.tsv', encoding='utf-8')) - 1
nq = sum(1 for _ in open('tools/bible/tsk-quarantine.tsv', encoding='utf-8')) - 1
print('строк tsk.tsv (стих × группа):', n, '; строк карантина:', nq)

# ---------------------------------------------------------------- 12 (ред. 4.1)
part('12. Ред. 4.1: перенос подписей, скобки, опоры, прежние места и события')
legacy = C(c['key'].split(':')[0] for c in checks)
move = {k: legacy.get(k, 0) for k in ('origin', 'fact', 'kin', 'epoch', 'reading')}
print('подписей со сменой ключа (рёбра, утверждения, родство словами, эпохи):',
      move['origin'] + move['fact'] + move['kin'] + move['epoch'], '—', move)
print('подпись набора прочтений (меняется содержимое при переходе на work):', move['reading'])
import csv
br = list(csv.DictReader(open('tools/bible/brackets.tsv', encoding='utf-8'), delimiter='\t'))
byk = C((r['вид'], r['чем проверено']) for r in br)
print('скобок всего:', len(br), '; по признакам: lxx', byk[('lxx', 'по признакам')], ', added', byk[('added', 'по признакам')])
print('по видам:', ', '.join(f'{k} {v}' for k, v in C(r['вид'] for r in br).most_common()))
an = anchors.get('anchors', [])
print('опор:', len(an), '; с альтернативами:', sum(bool(a.get('alternatives')) for a in an), '; номера:', ', '.join(a['id'] for a in an[:5]), '…')
pl = [f for _, f in facts if f['field'] == 'places']
names = {json.dumps((f.get('value') or {}).get('name'), ensure_ascii=False) for f in pl}
print('прежние записи раздела «места» в base:', len(pl), '; разных строк:', len(names))
print('прежние записи «events» (раздел § 17):', sum(f['field'] == 'events' for _, f in facts))
print('лиц по видам:', ', '.join(f'{k} {v}' for k, v in C(a['kind'] for a in actors.values()).most_common()))

# ---------------------------------------------------------------- 13
part('13. Бюджеты пакетов (Р-11): docs/app/data/02-составитель/бюджеты.ts')
import subprocess, sys
out = subprocess.run(['npx', 'tsx', 'docs/app/data/02-составитель/бюджеты.ts'], capture_output=True, text=True)
print(out.stdout.rstrip() if out.returncode == 0 else out.stderr)
