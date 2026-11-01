/* Explore view: build chords by clicking keys, look chords up by typing, browse every chord. */
(function () {
  'use strict';
  const T4 = window.T4;

  window.T4Explore = function (app) {
    const { $, h } = app;
    let sel = [];
    let typedKeys = [];
    let picked = null;
    let buffer = '';
    let bufferTimer = null;
    let lastT = 0;
    const diagram = T4.createDiagram($('explore-device'), { onKey: toggleKey });

    function toggleKey(id) {
      typedKeys = [];
      sel = sel.includes(id) ? sel.filter((k) => k !== id) : sel.concat(id);
      picked = T4.chordId(sel);
      render();
    }

    function labelFor(id) {
      if (!sel.length) return app.singleLabel(id);
      if (sel.includes(id)) return { text: '•', title: T4.describeKey(id) + ' (held)' };
      const c = T4.chordFor(app.layout, sel.concat(id));
      return c
        ? { text: c.label, title: 'Add ' + T4.describeKey(id) + ': ' + c.description }
        : { text: '', title: 'Add ' + T4.describeKey(id) + ': nothing' };
    }

    function renderReadout() {
      const box = $('explore-readout');
      box.replaceChildren();
      if (!sel.length) {
        box.append(h('span', 'muted', 'No keys held. Click a key to start a chord.'));
        return;
      }
      const keys = T4.chordId(sel).split('+');
      const c = T4.chordFor(app.layout, keys);
      box.append(h('span', 'r-out', c ? c.label : '—'));
      box.append(h('span', 'r-chord', app.notation(keys) + (c ? '  ·  ' + c.description : '  ·  nothing assigned')));
      box.append(h('span', 'r-chord', app.fingerWords(keys)));
    }

    function renderTable(scrollToPick) {
      const q = $('chord-search').value.trim();
      const filter = $('chord-filter').value;
      const ql = q.toLowerCase();
      const rows = [];
      for (const c of app.layout.chords) {
        const t = c.text;
        const cat =
          t == null || /^\s+$/.test(t) ? 'keys' : t.length > 1 ? 'mcc' : /[a-z]/i.test(t) ? 'letters' : /\d/.test(t) ? 'digits' : 'punct';
        if (filter !== 'all' && filter !== cat) continue;
        if (q) {
          const hay = [c.label, c.description, T4.formatT4(c.keys), T4.formatClassic(c.keys) || ''].join(' ').toLowerCase();
          const exact = t === q;
          if (!exact && !(q.length > 1 && hay.includes(ql)) && !(q.length === 1 && (t || '').toLowerCase() === ql)) continue;
        }
        rows.push(c);
      }
      if (filter === 'letters' || filter === 'digits') rows.sort((a, b) => a.text.localeCompare(b.text) || a.cost - b.cost);
      const body = $('chord-table').tBodies[0];
      body.replaceChildren();
      let pickedRow = null;
      for (const c of rows) {
        const tr = h('tr');
        if (c.id === picked) {
          tr.className = 'picked';
          pickedRow = tr;
        }
        tr.append(h('td', null, c.label), h('td', null, T4.formatT4(c.keys)), h('td', null, T4.formatClassic(c.keys) || ''), h('td', null, app.fingerWords(c.keys)));
        tr.title = c.description;
        tr.addEventListener('click', () => {
          sel = c.keys.slice();
          typedKeys = [];
          picked = c.id;
          render();
        });
        body.append(tr);
      }
      if (!rows.length) {
        const tr = h('tr');
        const td = h('td', 'muted', 'No chords match.');
        td.colSpan = 4;
        tr.append(td);
        body.append(tr);
      }
      if (scrollToPick && pickedRow) pickedRow.scrollIntoView({ block: 'nearest' });
    }

    function render(full) {
      diagram.render(app.diagramState({ interactive: true, selected: sel, highlight: typedKeys, labelFor }));
      renderReadout();
      if (full !== false) renderTable();
    }

    function showTyped(text) {
      const box = $('explore-typed');
      box.replaceChildren();
      const hit = T4.chordForText(app.layout, text);
      box.append(h('span', 'r-out', text === ' ' ? '␣ (space)' : text === '\n' ? '⏎ (enter)' : text));
      if (hit) {
        box.append(h('span', 'r-chord', app.notation(hit.keys) + (hit.implicitShift ? '  (Shift + lowercase chord)' : '')));
        box.append(h('span', 'r-chord', app.fingerWords(hit.keys)));
        typedKeys = hit.keys;
        sel = [];
        picked = hit.chord.id;
      } else {
        box.append(h('span', 'r-chord', 'This layout has no chord that types exactly this.'));
        typedKeys = [];
      }
      render(false);
      renderTable(true);
    }

    // Characters arriving within a few milliseconds of each other came from one multi-character chord.
    function onTyped(ch, t) {
      const text = ch === '\n' ? '\n' : ch;
      if (buffer && t - lastT < 35) buffer += text;
      else buffer = text;
      lastT = t;
      clearTimeout(bufferTimer);
      bufferTimer = setTimeout(() => showTyped(buffer), 60);
    }

    function reset() {
      sel = [];
      typedKeys = [];
      picked = null;
      $('explore-typed').replaceChildren(h('span', 'muted', 'Nothing typed yet.'));
      if (!$('view-explore').hidden) render();
    }

    $('btn-explore-clear').addEventListener('click', () => {
      sel = [];
      typedKeys = [];
      picked = null;
      render();
    });
    $('chord-search').addEventListener('input', () => renderTable());
    $('chord-filter').addEventListener('change', () => renderTable());

    return { render, reset, onTyped };
  };
})();
