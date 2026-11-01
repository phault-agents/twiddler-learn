/*
 * Builds a lesson plan from whatever layout is loaded, then generates practice text for it.
 * Letters come first, easiest chords first (fewest keys), ties broken by how common the letter is.
 */
(function (root) {
  'use strict';
  const T4 = (root.T4 = root.T4 || {});

  const LETTER_FREQ = 'etaoinshrdlcumwfgypbvkjxqz';
  const PUNCT = ".,'?!-;:\"";
  const LESSON_SIZES = [5, 4, 3, 3, 3, 3, 3, 3, 3, 3];

  function textChord(layout, s) {
    return T4.chordForText(layout, s);
  }

  function buildPlan(layout) {
    const lessons = [];
    const letters = LETTER_FREQ.split('')
      .map((ch) => ({ ch, hit: textChord(layout, ch) }))
      .filter((x) => x.hit)
      .sort((a, b) => a.hit.chord.cost - b.hit.chord.cost || LETTER_FREQ.indexOf(a.ch) - LETTER_FREQ.indexOf(b.ch))
      .map((x) => x.ch);

    const known = [];
    let i = 0;
    let n = 0;
    while (i < letters.length) {
      const size = LESSON_SIZES[Math.min(n, LESSON_SIZES.length - 1)];
      let chunk = letters.slice(i, i + size);
      // Fold a lone leftover letter into this lesson rather than giving it its own.
      if (letters.length - (i + size) === 1) chunk = letters.slice(i);
      known.push(...chunk);
      lessons.push({
        id: 'letters-' + chunk.join(''),
        group: 'Letters',
        title: chunk.join(' '),
        kind: 'letters',
        newChars: chunk,
        chars: known.slice(),
      });
      i += chunk.length;
      n++;
    }

    const has = (c) => !!textChord(layout, c);
    if (letters.length >= 10) {
      if (has('A') || has('E') || has('T')) {
        lessons.push({ id: 'caps', group: 'Beyond letters', title: 'Capitals', kind: 'caps', newChars: [], chars: letters.slice() });
      }
      const punct = PUNCT.split('').filter(has);
      if (punct.length) {
        lessons.push({ id: 'punct', group: 'Beyond letters', title: 'Punctuation  ' + punct.join(' '), kind: 'punct', newChars: punct, chars: letters.concat(punct) });
      }
      const digits = '1234567890'.split('').filter(has);
      if (digits.length) {
        lessons.push({ id: 'digits', group: 'Beyond letters', title: 'Numbers', kind: 'digits', newChars: digits, chars: digits });
      }
      const symbols = [];
      for (const c of layout.chords) {
        const t = c.text;
        if (t && t.length === 1 && /[^A-Za-z0-9\s]/.test(t) && !PUNCT.includes(t) && !symbols.includes(t)) symbols.push(t);
      }
      symbols.sort();
      if (symbols.length) {
        lessons.push({ id: 'symbols', group: 'Beyond letters', title: 'Symbols', kind: 'symbols', newChars: symbols, chars: symbols });
      }
    }

    // Multi-character chords ("the", "ing" ...), most useful first.
    const mccs = [];
    for (const c of layout.chords) {
      const t = c.text;
      if (t && /^[a-z]{2,}$/.test(t) && !mccs.includes(t)) mccs.push(t);
    }
    if (mccs.length) {
      const words = T4.WORDS || [];
      const score = {};
      for (const m of mccs) score[m] = 0;
      words.forEach((w, rank) => {
        const weight = 1 / (rank + 10);
        for (const m of mccs) if (w.includes(m)) score[m] += weight * (w === m ? 3 : 1);
      });
      mccs.sort((a, b) => score[b] - score[a]);
      for (let j = 0, part = 1; j < mccs.length; j += 5, part++) {
        const chunk = mccs.slice(j, j + 5);
        lessons.push({
          id: 'mcc-' + chunk.join('-'),
          group: 'Shortcut chords',
          title: chunk.join(' '),
          kind: 'mcc',
          newChars: chunk,
          chars: letters.slice(),
        });
      }
    }
    return lessons;
  }

  /* ---------- text generation ---------- */

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  }

  function pick(arr, rand) {
    return arr[Math.floor(rand() * arr.length)];
  }

  function wordsUsing(chars, words) {
    const set = new Set(chars);
    return words.filter((w) => [...w].every((c) => set.has(c)));
  }

  function pseudoWord(chars, must, rand) {
    const len = 2 + Math.floor(rand() * 3);
    const out = [];
    for (let i = 0; i < len; i++) out.push(pick(chars, rand));
    out[Math.floor(rand() * len)] = pick(must, rand);
    return out.join('');
  }

  // Picks words, favouring common ones but not always the same few.
  function sampleWords(pool, count, rand, avoidRepeat) {
    const out = [];
    if (!pool.length) return out;
    const top = pool.slice(0, Math.max(30, Math.min(pool.length, 400)));
    for (let i = 0; i < count; i++) {
      let w;
      for (let tries = 0; tries < 6; tries++) {
        const r = rand();
        w = top[Math.floor(r * r * top.length)];
        if (!avoidRepeat || out[out.length - 1] !== w) break;
      }
      out.push(w);
    }
    return out;
  }

  function lessonText(layout, lesson, opts) {
    opts = opts || {};
    const rand = rng(opts.seed || Date.now());
    const count = opts.words || 14;
    const words = T4.WORDS || [];
    const usable = (w) => [...w].every((c) => T4.chordForText(layout, c));

    if (lesson.kind === 'letters') {
      const pool = wordsUsing(lesson.chars, words);
      const fresh = pool.filter((w) => lesson.newChars.some((c) => w.includes(c)));
      const out = [];
      const nFresh = Math.round(count * 0.6);
      // With few real words available, mix in short letter groups so the drill doesn't repeat itself.
      const nReal = fresh.length >= 40 ? nFresh : Math.min(fresh.length, Math.round(nFresh * 0.5));
      out.push(...sampleWords(fresh, nReal, rand, true));
      while (out.length < nFresh) out.push(pseudoWord(lesson.chars, lesson.newChars, rand));
      const rest = sampleWords(pool.length >= 8 ? pool : pool.concat(fresh), count - out.length, rand, true);
      out.push(...rest);
      while (out.length < count) out.push(pseudoWord(lesson.chars, lesson.newChars, rand));
      return shuffle(out, rand).join(' ');
    }

    if (lesson.kind === 'caps') {
      const pool = wordsUsing(lesson.chars, words);
      return sampleWords(pool, count, rand, true)
        .map((w, i) => (i === 0 || rand() < 0.5 ? w[0].toUpperCase() + w.slice(1) : w))
        .join(' ');
    }

    if (lesson.kind === 'punct') {
      const pool = wordsUsing(lesson.chars, words);
      const p = lesson.newChars;
      return sampleWords(pool, count, rand, true)
        .map((w) => {
          const r = rand();
          const mark = pick(p, rand);
          if (mark === '"' || mark === "'") return r < 0.5 ? mark + w + mark : w;
          if (mark === '-') return r < 0.5 ? w + '-' + pick(pool.slice(0, 80), rand) : w;
          return r < 0.7 ? w + mark : w;
        })
        .join(' ');
    }

    if (lesson.kind === 'digits' || lesson.kind === 'symbols' || lesson.kind === 'drill') {
      const chars = lesson.chars;
      const out = [];
      for (let i = 0; i < count; i++) {
        const len = lesson.kind === 'digits' ? 1 + Math.floor(rand() * 4) : 1 + Math.floor(rand() * 3);
        let tok = '';
        for (let j = 0; j < len; j++) tok += pick(chars, rand);
        out.push(tok);
      }
      return out.join(' ');
    }

    if (lesson.kind === 'mcc') {
      const out = [];
      for (const m of lesson.newChars) out.push(m);
      const containing = words.filter((w) => lesson.newChars.some((m) => w.includes(m)) && usable(w));
      out.push(...sampleWords(containing, Math.max(0, count - out.length), rand, true));
      return shuffle(out, rand).join(' ');
    }

    if (lesson.kind === 'weak') {
      const weights = lesson.weights || {};
      const pool = words.filter(usable).slice(0, 1500);
      const scored = pool
        .map((w, rank) => {
          let s = 0;
          for (const c of w) s += weights[c] || 0;
          return { w, s: s / Math.sqrt(w.length) - rank / 3000 };
        })
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 60)
        .map((x) => x.w);
      return shuffle(sampleWords(scored.length ? scored : pool, count, rand, true), rand).join(' ');
    }

    if (lesson.kind === 'custom') {
      return String(lesson.text || '').replace(/\s+/g, ' ').trim();
    }
    return '';
  }

  function shuffle(arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  Object.assign(T4, { buildPlan, lessonText });
})(typeof window !== 'undefined' ? window : globalThis);
