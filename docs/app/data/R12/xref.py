"""Проба R12: какие места других книг даёт OpenBible (TSK) для историй пробы."""
import json, sys, collections, re
REPO, XREF, STORIES = sys.argv[1], sys.argv[2], sys.argv[3]
T = int(sys.argv[4]) if len(sys.argv) > 4 else 5
OSIS = ['Gen','Exod','Lev','Num','Deut','Josh','Judg','Ruth','1Sam','2Sam','1Kgs','2Kgs','1Chr','2Chr','Ezra','Neh','Esth','Job','Ps','Prov','Eccl','Song','Isa','Jer','Lam','Ezek','Dan','Hos','Joel','Amos','Obad','Jonah','Mic','Nah','Hab','Zeph','Hag','Zech','Mal','Matt','Mark','Luke','John','Acts','Jas','1Pet','2Pet','1John','2John','3John','Jude','Rom','1Cor','2Cor','Gal','Eph','Phil','Col','1Thess','2Thess','1Tim','2Tim','Titus','Phlm','Heb','Rev']
order = []
for line in open(f'{REPO}/tools/bible/synodal.tsv', encoding='utf-8'):
    b = line.split('\t', 1)[0]
    if not order or order[-1] != b: order.append(b)
assert len(order) == 66
S2O = dict(zip(order, OSIS)); O2S = {o: s for s, o in S2O.items()}
vm = json.load(open(f'{REPO}/base/versification/synodal-kjv.json'))['map']
k2s = collections.defaultdict(list)
for s, ks in vm.items():
    for k in ks: k2s[k].append(s)
def syn2kjv(book, ch, v):
    key = f'{book} {ch}:{v}'
    if key in vm: return vm[key]
    return [f'{S2O[book]}.{ch}.{v}']
def kjv2syn(k):
    if k in k2s: return k2s[k][0]
    b, c, v = k.split('.')
    return f'{O2S[b]} {c}:{v}'
out = collections.defaultdict(list)
for line in open(XREF, encoding='utf-8'):
    if line.startswith('From'): continue
    a, b, n = line.rstrip('\n').split('\t'); out[a].append((b, int(n)))
for st in json.load(open(STORIES, encoding='utf-8')):
    book = st['book']; hits = collections.Counter(); best = {}
    for seg in st['refs']:
        m = re.match(r'(\d+):(\d+)-(?:(\d+):)?(\d+)$', seg)
        c1, v1, c2, v2 = int(m[1]), int(m[2]), int(m[3] or m[1]), int(m[4])
        verses = []
        for line in open(f'{REPO}/tools/bible/synodal.tsv', encoding='utf-8') if False else []: pass
        c, v = c1, v1
        while (c, v) <= (c2, v2):
            verses.append((c, v)); v += 1
            if v > 200: c, v = c + 1, 1
        for c, v in verses:
            for k in syn2kjv(book, c, v):
                for tgt, n in out.get(k, []):
                    if n < T: continue
                    tb = tgt.split('.')[0]
                    if tb == S2O[book]: continue
                    t0 = tgt.split('-')[0]
                    key = kjv2syn(t0)
                    hits[O2S[tb]] += 1
                    best[key] = max(best.get(key, 0), n)
    top = sorted(best.items(), key=lambda x: -x[1])[:14]
    print(f"\n## {st['id']} {book} {';'.join(st['refs'])} — книг {len(hits)}, ссылок {sum(hits.values())}")
    print('  ', ', '.join(f'{k}({n})' for k, n in top))
