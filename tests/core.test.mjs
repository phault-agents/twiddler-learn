// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

for (const f of ['core', 'words', 'lessons', 'layouts']) vm.runInThisContext(readFileSync(new URL('../js/' + f + '.js', import.meta.url), 'utf8'));
const T4 = globalThis.T4;
const backspice = T4.parseLayoutText(T4.BUILTIN_LAYOUTS[0].source, 'Backspice');

test('Backspice parses cleanly and covers the alphabet', () => {
  assert.deepEqual(backspice.warnings, []);
  assert.ok(backspice.chords.length > 200);
  for (const c of 'abcdefghijklmnopqrstuvwxyz') assert.ok(T4.chordForText(backspice, c), 'missing ' + c);
});

test('Backspice chords match the published cheat sheet', () => {
  const expect = { s: 'LOOO', ' ': 'MOOO', i: 'OROO', e: 'OMOO', o: 'OLOO', n: 'OORO', t: 'OOMO', r: 'OOLO', a: 'OOOR', h: 'OOOM', in: 'ORRO', the: 'OMMM', d: 'MORO', m: 'MOOM' };
  for (const [text, classic] of Object.entries(expect)) {
    assert.equal(T4.formatClassic(T4.chordForText(backspice, text).keys), classic, text);
  }
  const bs = T4.chordFor(backspice, T4.parseChord('ROOO'));
  assert.equal(bs.tokens[0].key, 'Backspace');
});

test('personal macros were removed', () => {
  const src = T4.BUILTIN_LAYOUTS[0].source;
  assert.doesNotMatch(src, /\w@\w|650-|samsung|vladimir|alex ?bravo =|= alex/i);
});

test('chord notation round-trips between classic and Twiddler 4 forms', () => {
  assert.deepEqual(T4.parseChord('S OLLO'), ['T4', 'F2L', 'F3L']);
  assert.deepEqual(T4.parseChord('T4 F2L F3L'), ['T4', 'F2L', 'F3L']);
  assert.deepEqual(T4.parseChord('T14F0M2R'), ['T1', 'T4', 'F0M', 'F2R']);
  assert.deepEqual(T4.parseChord('NA (LM)OOR'), ['T1', 'T2', 'F1L', 'F1M', 'F4R']);
  assert.equal(T4.formatClassic(['T1', 'F1L', 'F1M']), 'N (LM)OOO');
  assert.equal(T4.formatClassic(['F0M']), null);
  assert.equal(T4.formatT4(['F3M', 'T4', 'F1L']), 'T4 F1L F3M');
  assert.throws(() => T4.parseChord('T5 F1L'));
  assert.throws(() => T4.parseChord('LLL'));
});

test('capitals fall back to Shift plus the lowercase chord', () => {
  const hit = T4.chordForText(backspice, 'E');
  assert.ok(hit.implicitShift);
  assert.deepEqual(hit.keys, ['T4', 'F2M']);
  assert.equal(T4.chordForText(backspice, 'In').implicitShift, false);
});

test('multi-character chords are found at a position', () => {
  const m = T4.mccAt(backspice, 'xthere', 1);
  assert.equal(m.text, 'the');
});

test('output escapes survive a text round trip', () => {
  const src = '# name: T\nOOOR = \\<\nOOOM = \\\\\nOOOL = <Space>\nOOLO = <Ctrl+Shift+z>\nOOLM = a b\nOOLL = <Cmd++>\n';
  const a = T4.parseLayoutText(src);
  assert.deepEqual(a.warnings, []);
  assert.equal(T4.chordForText(a, '<').chord.text, '<');
  assert.equal(T4.chordForText(a, '\\').chord.text, '\\');
  assert.equal(T4.chordForText(a, ' ').chord.text, ' ');
  assert.equal(T4.chordForText(a, 'a b').chord.text, 'a b');
  const b = T4.parseLayoutText(T4.layoutToText(a));
  assert.deepEqual(b.chords.map((c) => c.id + '=' + c.label), a.chords.map((c) => c.id + '=' + c.label));
  assert.equal(T4.chordFor(a, ['F4L', 'F3L']).label, '⌘+');
});

test('the full Backspice layout round-trips through the text format', () => {
  const again = T4.parseLayoutText(T4.layoutToText(backspice));
  assert.equal(again.chords.length, backspice.chords.length);
  for (const c of again.chords) assert.equal(backspice.byId.get(c.id).label, c.label);
});

