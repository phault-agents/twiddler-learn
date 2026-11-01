"""Build js/words.js input: count word frequencies in Project Gutenberg texts.
Usage: python3 tools/wordlist.py <dir of .txt books> <out.json>"""
import re, sys, glob, json, collections
low, cap = collections.Counter(), collections.Counter()
for f in glob.glob(sys.argv[1] + '/*.txt'):
    t = open(f, encoding='utf-8', errors='ignore').read()
    a = t.find('*** START'); b = t.find('*** END')
    t = t[t.find('\n', a) if a >= 0 else 0 : b if b > 0 else None]
    for w in re.findall(r"[A-Za-z]+(?:'[a-z]+)?", t):
        if "'" in w: continue
        if w.islower(): low[w] += 1
        elif w[0].isupper() and w[1:].islower(): cap[w.lower()] += 1
skip = set('thee thou thy thine ye hath doth shalt mr mrs st chapter gutenberg ebook ah oh sir madam'.split())
words = [w for w, n in low.most_common()
         if (len(w) > 1 or w in ('a',)) and w not in skip and n >= 12 and low[w] > cap[w] * 0.5]
words = words[:2000]
open(sys.argv[2], 'w').write(json.dumps(words))
print(len(words), words[:40], words[1000:1020], words[-20:])
