/*
 * Draws a Twiddler 4: four thumb buttons on the top face, then the three mini buttons (row 0)
 * and the 4 x 3 finger keys on the front face. Each key shows what it types.
 */
(function (root) {
  'use strict';
  const T4 = (root.T4 = root.T4 || {});

  const FINGER_VAR = ['--f-index', '--f-index', '--f-middle', '--f-ring', '--f-pinky'];
  const ROW_TAGS = ['Mini', 'Index', 'Middle', 'Ring', 'Pinky'];

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function makeKey(id, extra) {
    const b = el('button', 'key ' + (extra || ''));
    b.type = 'button';
    b.dataset.key = id;
    const finger = id[0] === 'T' ? '--f-thumb' : FINGER_VAR[Number(id[1])];
    b.style.setProperty('--fc', 'var(' + finger + ')');
    b.append(el('span', 'k-lbl'), el('span', 'k-id', id[0] === 'T' ? T4.THUMB_NAMES[id] + ' · ' + id : id.slice(1)));
    return b;
  }

  function createDiagram(container, opts) {
    opts = opts || {};
    const rootEl = el('div', 't4');
    const keys = {};

    const top = el('div', 't4-top');
    const pad = el('div', 'touchpad');
    pad.setAttribute('aria-hidden', 'true');
    const thumbs = el('div', 'thumbs');
    for (const t of ['T1', 'T2', 'T3', 'T4']) thumbs.append((keys[t] = makeKey(t, 'thumb')));
    top.append(pad, thumbs, el('div', 'face-cap', 'Thumb buttons · top'));

    const face = el('div', 't4-face');
    const colHead = el('div', 'frow col-head');
    colHead.append(el('span', 'finger-tag', ''));
    const colLetters = [el('span', 'col-letter'), el('span', 'col-letter'), el('span', 'col-letter')];
    colHead.append(...colLetters);
    face.append(colHead);
    const rows = [];
    for (let r = 0; r <= 4; r++) {
      const row = el('div', 'frow' + (r === 0 ? ' mini-row' : ''));
      row.dataset.row = r;
      const tag = el('span', 'finger-tag', ROW_TAGS[r]);
      tag.style.setProperty('--fc', 'var(' + FINGER_VAR[r] + ')');
      row.append(tag);
      for (const c of T4.COLS) row.append((keys['F' + r + c] = makeKey('F' + r + c, r === 0 ? 'mini' : '')));
      rows.push(row);
      face.append(row);
    }
    face.append(el('div', 'face-cap', 'Finger keys · front'));
    rootEl.append(top, face);
    container.replaceChildren(rootEl);

    if (opts.onKey) {
      rootEl.addEventListener('click', (e) => {
        const k = e.target.closest('.key');
        if (k) opts.onKey(k.dataset.key);
      });
    }

    function render(state) {
      const colOrder = state.colOrder || 'RML';
      const thumbOrder = state.thumbOrder || '1234';
      rootEl.classList.toggle('interactive', !!state.interactive);
      colOrder.split('').forEach((c, i) => {
        colLetters[i].textContent = c;
      });
      for (const row of rows) {
        const r = row.dataset.row;
        const ks = colOrder.split('').map((c) => keys['F' + r + c]);
        row.append(...ks);
      }
      thumbs.append(...thumbOrder.split('').map((d) => keys['T' + d]));
      rows[0].hidden = !state.showMini;

      const hi = new Set(state.highlight || []);
      const alt = new Set(state.secondary || []);
      const sel = new Set(state.selected || []);
      for (const id of T4.ALL_KEYS) {
        const k = keys[id];
        const info = state.labelFor ? state.labelFor(id) : null;
        const text = info ? info.text : '';
        const lbl = k.firstChild;
        lbl.textContent = text;
        lbl.className = 'k-lbl' + (text.length > 4 ? ' tiny' : text.length > 2 ? ' small' : '');
        k.title = (info && info.title) || T4.describeKey(id);
        k.classList.toggle('on', hi.has(id));
        k.classList.toggle('alt', alt.has(id) && !hi.has(id));
        k.classList.toggle('sel', sel.has(id));
        k.classList.toggle('empty', !text && !sel.has(id) && !hi.has(id));
        k.tabIndex = state.interactive ? 0 : -1;
        k.setAttribute('aria-pressed', sel.has(id) ? 'true' : 'false');
      }
    }

    function flash(keyIds, cls) {
      for (const id of keyIds) {
        const k = keys[id];
        if (!k) continue;
        k.classList.remove(cls);
        void k.offsetWidth;
        k.classList.add(cls);
      }
    }

    return { render, flash, root: rootEl };
  }

  T4.createDiagram = createDiagram;
})(typeof window !== 'undefined' ? window : globalThis);