test('mirroring swaps the L and R columns', () => {
  const m = T4.mirrorLayout(backspice);
  assert.equal(T4.formatClassic(T4.chordForText(m, 's').keys), 'ROOO');
  assert.equal(T4.formatClassic(T4.chordForText(m, 'in').keys), 'OLLO');
});

test('Tuner CSV import reads modifiers and quoting', () => {
  const csv = '"Chord","Key Strokes"\n"   O ROOO","<Backspace>"\n"   N LOOO","<Left GUI>s</Left GUI>"\n"   O RMOM",""""\n"   S LROO","Is"\n';
  const l = T4.importLayout(csv, 'x.csv');
  assert.deepEqual(l.warnings, []);
  assert.equal(l.chords.length, 4);
  assert.equal(T4.chordFor(l, ['T1', 'F1L']).label, '⌘S');
  assert.equal(T4.chordForText(l, '"').chord.text, '"');
  assert.equal(T4.chordForText(l, 'Is').chord.id, 'T4+F1L+F2R');
});

test('tutor JSON import reads named keys', () => {
  const l = T4.importLayout(JSON.stringify({ chords: [{ chord: 'N LOOO', key: '7' }, { chord: 'NA LOOO', key: 'f1' }, { chord: 'MMOO', key: ' ' }] }), 'x.json');
  assert.equal(T4.chordForText(l, '7').chord.id, 'T1+F1L');
  assert.equal(T4.chordFor(l, ['T1', 'T2', 'F1L']).label, 'F1');
  assert.equal(T4.chordForText(l, ' ').chord.id, 'F1M+F2M');
});

test('v5 binary import decodes chords, shift and multi-character strings', () => {
  // header (16 bytes), 3 chords, 1 string-table entry, then the string.
  const buf = new Uint8Array(16 + 12 + 4 + 8);
  const dv = new DataView(buf.buffer);
  buf[0] = 5;
  dv.setUint16(2, 3, true);
  const chord = (i, bits, lo, hi) => {
    dv.setUint16(16 + i * 4, bits, true);
    buf[18 + i * 4] = lo;
    buf[19 + i * 4] = hi;
  };
  chord(0, 1 << 1, 0, 0x2a); // F1R -> Backspace
  chord(1, (1 << 12) | (1 << 3), 0x20, 0x04); // S + F1L -> shift+a = "A"
  chord(2, 1 << 6, 0xff, 0); // F2M -> string 0
  dv.setUint32(28, 32, true);
  dv.setUint16(32, 6, true); // length incl. header: 2 entries
  buf[34] = 0; buf[35] = 0x17; // t
  buf[36] = 0; buf[37] = 0x0b; // h
  const l = T4.importLayout(buf.buffer, 'twiddler.cfg');
  assert.equal(T4.chordFor(l, ['F1R']).tokens[0].key, 'Backspace');
  assert.equal(T4.chordFor(l, ['T4', 'F1L']).text, 'A');
  assert.equal(T4.chordFor(l, ['F2M']).text, 'th');
  assert.throws(() => T4.importLayout(new Uint8Array([7, 0, 0, 0]).buffer, 'new.cfg'), /version 7/);
});

test('lesson plan starts with one-key letters and generates typeable text', () => {
  const plan = T4.buildPlan(backspice);
  assert.deepEqual(plan[0].newChars, ['e', 't', 'a', 'o', 'i']);
  const letters = plan.filter((l) => l.kind === 'letters').flatMap((l) => l.newChars);
  assert.equal(letters.length, 26);
  for (const lesson of plan) {
    const text = T4.lessonText(backspice, lesson, { seed: 42, words: 14 });
    assert.ok(text.length > 0, lesson.id);
    for (const ch of text) assert.ok(T4.chordForText(backspice, ch), lesson.id + ': no chord for ' + JSON.stringify(ch));
    if (lesson.kind === 'letters') for (const ch of text.replace(/ /g, '')) assert.ok(lesson.chars.includes(ch), lesson.id + ' uses ' + ch);
  }
});

test('a tiny layout still gets a usable plan', () => {
  const l = T4.parseLayoutText('OOOR = a\nOOOM = b\nOOOL = c\nOOMO = <Space>');
  const plan = T4.buildPlan(l);
  assert.equal(plan.length, 1);
  assert.match(T4.lessonText(l, plan[0], { seed: 1 }), /^[abc ]+$/);
});
