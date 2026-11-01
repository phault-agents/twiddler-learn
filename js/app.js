/* App shell: settings, layout registry, progress storage, and the Practice view. */
(function () {
  'use strict';
  const T4 = window.T4;
  const $ = (id) => document.getElementById(id);
  const h = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  /* ---------- storage (best effort; the app works without it) ---------- */
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        /* storage unavailable */
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        /* storage unavailable */
      }
    },
  };

  const DEFAULTS = { hints: 'always', length: '14', notation: 't4', colOrder: 'RML', thumbOrder: '1234', layoutId: 'backspice', view: 'practice', lessonByLayout: {} };
  const settings = Object.assign({}, DEFAULTS, store.get('t4.settings', {}));
  const saveSettings = () => store.set('t4.settings', settings);

  /* ---------- layouts ---------- */
  let userLayouts = store.get('t4.layouts', []);
  const saveUserLayouts = () => store.set('t4.layouts', userLayouts);

  function allLayoutEntries() {
    return T4.BUILTIN_LAYOUTS.map((b) => Object.assign({ builtin: true }, b)).concat(userLayouts.map((u) => Object.assign({ builtin: false }, u)));
  }
  function layoutEntry(id) {
    return allLayoutEntries().find((e) => e.id === id) || allLayoutEntries()[0];
  }

  const app = {
    store,
    settings,
    saveSettings,
    layout: null,
    entry: null,
    plan: [],
    progress: null,
    userLayouts: () => userLayouts,
    setUserLayouts(list) {
      userLayouts = list;
      saveUserLayouts();
    },
    allLayoutEntries,
    layoutEntry,
    h,
    $,
  };
  window.T4App = app;

  function loadLayout(id) {
    const entry = layoutEntry(id);
    app.entry = entry;
    app.layout = T4.parseLayoutText(entry.source, entry.name);
    app.layout.name = entry.name;
    app.plan = T4.buildPlan(app.layout);
    app.progress = store.get('t4.progress.' + entry.id, { chars: {}, lessons: {} });
    settings.layoutId = entry.id;
    saveSettings();
    renderLayoutSelect();
  }
  app.loadLayout = loadLayout;
  app.saveProgress = () => store.set('t4.progress.' + app.entry.id, app.progress);

  function renderLayoutSelect() {
    const sel = $('layout-select');
    sel.replaceChildren(
      ...allLayoutEntries().map((e) => {
        const o = h('option', null, e.name);
        o.value = e.id;
        return o;
      })
    );
    sel.value = app.entry.id;
  }
  app.renderLayoutSelect = renderLayoutSelect;

  /* ---------- notation helpers ---------- */
  function notation(keys) {
    const t4 = T4.formatT4(keys);
    const classic = T4.formatClassic(keys);
    if (settings.notation === 'classic') return classic || t4;
    if (settings.notation === 'both' && classic) return t4 + '  ·  ' + classic;
    return t4;
  }
  function fingerWords(keys) {
    return keys.map((k) => T4.describeKey(k)).join(' + ');
  }
  function keyDots(keys, container) {
    container.replaceChildren();
    keys.forEach((k, i) => {
      if (i) container.append(' + ');
      const dot = h('span', 'key-dot');
      const r = k[0] === 'T' ? 'thumb' : ['index', 'index', 'middle', 'ring', 'pinky'][Number(k[1])];
      dot.style.setProperty('--fc', 'var(--f-' + r + ')');
      container.append(dot, T4.describeKey(k));
    });
  }
  app.notation = notation;
  app.fingerWords = fingerWords;

  function singleLabel(id) {
    const c = T4.chordFor(app.layout, [id]);
    return c ? { text: c.label, title: T4.describeKey(id) + ': ' + c.description } : { text: '', title: T4.describeKey(id) + ': nothing on its own' };
  }
  app.singleLabel = singleLabel;

  function diagramState(extra) {
    return Object.assign(
      {
        colOrder: settings.colOrder,
        thumbOrder: settings.thumbOrder,
        showMini: true,
        labelFor: singleLabel,
      },
      extra
    );
  }
  app.diagramState = diagramState;

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), 2400);
  }
  app.toast = toast;

  /* ---------- practice ---------- */
  const P = {
    lesson: null,
    target: '',
    pos: 0,
    errAt: new Set(),
    burstAt: new Set(),
    curErr: false,
    mistakes: 0,
    correct: 0,
    bursts: 0,
    start: 0,
    lastKeyT: 0,
    lastProgressT: 0,
    done: false,
    customText: '',
  };
  let practiceDiagram;

  function lessonById(id) {
    if (id === 'weak') return weakLesson();
    if (id === 'custom') return { id: 'custom', group: 'Practice', title: 'Custom text', kind: 'custom', newChars: [], text: P.customText };
    return app.plan.find((l) => l.id === id) || app.plan[0];
  }

  function charStats() {
    const out = [];
    const chars = app.progress.chars;
    let totalMs = 0;
    let totalN = 0;
    for (const c in chars) {
      totalMs += chars[c].ms || 0;
      totalN += chars[c].n || 0;
    }
    const avg = totalN ? totalMs / totalN : 0;
    for (const c in chars) {
      const s = chars[c];
      const attempts = (s.hit || 0) + (s.miss || 0);
      if (attempts < 5 || c === ' ') continue;
      const acc = (s.hit || 0) / attempts;
      const ms = s.n ? s.ms / s.n : avg;
      const score = (1 - acc) * 3 + (avg ? Math.max(0, ms - avg) / avg : 0);
      out.push({ c, acc, ms, score });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  function weakLesson() {
    const stats = charStats().filter((s) => /^[a-z]$/.test(s.c)).slice(0, 8);
    const weights = {};
    for (const s of stats) weights[s.c] = s.score;
    return { id: 'weak', group: 'Practice', title: 'Weak spots', kind: 'weak', newChars: stats.slice(0, 5).map((s) => s.c), weights, empty: !stats.length };
  }

  function startLesson(id, keepText) {
    const lesson = lessonById(id);
    P.lesson = lesson;
    if (lesson.kind !== 'weak' && lesson.kind !== 'custom') {
      settings.lessonByLayout[app.entry.id] = lesson.id;
      saveSettings();
    }
    if (!keepText) {
      if (lesson.kind === 'custom' && !P.customText.trim()) {
        P.target = '';
      } else if (lesson.kind === 'weak' && lesson.empty) {
        P.target = '';
      } else {
        P.target = T4.lessonText(app.layout, lesson, { words: Number(settings.length), seed: (Math.random() * 2 ** 31) | 0 });
      }
    }
    resetRound();
    renderLessonHead();
    renderLessonList();
  }

  function resetRound() {
    Object.assign(P, { pos: 0, curErr: false, mistakes: 0, correct: 0, bursts: 0, start: 0, lastKeyT: 0, lastProgressT: performance.now(), done: false });
    P.errAt = new Set();
    P.burstAt = new Set();
    $('round-done').hidden = true;
    renderTarget();
    renderHint();
    renderStats();
  }

  function renderLessonHead() {
    const l = P.lesson;
    $('lesson-group').textContent = l.group;
    $('lesson-title').textContent = l.kind === 'letters' ? 'Letters  ' + l.title : l.title;
    const box = $('new-chars');
    box.replaceChildren();
    const show = l.kind === 'letters' || l.kind === 'mcc' || l.kind === 'punct' || l.kind === 'weak' ? l.newChars : [];
    for (const c of show.slice(0, 10)) {
      const hit = T4.chordForText(app.layout, c);
      const chip = h('span', 'new-chip');
      chip.append(h('b', null, c), h('span', null, hit ? notation(hit.keys) : 'no chord'));
      box.append(chip);
    }
  }

  function renderTarget() {
    const box = $('target');
    box.replaceChildren();
    if (!P.target) {
      const msg =
        P.lesson.kind === 'custom'
          ? 'Paste some text into the Custom text box in the lesson list, then press Start.'
          : P.lesson.kind === 'weak'
            ? 'No weak spots yet. Finish a few rounds and this lesson will drill the letters you miss or hesitate on most.'
            : 'This layout has nothing to practise here.';
      box.append(h('span', 'muted', msg));
      return;
    }
    const frag = document.createDocumentFragment();
    for (let i = 0; i < P.target.length; i++) {
      const ch = P.target[i];
      const s = h('span', 'c', ch);
      if (ch === ' ') s.classList.add('sp');
      if (i < P.pos) {
        s.classList.add('done');
        if (P.errAt.has(i)) s.classList.add('err');
        if (P.burstAt.has(i)) s.classList.add('burst');
      } else if (i === P.pos) {
        s.classList.add('cur');
        if (P.curErr) s.classList.add('err');
      }
      frag.append(s);
    }
    box.append(frag);
  }

  function updateTargetAround(i) {
    const spans = $('target').children;
    for (const j of [i - 3, i - 2, i - 1, i, i + 1]) {
      const s = spans[j];
      if (!s || !s.classList.contains('c')) continue;
      s.className = 'c' + (P.target[j] === ' ' ? ' sp' : '');
      if (j < P.pos) {
        s.classList.add('done');
        if (P.errAt.has(j)) s.classList.add('err');
        if (P.burstAt.has(j)) s.classList.add('burst');
      } else if (j === P.pos) {
        s.classList.add('cur');
        if (P.curErr) s.classList.add('err');
      }
    }
  }

  function currentHint() {
    if (!P.target || P.done || P.pos >= P.target.length) return null;
    const ch = P.target[P.pos];
    const single = T4.chordForText(app.layout, ch);
    const mcc = T4.mccAt(app.layout, P.target, P.pos);
    if (P.lesson.kind === 'mcc' && mcc) return { text: mcc.text, keys: mcc.keys, alt: single, mcc: null };
    return { text: ch, keys: single ? single.keys : null, implicitShift: single && single.implicitShift, mcc: P.lesson.kind === 'letters' ? null : mcc };
  }

  function hintVisible() {
    const mode = settings.hints;
    if (mode === 'always') return true;
    if (mode === 'never') return false;
    if (P.curErr) return true;
    if (mode === 'delay') return performance.now() - P.lastProgressT > 1500;
    return false;
  }

  function renderHint() {
    clearTimeout(renderHint.timer);
    const hint = currentHint();
    const box = $('hint');
    const visible = hint && hintVisible();
    box.classList.toggle('concealed', !!hint && !visible);
    if (!hint) {
      $('hint-glyph').textContent = '';
      $('hint-chord').textContent = P.done ? 'Round complete' : '';
      $('hint-fingers').textContent = '';
      $('hint-mcc').replaceChildren();
      practiceDiagram.render(diagramState({}));
      return;
    }
    $('hint-glyph').textContent = hint.text === ' ' ? '␣' : hint.text;
    if (hint.keys) {
      $('hint-chord').textContent = notation(hint.keys) + (hint.implicitShift ? '   (Shift + the lowercase chord)' : '');
      keyDots(hint.keys, $('hint-fingers'));
    } else {
      $('hint-chord').textContent = 'No chord in this layout';
      $('hint-fingers').textContent = 'Type it however your layout produces it.';
    }
    const mccBox = $('hint-mcc');
    mccBox.replaceChildren();
    if (hint.mcc) {
      mccBox.append('Shortcut: ', h('b', null, hint.mcc.text), ' in one chord, ' + notation(hint.mcc.keys));
    }
    practiceDiagram.render(
      diagramState({
        highlight: visible && hint.keys ? hint.keys : [],
        secondary: visible && hint.mcc ? hint.mcc.keys : [],
      })
    );
    if (settings.hints === 'delay' && !visible) {
      renderHint.timer = setTimeout(renderHint, 1550 - (performance.now() - P.lastProgressT));
    }
  }

  function renderStats() {
    const minutes = P.start ? Math.max((P.lastKeyT - P.start) / 60000, 1 / 600) : 0;
    const wpm = minutes ? Math.round(P.correct / 5 / minutes) : 0;
    const acc = P.correct + P.mistakes ? Math.round((100 * P.correct) / (P.correct + P.mistakes)) : 100;
    $('stat-wpm').textContent = wpm;
    $('stat-acc').textContent = acc + '%';
    $('stat-progress').textContent = P.pos + '/' + P.target.length;
    $('stat-mcc').textContent = P.bursts;
    return { wpm, acc };
  }

  function recordChar(c, field, ms) {
    const s = app.progress.chars[c] || (app.progress.chars[c] = { hit: 0, miss: 0, ms: 0, n: 0 });
    s[field] = (s[field] || 0) + 1;
    if (ms) {
      s.ms += ms;
      s.n += 1;
    }
  }

  function onPracticeChar(ch, t) {
    if (P.done || !P.target) return;
    if (!P.start) P.start = t;
    const expected = P.target[P.pos];
    const sinceLast = t - P.lastKeyT;
    if (ch === expected) {
      const burst = P.lastKeyT && sinceLast < 35 && P.pos > 0 && !P.curErr;
      if (burst) {
        if (!P.burstAt.has(P.pos - 1)) P.bursts++;
        P.burstAt.add(P.pos - 1);
        P.burstAt.add(P.pos);
      }
      const timed = P.pos > 0 && !P.curErr && !burst && P.lastKeyT && sinceLast < 5000;
      recordChar(expected, 'hit', timed ? sinceLast : 0);
      P.correct++;
      P.curErr = false;
      P.pos++;
      P.lastProgressT = performance.now();
      P.lastKeyT = t;
      updateTargetAround(P.pos);
      if (P.pos >= P.target.length) finishRound();
    } else {
      P.lastKeyT = t;
      if (!P.curErr) recordChar(expected, 'miss');
      P.mistakes++;
      P.curErr = true;
      P.errAt.add(P.pos);
      updateTargetAround(P.pos);
      const wrong = T4.chordForText(app.layout, ch);
      if (wrong) practiceDiagram.flash(wrong.keys, 'wrong');
    }
    renderStats();
    renderHint();
  }

  function finishRound() {
    P.done = true;
    const { wpm, acc } = renderStats();
    const l = P.lesson;
    let note;
    if (l.kind === 'custom' || l.kind === 'weak') {
      note = acc >= 95 ? 'Clean round.' : 'Slow down a little and aim for 95% accuracy.';
    } else {
      const rec = app.progress.lessons[l.id] || (app.progress.lessons[l.id] = { bestWpm: 0, bestAcc: 0, rounds: 0, done: false });
      rec.rounds++;
      rec.bestWpm = Math.max(rec.bestWpm, wpm);
      rec.bestAcc = Math.max(rec.bestAcc, acc);
      const wasDone = rec.done;
      if (acc >= 95) rec.done = true;
      note = rec.done
        ? wasDone
          ? 'Lesson already complete. Keep repeating it to build speed, or move on.'
          : 'Lesson complete: 95% accuracy or better.'
        : 'Finish a round with 95% accuracy or better to complete this lesson.';
    }
    app.saveProgress();
    const figs = $('done-figures');
    figs.replaceChildren();
    const secs = Math.round((P.lastKeyT - P.start) / 1000);
    for (const [num, lbl] of [[wpm, 'words per minute'], [acc + '%', 'accuracy'], [secs + 's', 'time'], [P.bursts, 'shortcut chords']]) {
      const d = h('div');
      d.append(h('b', null, String(num)), h('span', null, lbl));
      figs.append(d);
    }
    $('done-note').textContent = note;
    const idx = app.plan.findIndex((x) => x.id === l.id);
    $('btn-next-lesson').hidden = idx < 0 || idx >= app.plan.length - 1;
    $('round-done').hidden = false;
    renderLessonList();
    renderHint();
  }

  function nextRound() {
    startLesson(P.lesson.id);
  }
  function nextLesson() {
    const idx = app.plan.findIndex((x) => x.id === P.lesson.id);
    if (idx >= 0 && idx < app.plan.length - 1) startLesson(app.plan[idx + 1].id);
  }

  function renderLessonList() {
    const box = $('lesson-list');
    box.replaceChildren();
    const groups = new Map();
    for (const l of app.plan) {
      if (!groups.has(l.group)) groups.set(l.group, []);
      groups.get(l.group).push(l);
    }
    const lessonButton = (l) => {
      const b = h('button', 'lesson-btn');
      b.type = 'button';
      const rec = app.progress.lessons[l.id];
      const mark = h('span', 'l-mark' + (rec && rec.done ? ' done' : rec ? ' tried' : ''));
      mark.title = rec && rec.done ? 'Complete' : rec ? 'Started' : 'Not started';
      b.append(mark, h('span', 'l-title', l.title), h('span', 'l-best', rec ? rec.bestWpm + ' wpm' : ''));
      if (P.lesson && P.lesson.id === l.id) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => {
        startLesson(l.id);
        focusTyping();
      });
      return b;
    };
    for (const [name, list] of groups) {
      const g = h('div', 'lesson-group');
      g.append(h('h3', 'eyebrow', name));
      list.forEach((l) => g.append(lessonButton(l)));
      box.append(g);
    }

    const g = h('div', 'lesson-group');
    g.append(h('h3', 'eyebrow', 'Practice'));
    const weak = charStats().slice(0, 6);
    const weakBtn = lessonButton({ id: 'weak', title: 'Weak spots' });
    g.append(weakBtn);
    if (weak.length) {
      const wl = h('div', 'weak-list');
      for (const s of weak) {
        const chip = h('span', 'weak-chip', (s.c === ' ' ? '␣' : s.c) + ' ' + Math.round(s.acc * 100) + '%');
        chip.title = 'Accuracy ' + Math.round(s.acc * 100) + '%, about ' + Math.round(s.ms) + ' ms per keystroke';
        wl.append(chip);
      }
      g.append(wl);
    }
    const customBtn = lessonButton({ id: 'custom', title: 'Custom text' });
    g.append(customBtn);
    if (P.lesson && P.lesson.id === 'custom') {
      const cb = h('div', 'custom-box');
      const ta = h('textarea');
      ta.id = 'custom-text';
      ta.placeholder = 'Paste a paragraph to type';
      ta.value = P.customText;
      const go = h('button', 'btn primary small', 'Start');
      go.type = 'button';
      go.addEventListener('click', () => {
        P.customText = ta.value;
        startLesson('custom');
        focusTyping();
      });
      cb.append(ta, go);
      g.append(cb);
    }
    box.append(g);

    const reset = h('div', 'reset-row');
    const rb = h('button', 'btn small danger subtle', 'Reset progress');
    rb.type = 'button';
    rb.addEventListener('click', () => {
      reset.replaceChildren(h('span', null, 'Erase lesson marks and key stats for this layout?'));
      const yes = h('button', 'btn small danger', 'Erase');
      const no = h('button', 'btn small', 'Cancel');
      yes.type = no.type = 'button';
      yes.addEventListener('click', () => {
        app.progress = { chars: {}, lessons: {} };
        app.saveProgress();
        renderLessonList();
        toast('Progress erased');
      });
      no.addEventListener('click', renderLessonList);
      reset.append(yes, no);
    });
    reset.append(rb);
    box.append(reset);
  }

  function focusTyping() {
    $('typing-card').focus({ preventScroll: true });
    updateVeil();
  }
  function updateVeil() {
    const practice = settings.view === 'practice';
    $('focus-veil').hidden = !practice || document.hasFocus() || !P.target || P.done;
  }

  function renderOrientNote() {
    const corner = 'F1' + settings.colOrder[0];
    const c = T4.chordFor(app.layout, [corner]);
    const order = settings.colOrder.split('').join(' · ');
    $('orient-note').textContent =
      'Finger columns are drawn ' + order + (settings.colOrder === 'RML' ? ', as on the Backspice cheat sheet.' : '.') +
      (c ? ' To check, press the top-left key on its own: it should type ' + c.description + '. If the key that does is on the other side, mirror the finger keys.' : '');
    for (const b of document.querySelectorAll('#btn-flip-cols, [data-flip="cols"]')) b.setAttribute('aria-pressed', String(settings.colOrder !== 'RML'));
    for (const b of document.querySelectorAll('#btn-flip-thumbs, [data-flip="thumbs"]')) b.setAttribute('aria-pressed', String(settings.thumbOrder !== '1234'));
  }

  function flip(which) {
    if (which === 'cols') settings.colOrder = settings.colOrder === 'RML' ? 'LMR' : 'RML';
    else settings.thumbOrder = settings.thumbOrder === '1234' ? '4321' : '1234';
    saveSettings();
    renderOrientNote();
    renderHint();
    if (app.explore) app.explore.render();
    if (settings.view === 'practice') focusTyping();
  }

  /* ---------- views ---------- */
  function showView(view) {
    settings.view = view;
    saveSettings();
    for (const v of ['practice', 'explore', 'layouts']) {
      $('view-' + v).hidden = v !== view;
      $('tab-' + v).setAttribute('aria-current', v === view ? 'page' : 'false');
    }
    if (view === 'practice') {
      renderHint();
      focusTyping();
    }
    if (view === 'explore' && app.explore) app.explore.render(true);
    if (view === 'layouts' && app.layouts) app.layouts.render();
    updateVeil();
  }
  app.showView = showView;

  function activateLayout(id) {
    loadLayout(id);
    const saved = settings.lessonByLayout[app.entry.id];
    startLesson(saved && app.plan.some((l) => l.id === saved) ? saved : app.plan[0] ? app.plan[0].id : 'custom');
    renderOrientNote();
    if (app.explore) app.explore.reset();
    if (app.layouts) app.layouts.render();
  }
  app.activateLayout = activateLayout;

  /* ---------- keyboard ---------- */
  function keyToChar(e) {
    if (e.key === 'Enter') return '\n';
    if (e.key.length === 1) return e.key;
    return null;
  }

  window.addEventListener('keydown', (e) => {
    if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
    const ch = keyToChar(e);
    if (settings.view === 'practice') {
      if (P.done) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (!e.repeat) nextRound();
        }
        return;
      }
      if (/^(BUTTON|A)$/.test(tag) && (e.key === ' ' || e.key === 'Enter')) return;
      if (e.key === 'Escape') {
        resetRound();
        return;
      }
      if (ch == null || ch === '\n' || e.repeat) return;
      e.preventDefault();
      onPracticeChar(ch, e.timeStamp || performance.now());
    } else if (settings.view === 'explore' && app.explore) {
      if (ch == null || e.repeat) return;
      if (/^(BUTTON|A)$/.test(tag) && (e.key === ' ' || e.key === 'Enter')) return;
      e.preventDefault();
      app.explore.onTyped(ch === '\n' ? '\n' : ch, e.timeStamp || performance.now());
    }
  });
  window.addEventListener('focus', updateVeil);
  window.addEventListener('blur', updateVeil);

  /* ---------- wire up ---------- */
  function init() {
    practiceDiagram = T4.createDiagram($('practice-device'));
    for (const v of ['practice', 'explore', 'layouts']) $('tab-' + v).addEventListener('click', () => showView(v));
    $('layout-select').addEventListener('change', (e) => activateLayout(e.target.value));
    const bindSelect = (id, key, after) => {
      const el = $(id);
      el.value = settings[key];
      el.addEventListener('change', () => {
        settings[key] = el.value;
        saveSettings();
        after();
        el.blur();
      });
    };
    bindSelect('opt-hints', 'hints', renderHint);
    bindSelect('opt-length', 'length', () => startLesson(P.lesson.id));
    bindSelect('opt-notation', 'notation', () => {
      renderHint();
      renderLessonHead();
      if (app.explore) app.explore.render();
    });
    $('btn-restart').addEventListener('click', () => {
      resetRound();
      focusTyping();
    });
    $('btn-next-round').addEventListener('click', () => {
      nextRound();
      focusTyping();
    });
    $('btn-next-lesson').addEventListener('click', () => {
      nextLesson();
      focusTyping();
    });
    $('typing-card').addEventListener('click', focusTyping);
    $('btn-flip-cols').addEventListener('click', () => flip('cols'));
    $('btn-flip-thumbs').addEventListener('click', () => flip('thumbs'));
    for (const b of document.querySelectorAll('[data-flip]')) b.addEventListener('click', () => flip(b.dataset.flip));

    activateLayout(settings.layoutId);
    if (window.T4Explore) app.explore = window.T4Explore(app);
    if (window.T4Layouts) app.layouts = window.T4Layouts(app);
    showView(settings.view);
  }

  app.flip = flip;
  document.addEventListener('DOMContentLoaded', init);
})();
