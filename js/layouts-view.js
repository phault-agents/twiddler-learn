/* Layouts view: pick, edit, duplicate, mirror, import and delete layouts. */
(function () {
  'use strict';
  const T4 = window.T4;

  window.T4Layouts = function (app) {
    const { $, h } = app;
    let editId = null;
    let validateTimer = null;

    const newId = () => 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    function addUserLayout(name, source) {
      const id = newId();
      app.setUserLayouts(app.userLayouts().concat({ id, name, source }));
      return id;
    }

    function summary(layout) {
      const letters = 'abcdefghijklmnopqrstuvwxyz'.split('').filter((c) => layout.byText.has(c)).length;
      return layout.chords.length + ' chords, ' + letters + ' of 26 letters';
    }

    function showWarnings(box, layout, okText) {
      box.replaceChildren();
      if (okText) box.append(h('span', 'ok', okText));
      if (layout && layout.warnings.length) {
        box.append(h('div', null, layout.warnings.length + ' line' + (layout.warnings.length === 1 ? '' : 's') + ' could not be read:'));
        const ul = h('ul');
        for (const w of layout.warnings.slice(0, 40)) ul.append(h('li', null, w));
        box.append(ul);
      }
    }

    function render() {
      const entries = app.allLayoutEntries();
      if (!entries.some((e) => e.id === editId)) editId = app.entry.id;
      const list = $('layout-items');
      list.replaceChildren();
      for (const e of entries) {
        const li = h('li');
        const b = h('button');
        b.type = 'button';
        if (e.id === editId) b.setAttribute('aria-current', 'true');
        b.append(h('span', null, e.name), h('small', null, (e.builtin ? 'Built in' : 'Yours') + (e.id === app.entry.id ? ' · in use' : '')));
        b.addEventListener('click', () => {
          editId = e.id;
          render();
        });
        li.append(b);
        list.append(li);
      }
      const e = app.layoutEntry(editId);
      $('editor-title').textContent = e.name;
      $('layout-name').value = e.name;
      $('layout-name').readOnly = e.builtin;
      $('layout-text').value = e.source;
      $('layout-text').readOnly = e.builtin;
      $('btn-save-layout').hidden = e.builtin;
      $('btn-delete').hidden = e.builtin;
      $('delete-confirm').hidden = true;
      const parsed = T4.parseLayoutText(e.source, e.name);
      $('editor-note').textContent = e.builtin
        ? 'Built-in layouts can’t be changed. Duplicate it to make your own version. ' + summary(parsed) + '.'
        : summary(parsed) + '. Changes apply when you save.';
      if (e.id !== app.entry.id) {
        $('editor-note').append(' ');
        const use = h('button', 'btn small', 'Use this layout');
        use.type = 'button';
        use.addEventListener('click', () => {
          app.activateLayout(e.id);
          app.toast('Now practising ' + e.name);
        });
        $('editor-note').append(use);
      }
      showWarnings($('layout-warnings'), parsed);
    }

    $('layout-text').addEventListener('input', () => {
      clearTimeout(validateTimer);
      validateTimer = setTimeout(() => {
        const parsed = T4.parseLayoutText($('layout-text').value, $('layout-name').value);
        showWarnings($('layout-warnings'), parsed, summary(parsed) + ' (unsaved)');
      }, 250);
    });

    $('btn-save-layout').addEventListener('click', () => {
      const name = $('layout-name').value.trim() || 'Untitled layout';
      const source = $('layout-text').value;
      const parsed = T4.parseLayoutText(source, name);
      if (!parsed.chords.length) {
        showWarnings($('layout-warnings'), parsed);
        $('layout-warnings').prepend(h('div', null, 'Nothing saved: the layout has no readable chords.'));
        return;
      }
      app.setUserLayouts(app.userLayouts().map((u) => (u.id === editId ? { id: u.id, name, source } : u)));
      if (editId === app.entry.id) app.activateLayout(editId);
      else app.renderLayoutSelect();
      render();
      app.toast('Saved ' + name);
    });

    $('btn-duplicate').addEventListener('click', () => {
      const e = app.layoutEntry(editId);
      editId = addUserLayout(e.name + ' copy', e.source);
      app.renderLayoutSelect();
      render();
      app.toast('Made a copy you can edit');
    });

    $('btn-mirror').addEventListener('click', () => {
      const e = app.layoutEntry(editId);
      const mirrored = T4.mirrorLayout(T4.parseLayoutText(e.source, e.name));
      const name = e.name.replace(/\s*\((left|right) hand\)/i, '') + ' (mirrored)';
      mirrored.name = name;
      editId = addUserLayout(name, T4.layoutToText(mirrored, '# Mirror image of "' + e.name + '": left and right columns swapped.'));
      app.renderLayoutSelect();
      render();
      app.toast('Made a mirrored copy');
    });

    $('btn-copy-layout').addEventListener('click', () => {
      const ta = $('layout-text');
      const fallback = () => {
        ta.focus();
        ta.select();
        app.toast('Text selected. Copy it with your keyboard.');
      };
      try {
        navigator.clipboard.writeText(ta.value).then(() => app.toast('Layout text copied'), fallback);
      } catch (err) {
        fallback();
      }
    });

    $('btn-delete').addEventListener('click', () => {
      $('delete-confirm').hidden = false;
    });
    $('btn-delete-no').addEventListener('click', () => {
      $('delete-confirm').hidden = true;
    });
    $('btn-delete-yes').addEventListener('click', () => {
      const id = editId;
      app.setUserLayouts(app.userLayouts().filter((u) => u.id !== id));
      app.store.remove('t4.progress.' + id);
      editId = null;
      if (id === app.entry.id) app.activateLayout(T4.BUILTIN_LAYOUTS[0].id);
      else app.renderLayoutSelect();
      render();
      app.toast('Layout deleted');
    });

    $('import-file').addEventListener('change', () => {
      const f = $('import-file').files[0];
      if (f && !$('import-name').value) $('import-name').value = f.name.replace(/\.[^.]+$/, '');
    });

    $('btn-import').addEventListener('click', async () => {
      const out = $('import-result');
      out.replaceChildren();
      const file = $('import-file').files[0];
      const pasted = $('import-text').value;
      let layout;
      let keepSource = null;
      try {
        if (file) {
          const binary = /\.cfg$/i.test(file.name);
          const content = binary ? await file.arrayBuffer() : await file.text();
          layout = T4.importLayout(content, file.name);
          if (!binary && layout.chords.length && !/^\s*[{["]/.test(content)) keepSource = content;
        } else if (pasted.trim()) {
          layout = T4.importLayout(pasted, 'Pasted layout');
          if (!/^\s*[{["]/.test(pasted)) keepSource = pasted;
        } else {
          out.append(h('div', null, 'Choose a file or paste a chord list first.'));
          return;
        }
      } catch (err) {
        out.append(h('div', null, 'Could not read that: ' + err.message));
        return;
      }
      if (!layout.chords.length) {
        showWarnings(out, layout);
        out.prepend(h('div', null, 'No chords found, so nothing was added.'));
        return;
      }
      const name = $('import-name').value.trim() || layout.name || 'Imported layout';
      let source;
      if ($('import-mirror').checked) {
        const m = T4.mirrorLayout(layout);
        m.name = name;
        source = T4.layoutToText(m, '# Imported' + (file ? ' from ' + file.name : '') + ', mirrored.');
      } else if (keepSource) {
        source = keepSource;
      } else {
        layout.name = name;
        source = T4.layoutToText(layout, '# Imported' + (file ? ' from ' + file.name : '') + '.');
      }
      const id = addUserLayout(name, source);
      editId = id;
      app.activateLayout(id);
      showWarnings(out, layout, 'Added “' + name + '”: ' + summary(layout) + '. It is now the active layout.');
      $('import-text').value = '';
      $('import-file').value = '';
      $('import-name').value = '';
      render();
    });

    return { render };
  };
})();
