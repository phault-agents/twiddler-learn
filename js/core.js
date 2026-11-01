/*
 * Layout model and file formats for the Twiddler 4 chord trainer.
 *
 * Key ids
 *   Thumb buttons:  T1 T2 T3 T4   (legacy names N A C S: Num, Alt, Ctrl, Shift)
 *   Finger buttons: F<row><col>   row 0 = the three mini buttons, rows 1-4 = index..pinky,
 *                                 col = L, M or R
 *
 * A chord is a set of key ids. Its canonical id lists thumbs first, then finger keys by row,
 * e.g. "T4+F1R+F3M".
 */
(function (root) {
  'use strict';
  const T4 = (root.T4 = root.T4 || {});

  const THUMB_LETTERS = { N: 'T1', A: 'T2', C: 'T3', S: 'T4' };
  const THUMB_NAMES = { T1: 'N', T2: 'A', T3: 'C', T4: 'S' };
  const THUMB_LONG = { T1: 'Num', T2: 'Alt', T3: 'Ctrl', T4: 'Shift' };
  const COLS = ['L', 'M', 'R'];
  const FINGERS = ['Index', 'Index', 'Middle', 'Ring', 'Pinky']; // by row; row 0 = mini buttons
  const ROW_NAMES = ['Mini', 'Index', 'Middle', 'Ring', 'Pinky'];
  const COL_NAMES = { L: 'left', M: 'middle', R: 'right' };

  const ALL_KEYS = ['T1', 'T2', 'T3', 'T4'];
  for (let r = 0; r <= 4; r++) for (const c of COLS) ALL_KEYS.push('F' + r + c);

  function keyOrder(k) {
    if (k[0] === 'T') return Number(k[1]) - 10;
    return Number(k[1]) * 3 + COLS.indexOf(k[2]);
  }

  function chordId(keys) {
    return [...new Set(keys)].sort((a, b) => keyOrder(a) - keyOrder(b)).join('+');
  }

  /* ---------- chord notation ---------- */

  // Classic: optional thumb letters, then four row letters (L/M/R/O) or "(LM)" groups.
  // Twiddler 4: "T14 F1R F3M", "T4F0M", "F1R3M".
  function parseChord(str) {
    let s = String(str).trim().toUpperCase().replace(/\s+/g, ' ');
    if (!s) throw new Error('empty chord');
    const keys = [];
    if (/^(T\d+\s*)?(F\d)/.test(s) || /^T\d+$/.test(s)) {
      const re = /T(\d+)|F((?:\d[LMR]+)+)|\s+/gy;
      let m;
      let consumed = 0;
      while ((m = re.exec(s)) && m[0].length) {
        consumed = re.lastIndex;
        if (m[1] !== undefined) {
          for (const d of m[1]) {
            if (d < '1' || d > '4') throw new Error('thumb button T' + d + ' is not one of T1-T4');
            keys.push('T' + d);
          }
        } else if (m[2] !== undefined) {
          const groups = m[2].match(/\d[LMR]+/g);
          for (const g of groups) {
            const row = Number(g[0]);
            if (row > 4) throw new Error('row ' + row + ' does not exist (rows are 0-4)');
            for (const c of g.slice(1)) keys.push('F' + row + c);
          }
        }
      }
      if (consumed !== s.length) throw new Error('could not read chord "' + str + '"');
    } else {
      s = s.replace(/[+\s]/g, ' ').trim();
      let rows = s;
      const parts = s.split(' ');
      if (parts.length === 2) {
        const mods = parts[0];
        rows = parts[1];
        if (mods !== 'O' && mods !== '0') {
          for (const ch of mods) {
            if (!THUMB_LETTERS[ch]) throw new Error('unknown thumb key "' + ch + '"');
            keys.push(THUMB_LETTERS[ch]);
          }
        }
      } else if (parts.length > 2) {
        throw new Error('could not read chord "' + str + '"');
      }
      const m = rows.match(/^([NACS]*)((?:[LMRO0]|\([LMR]+\)){4})$/);
      if (!m) throw new Error('could not read chord "' + str + '"');
      for (const ch of m[1]) keys.push(THUMB_LETTERS[ch]);
      const cells = m[2].match(/[LMRO0]|\([LMR]+\)/g);
      cells.forEach((cell, i) => {
        for (const c of cell.replace(/[()]/g, '')) if (COLS.includes(c)) keys.push('F' + (i + 1) + c);
      });
    }
    if (!keys.length) throw new Error('chord "' + str + '" presses no keys');
    return chordId(keys).split('+');
  }

  function formatT4(keys) {
    const thumbs = keys.filter((k) => k[0] === 'T').map((k) => k[1]).sort();
    const fingers = keys.filter((k) => k[0] === 'F').sort((a, b) => keyOrder(a) - keyOrder(b));
    const out = [];
    if (thumbs.length) out.push('T' + thumbs.join(''));
    for (const f of fingers) out.push(f);
    return out.join(' ');
  }

  function formatClassic(keys) {
    if (keys.some((k) => k[0] === 'F' && k[1] === '0')) return null;
    const thumbs = keys.filter((k) => k[0] === 'T').sort().map((k) => THUMB_NAMES[k]).join('');
    let rows = '';
    for (let r = 1; r <= 4; r++) {
      const cs = COLS.filter((c) => keys.includes('F' + r + c));
      rows += cs.length === 0 ? 'O' : cs.length === 1 ? cs[0] : '(' + cs.join('') + ')';
    }
    return (thumbs ? thumbs + ' ' : '') + rows;
  }

  function describeKey(k) {
    if (k[0] === 'T') return 'Thumb ' + THUMB_LONG[k] + ' (' + k + ')';
    const r = Number(k[1]);
    if (r === 0) return 'Mini ' + COL_NAMES[k[2]] + ' (' + k + ')';
    return ROW_NAMES[r] + ' ' + COL_NAMES[k[2]];
  }

  /* ---------- output sequences ---------- */

  const KEY_ALIASES = {
    space: 'Space', spc: 'Space', ' ': 'Space',
    enter: 'Enter', return: 'Enter', ret: 'Enter', entr: 'Enter',
    tab: 'Tab', backspace: 'Backspace', bksp: 'Backspace', bckspc: 'Backspace', bs: 'Backspace',
    esc: 'Esc', escape: 'Esc', delete: 'Delete', del: 'Delete', insert: 'Insert', ins: 'Insert',
    home: 'Home', end: 'End', pageup: 'PageUp', pgup: 'PageUp', pagedown: 'PageDown', pgdn: 'PageDown',
    up: 'Up', uparrow: 'Up', down: 'Down', downarrow: 'Down', left: 'Left', leftarrow: 'Left',
    right: 'Right', rightarrow: 'Right', capslock: 'CapsLock', numlock: 'NumLock',
    scrolllock: 'ScrollLock', printscreen: 'PrintScreen', pause: 'Pause', menu: 'Menu',
  };
  for (let i = 1; i <= 24; i++) KEY_ALIASES['f' + i] = 'F' + i;
  const MOD_ALIASES = {
    cmd: 'Cmd', gui: 'Cmd', win: 'Cmd', super: 'Cmd', meta: 'Cmd', '4': 'Cmd',
    ctrl: 'Ctrl', control: 'Ctrl', c: 'Ctrl',
    alt: 'Alt', opt: 'Alt', option: 'Alt', a: 'Alt',
    shift: 'Shift', s: 'Shift',
  };
  const MOD_ORDER = ['Ctrl', 'Alt', 'Cmd', 'Shift'];
  const TEXT_KEYS = { Space: ' ', Enter: '\n', Tab: '\t' };

  function normKeyName(name) {
    const n = KEY_ALIASES[name.toLowerCase()];
    if (n) return n;
    if (name.length === 1) return name;
    return null;
  }

  // "<Cmd+s>", "<Ctrl+Shift+z>", "<Backspace>", "<C-s>" (twidlk style)
  function parseKeySpec(spec) {
    let parts = spec.split('+');
    if (parts.length === 1 && /^[A-Za-z4]+-.+$/.test(spec)) {
      const i = spec.indexOf('-');
      parts = spec.slice(0, i).split('').concat([spec.slice(i + 1)]);
      parts = parts.map((p, j) => (j < parts.length - 1 ? p.replace(/^R/, '') : p)).filter(Boolean);
    }
    let base = parts.pop();
    if (base === '' && spec.endsWith('++')) {
      base = '+';
      parts = spec.slice(0, -2).split('+');
    }
    const mods = [];
    for (const p of parts) {
      const m = MOD_ALIASES[p.toLowerCase()];
      if (!m) return null;
      if (!mods.includes(m)) mods.push(m);
    }
    const key = normKeyName(base);
    if (!key) return null;
    mods.sort((a, b) => MOD_ORDER.indexOf(a) - MOD_ORDER.indexOf(b));
    return { type: 'key', key, mods };
  }

  function parseOutput(str) {
    const tokens = [];
    let text = '';
    const flush = () => {
      if (text) tokens.push({ type: 'text', value: text });
      text = '';
    };
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '\\' && i + 1 < str.length) {
        text += str[++i];
      } else if (ch === '<') {
        const close = str.indexOf('>', i + 2);
        const spec = close > 0 ? parseKeySpec(str.slice(i + 1, close)) : null;
        if (spec) {
          flush();
          tokens.push(spec);
          i = close;
        } else {
          text += ch;
        }
      } else {
        text += ch;
      }
    }
    flush();
    return tokens;
  }

  function formatOutput(tokens) {
    return tokens
      .map((t) => {
        if (t.type === 'text') {
          return t.value
            .replace(/[\\<]/g, (c) => '\\' + c)
            .replace(/\n/g, '<Enter>')
            .replace(/\t/g, '<Tab>')
            .replace(/^ | $/g, '<Space>')
            .replace(/ {2,}/g, (m) => '<Space>'.repeat(m.length));
        }
        return '<' + t.mods.concat([t.key]).join('+') + '>';
      })
      .join('');
  }

  // Text the chord types, or null if it sends shortcuts / navigation keys.
  function tokensToText(tokens) {
    let out = '';
    for (const t of tokens) {
      if (t.type === 'text') out += t.value;
      else if (!t.mods.length && TEXT_KEYS[t.key] !== undefined) out += TEXT_KEYS[t.key];
      else if (t.mods.length === 1 && t.mods[0] === 'Shift' && /^[a-z]$/i.test(t.key)) out += t.key.toUpperCase();
      else if (!t.mods.length && t.key.length === 1) out += t.key;
      else return null;
    }
    return out || null;
  }

  const KEY_SYMBOLS = {
    Space: '␣', Enter: '⏎', Tab: '⇥', Backspace: '⌫', Esc: 'Esc', Delete: 'Del', Insert: 'Ins',
    Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn', Up: '↑', Down: '↓', Left: '←', Right: '→',
    CapsLock: 'Caps', NumLock: 'NumLk', ScrollLock: 'ScrLk', PrintScreen: 'PrtSc', Pause: 'Pause', Menu: 'Menu',
  };
  const MOD_SYMBOLS = { Ctrl: '⌃', Alt: '⌥', Cmd: '⌘', Shift: '⇧' };
  const KEY_WORDS = {
    Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Esc: 'Escape', Delete: 'Delete',
    Up: 'Up arrow', Down: 'Down arrow', Left: 'Left arrow', Right: 'Right arrow', PageUp: 'Page up',
    PageDown: 'Page down', CapsLock: 'Caps lock', NumLock: 'Num lock', PrintScreen: 'Print screen',
  };

  function tokenLabel(t) {
    if (t.type === 'text') return t.value.replace(/ /g, '␣').replace(/\n/g, '⏎').replace(/\t/g, '⇥');
    const base = KEY_SYMBOLS[t.key] || (t.key.length === 1 ? t.key.toUpperCase() : t.key);
    return t.mods.map((m) => MOD_SYMBOLS[m]).join('') + base;
  }

  function tokensLabel(tokens) {
    return tokens.map(tokenLabel).join('');
  }

  function tokensDescription(tokens) {
    return tokens
      .map((t) => {
        if (t.type === 'text') return t.value === ' ' ? 'Space' : '“' + t.value + '”';
        return t.mods.concat([KEY_WORDS[t.key] || t.key]).join('+');
      })
      .join(' ');
  }

  /* ---------- layout ---------- */

  function chordCost(keys) {
    let cost = 0;
    for (const k of keys) cost += k[0] === 'T' ? 1.6 : k[1] === '0' ? 1.3 : 1;
    return cost;
  }

  function makeChord(keys, tokens, line) {
    const text = tokensToText(tokens);
    return {
      keys,
      id: chordId(keys),
      tokens,
      text,
      label: tokensLabel(tokens),
      description: tokensDescription(tokens),
      cost: chordCost(keys),
      line,
    };
  }

  function buildLayout(name, chords, warnings, meta) {
    const byId = new Map();
    const byText = new Map();
    for (const c of chords) {
      if (byId.has(c.id)) warnings.push('Chord ' + formatT4(c.keys) + ' is defined twice; the later one wins.');
      byId.set(c.id, c);
    }
    const unique = [...byId.values()];
    for (const c of unique) {
      if (c.text == null) continue;
      if (!byText.has(c.text)) byText.set(c.text, []);
      byText.get(c.text).push(c);
    }
    for (const list of byText.values()) list.sort((a, b) => a.cost - b.cost || a.keys.length - b.keys.length);
    return Object.assign({ name, chords: unique, byId, byText, warnings }, meta || {});
  }

  function parseLayoutText(src, name) {
    const chords = [];
    const warnings = [];
    let title = name || 'Untitled layout';
    String(src)
      .split(/\r?\n/)
      .forEach((raw, idx) => {
        const line = raw.replace(/^﻿/, '');
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          const m = trimmed.match(/^#\s*name\s*:\s*(.+)$/i);
          if (m) title = m[1].trim();
          return;
        }
        const eq = line.indexOf('=');
        if (eq < 0) {
          warnings.push('Line ' + (idx + 1) + ': expected "CHORD = OUTPUT".');
          return;
        }
        let keys;
        try {
          keys = parseChord(line.slice(0, eq));
        } catch (e) {
          warnings.push('Line ' + (idx + 1) + ': ' + e.message + '.');
          return;
        }
        let out = line.slice(eq + 1);
        out = out.replace(/^ /, '').replace(/\s+$/, '');
        if (!out) {
          warnings.push('Line ' + (idx + 1) + ': chord has no output.');
          return;
        }
        chords.push(makeChord(keys, parseOutput(out), idx + 1));
      });
    return buildLayout(title, chords, warnings);
  }

  function layoutToText(layout, header) {
    const lines = [];
    if (header) lines.push(header.trim(), '');
    lines.push('# name: ' + layout.name);
    const sorted = layout.chords; // keep the layout's own order
    for (const c of sorted) lines.push((formatClassic(c.keys) || formatT4(c.keys)) + ' = ' + formatOutput(c.tokens));
    return lines.join('\n') + '\n';
  }

  function mirrorLayout(layout) {
    const swap = { L: 'R', R: 'L', M: 'M' };
    const chords = layout.chords.map((c) =>
      makeChord(chordId(c.keys.map((k) => (k[0] === 'F' ? k.slice(0, 2) + swap[k[2]] : k))).split('+'), c.tokens, c.line)
    );
    return buildLayout(layout.name + ' (mirrored)', chords, []);
  }

  /* ---------- importers ---------- */

  // Twiddler Tuner CSV export (also used by Twidor): "   O ROOO","<Left GUI>s</Left GUI>"
  function parseTunerCsv(src, name) {
    const chords = [];
    const warnings = [];
    const rows = parseCsv(src);
    rows.forEach((row, idx) => {
      if (row.length < 2 || /^chord$/i.test(row[0].trim())) return;
      let keys;
      try {
        keys = parseChord(row[0].replace(/^\s*O\s+/, ''));
      } catch (e) {
        warnings.push('Row ' + (idx + 1) + ': ' + e.message + '.');
        return;
      }
      const tokens = parseTunerKeystrokes(row[1]);
      if (!tokens.length) {
        warnings.push('Row ' + (idx + 1) + ': empty output.');
        return;
      }
      chords.push(makeChord(keys, tokens, idx + 1));
    });
    return buildLayout(name || 'Imported layout', chords, warnings);
  }

  function parseCsv(src) {
    const rows = [];
    let row = [];
    let field = '';
    let q = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (q) {
        if (ch === '"' && src[i + 1] === '"') {
          field += '"';
          i++;
        } else if (ch === '"') q = false;
        else field += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && src[i + 1] === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else field += ch;
    }
    if (field || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  const TUNER_MODS = {
    'left gui': 'Cmd', 'right gui': 'Cmd', 'left ctrl': 'Ctrl', 'right ctrl': 'Ctrl',
    'left alt': 'Alt', 'right alt': 'Alt', 'left shift': 'Shift', 'right shift': 'Shift', shift: 'Shift',
    gui: 'Cmd', ctrl: 'Ctrl', alt: 'Alt',
  };

  function parseTunerKeystrokes(str) {
    const tokens = [];
    const held = [];
    let text = '';
    const flush = () => {
      if (text) tokens.push({ type: 'text', value: text });
      text = '';
    };
    const re = /<(\/?)([A-Za-z][A-Za-z0-9 ]*)>/y;
    for (let i = 0; i < str.length; ) {
      re.lastIndex = i;
      const m = re.exec(str);
      if (m) {
        const name = m[2].toLowerCase();
        const mod = TUNER_MODS[name];
        if (mod) {
          if (m[1]) held.splice(held.lastIndexOf(mod), 1);
          else held.push(mod);
          i = re.lastIndex;
          continue;
        }
        const key = normKeyName(m[2].replace(/\s+/g, ''));
        if (key && !m[1]) {
          flush();
          const mods = [...new Set(held)].sort((a, b) => MOD_ORDER.indexOf(a) - MOD_ORDER.indexOf(b));
          tokens.push({ type: 'key', key, mods });
          i = re.lastIndex;
          continue;
        }
      }
      const ch = str[i++];
      if (held.length) {
        flush();
        const mods = [...new Set(held)].sort((a, b) => MOD_ORDER.indexOf(a) - MOD_ORDER.indexOf(b));
        tokens.push({ type: 'key', key: ch.toLowerCase(), mods: /[A-Z]/.test(ch) && !mods.includes('Shift') ? mods.concat('Shift') : mods });
      } else text += ch;
    }
    flush();
    return tokens;
  }

  // JSON used by the official typing tutor: {"chords":[{"chord":"N LOOO","key":"7"}, ...]}
  function parseTutorJson(src, name) {
    const data = typeof src === 'string' ? JSON.parse(src) : src;
    const list = Array.isArray(data) ? data : data.chords;
    if (!Array.isArray(list)) throw new Error('JSON has no "chords" list');
    const chords = [];
    const warnings = [];
    list.forEach((entry, idx) => {
      const chordStr = entry.chord || entry.Chord;
      const out = entry.key != null ? entry.key : entry.output != null ? entry.output : entry.text;
      if (!chordStr || out == null) {
        warnings.push('Entry ' + (idx + 1) + ': needs "chord" and "key".');
        return;
      }
      let keys;
      try {
        keys = parseChord(chordStr);
      } catch (e) {
        warnings.push('Entry ' + (idx + 1) + ': ' + e.message + '.');
        return;
      }
      let tokens;
      const s = String(out);
      const named = s.length > 1 ? normKeyName(s) : null;
      if (named) tokens = [{ type: 'key', key: named, mods: [] }];
      else if (s.includes('<')) tokens = parseOutput(s);
      else tokens = [{ type: 'text', value: s }];
      const mods = [].concat(entry.modifiers || entry.modifier || []).map((m) => MOD_ALIASES[String(m).toLowerCase()]).filter(Boolean);
      if (mods.length) {
        tokens = tokens.map((t) => (t.type === 'key' ? Object.assign({}, t, { mods }) : { type: 'key', key: t.value, mods }));
      }
      chords.push(makeChord(keys, tokens, idx + 1));
    });
    return buildLayout(name || data.name || 'Imported layout', chords, warnings);
  }

  // Twiddler 3 binary config, format v5 (what Twiddler Tuner 3 writes).
  const HID_NAMED = {
    0x28: 'Enter', 0x29: 'Esc', 0x2a: 'Backspace', 0x2b: 'Tab', 0x2c: 'Space', 0x39: 'CapsLock',
    0x46: 'PrintScreen', 0x47: 'ScrollLock', 0x48: 'Pause', 0x49: 'Insert', 0x4a: 'Home', 0x4b: 'PageUp',
    0x4c: 'Delete', 0x4d: 'End', 0x4e: 'PageDown', 0x4f: 'Right', 0x50: 'Left', 0x51: 'Down', 0x52: 'Up',
    0x53: 'NumLock', 0x65: 'Menu',
  };
  for (let n = 0x3a; n <= 0x45; n++) HID_NAMED[n] = 'F' + (n - 0x39);
  const HID_PUNCT = { 0x2d: '-_', 0x2e: '=+', 0x2f: '[{', 0x30: ']}', 0x31: '\\|', 0x33: ';:', 0x34: '\'"', 0x35: '`~', 0x36: ',<', 0x37: '.>', 0x38: '/?' };

  function hidToken(mod, code) {
    const shift = !!(mod & 0x22);
    const mods = [];
    if (mod & 0x11) mods.push('Ctrl');
    if (mod & 0x44) mods.push('Alt');
    if (mod & 0x88) mods.push('Cmd');
    let base;
    let shifted = null;
    if (code >= 0x04 && code <= 0x1d) {
      base = String.fromCharCode(code - 4 + 97);
      shifted = base.toUpperCase();
    } else if (code >= 0x1e && code <= 0x27) {
      base = '1234567890'[code - 0x1e];
      shifted = '!@#$%^&*()'[code - 0x1e];
    } else if (HID_PUNCT[code]) {
      base = HID_PUNCT[code][0];
      shifted = HID_PUNCT[code][1];
    } else if (HID_NAMED[code]) {
      base = HID_NAMED[code];
    } else {
      base = 'Key' + code.toString(16);
    }
    if (!mods.length && shifted !== null) return { type: 'text', value: shift ? shifted : base };
    if (shift) mods.push('Shift');
    return { type: 'key', key: base, mods };
  }

  function parseConfigV5(buffer, name) {
    const dv = new DataView(buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    const version = dv.getUint8(0);
    if (version !== 5) {
      throw new Error(
        'This .cfg file is format version ' + version + '. Only Twiddler 3 (v5) binary configs can be read here. ' +
          'For a Twiddler 4 config, paste the chord list as text instead.'
      );
    }
    const n = dv.getUint16(2, true);
    const raw = [];
    let off = 16;
    for (let i = 0; i < n; i++, off += 4) raw.push([dv.getUint16(off, true), dv.getUint8(off + 2), dv.getUint8(off + 3)]);
    let maxIdx = -1;
    for (const [, lo, hi] of raw) if (lo === 0xff) maxIdx = Math.max(maxIdx, hi);
    const locs = [];
    for (let i = 0; i <= maxIdx; i++, off += 4) locs.push(dv.getUint32(off, true));
    const chords = [];
    for (const [bits, lo, hi] of raw) {
      const keys = [];
      ['T1', 'T2', 'T3', 'T4'].forEach((t, i) => {
        if (bits & (1 << (i * 4))) keys.push(t);
      });
      for (let r = 0; r < 4; r++) {
        ['R', 'M', 'L'].forEach((c, j) => {
          if (bits & (1 << (4 * r + j + 1))) keys.push('F' + (r + 1) + c);
        });
      }
      let tokens = [];
      if (lo === 0xff) {
        const p = locs[hi];
        const len = dv.getUint16(p, true);
        for (let j = 0; j < len / 2 - 1; j++) tokens.push(hidToken(dv.getUint8(p + 2 + 2 * j), dv.getUint8(p + 3 + 2 * j)));
      } else tokens.push(hidToken(lo, hi));
      tokens = mergeText(tokens);
      if (keys.length) chords.push(makeChord(chordId(keys).split('+'), tokens));
    }
    return buildLayout(name || 'Imported layout', chords, []);
  }

  function mergeText(tokens) {
    const out = [];
    for (const t of tokens) {
      const last = out[out.length - 1];
      if (t.type === 'text' && last && last.type === 'text') last.value += t.value;
      else out.push(Object.assign({}, t));
    }
    return out;
  }

  // Detects the format from the file name / content.
  function importLayout(content, fileName) {
    const base = (fileName || 'Imported layout').replace(/\.[^.]+$/, '');
    if (content instanceof ArrayBuffer || ArrayBuffer.isView(content)) {
      const bytes = new Uint8Array(content instanceof ArrayBuffer ? content : content.buffer);
      if (bytes[0] <= 9 && !/\.(txt|layout|csv|json)$/i.test(fileName || '')) return parseConfigV5(content, base);
      content = new TextDecoder().decode(bytes);
    }
    const s = String(content).replace(/^﻿/, '');
    const t = s.trim();
    if (t.startsWith('{') || t.startsWith('[')) return parseTutorJson(t, base);
    if (/^"?\s*chord"?\s*,/i.test(t) || /^"[^"\n]*"\s*,\s*"/.test(t)) return parseTunerCsv(s, base);
    return parseLayoutText(s, base);
  }

  /* ---------- lookup ---------- */

  // Best chord for a piece of text. Uppercase letters fall back to Shift (T4) + the lowercase chord,
  // which is how the Twiddler capitalises letters.
  function chordForText(layout, text) {
    const list = layout.byText.get(text);
    if (list && list.length) return { chord: list[0], keys: list[0].keys, implicitShift: false };
    if (text.length >= 1 && text !== text.toLowerCase()) {
      const lower = layout.byText.get(text.toLowerCase());
      if (lower && lower.length && !lower[0].keys.includes('T4')) {
        return { chord: lower[0], keys: chordId(lower[0].keys.concat('T4')).split('+'), implicitShift: true };
      }
    }
    return null;
  }

  // Longest multi-character chord whose text starts at target[pos].
  function mccAt(layout, target, pos, maxLen) {
    maxLen = maxLen || 8;
    for (let len = Math.min(maxLen, target.length - pos); len >= 2; len--) {
      const piece = target.slice(pos, pos + len);
      const hit = layout.byText.get(piece);
      if (hit && hit.length) return { text: piece, chord: hit[0], keys: hit[0].keys };
      if (/^[A-Z][a-z]+$/.test(piece)) {
        const lower = layout.byText.get(piece.toLowerCase());
        if (lower && lower.length && !lower[0].keys.includes('T4')) {
          return { text: piece, chord: lower[0], keys: chordId(lower[0].keys.concat('T4')).split('+') };
        }
      }
    }
    return null;
  }

  function chordFor(layout, keys) {
    return layout.byId.get(chordId(keys)) || null;
  }

  Object.assign(T4, {
    THUMB_LETTERS, THUMB_NAMES, THUMB_LONG, COLS, FINGERS, ROW_NAMES, ALL_KEYS,
    chordId, parseChord, formatT4, formatClassic, describeKey,
    parseOutput, formatOutput, tokensToText, tokensLabel,
    parseLayoutText, layoutToText, mirrorLayout, buildLayout,
    parseTunerCsv, parseTutorJson, parseConfigV5, importLayout,
    chordForText, mccAt, chordFor,
  });
})(typeof window !== 'undefined' ? window : globalThis);
