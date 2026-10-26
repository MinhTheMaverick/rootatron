/* Tutorial runner: a guide card beside Make a Plot that the user follows by
 * doing each step in the real app. A step moves on only when the app's state
 * shows it was done (or, for something judged by eye, when the user confirms
 * it). Show me points at the control and acts out the gesture without
 * changing anything; Back restores the app as it was when that step began.
 * Lessons are data (window.TutorialLessons). Open modern.html?tutorial=<id>. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const lessons = window.TutorialLessons || {};
  const id = new URLSearchParams(location.search).get('tutorial');
  const lesson = id && lessons[id];
  if (!lesson) return;

  const KEY = 'rootfit.tutorial.' + id;
  const steps = lesson.steps;
  const byId = Object.fromEntries(steps.map(s => [s.id, s]));
  let state = {step: steps[0].id, branch: null, done: []};
  try { const saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved && byId[saved.step]) state = {...state, ...saved}; } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
  const ctx = {flags: {}, lesson, state, $, refresh: () => render()};
  const val = (v, ...a) => typeof v === 'function' ? v(ctx, ...a) : v;
  const touch = matchMedia('(hover: none)').matches;

  // ---- one top-layer layer holds the card, the ring, the leader and the pointer, so they stay above the app's dialogs ----
  const layer = document.createElement('div');
  layer.id = 'tut-layer';
  layer.style.setProperty('--tut-accent', lesson.color || '#f0b429');
  layer.innerHTML = `<div class="tut-ring" hidden></div>
    <svg class="tut-leader" hidden aria-hidden="true"><line/><circle r="4"/></svg>
    <div class="tut-pointer" hidden aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l16 9-7 1.6L9.6 20z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg></div>
    <div class="tut-bubble" hidden aria-hidden="true"></div>
    <aside class="tut-card" aria-label="Tutorial: ${esc(lesson.title)}">
      <header class="tut-top"><span class="tut-lesson">${esc(lesson.title)}</span><button type="button" class="tut-exit">Exit</button></header>
      <ol class="tut-phases" aria-hidden="true"></ol>
      <div class="tut-meta"><span class="tut-phase"></span><span class="tut-count"></span></div>
      <div class="tut-main">
        <p class="tut-say"></p>
        <p class="tut-note" hidden></p>
        <p class="tut-warn" role="alert" hidden></p>
        <div class="tut-panels" hidden></div>
        <div class="tut-checks" hidden></div>
        <div class="tut-choices" hidden></div>
        <div class="tut-extra" hidden></div>
      </div>
      <p class="tut-status" hidden>✓ Done</p>
      <footer class="tut-nav">
        <button type="button" class="tut-back"><span class="w">Back</span><span class="n" aria-hidden="true">‹</span></button>
        <button type="button" class="tut-show">Show me</button>
        <button type="button" class="tut-next"><span class="w">Next</span><span class="n" aria-hidden="true">›</span></button>
      </footer>
      <p class="tut-help" hidden>Still stuck? <button type="button" class="tut-doit">Do this step for me</button></p>
      <p class="tut-keys" hidden><kbd>Space</kbd> next · <kbd>Backspace</kbd> back</p>
      <div class="sr-only" aria-live="polite"></div>
    </aside>`;
  try { layer.popover = 'manual'; } catch {}
  document.body.appendChild(layer);
  document.body.classList.add('with-tutorial');
  const q = s => layer.querySelector(s);
  const card = q('.tut-card'), ring = q('.tut-ring'), leader = q('.tut-leader'), pointer = q('.tut-pointer'), bubble = q('.tut-bubble');
  const bBack = q('.tut-back'), bShow = q('.tut-show'), bDoit = q('.tut-doit'), bNext = q('.tut-next');
  function toTop() { try { if (layer.matches(':popover-open')) layer.hidePopover(); layer.showPopover(); } catch {} }
  toTop();
  // A modal dialog makes everything outside it inert, so while one is open the guide lives inside it
  // (still drawn over the whole page from the top layer), and returns to the page when it closes.
  let home = document.body, exited = false;
  function watchDialogs() {
    if (exited) return;
    const modal = [...document.querySelectorAll('dialog[open]')].filter(d => { try { return d.matches(':modal'); } catch { return true; } }).pop() || document.body;
    if (modal !== home || !layer.isConnected) { home = modal; modal.append(layer); toTop(); }
  }

  // ---- steps the user can see: the main line plus the chosen branch ----
  const visibleSteps = () => steps.filter(s => !s.branch || s.branch === (state.branch || lesson.defaultBranch));
  const phases = () => [...new Set(steps.map(s => s.phase).filter(Boolean))];
  const nextOf = step => { const n = val(step.next); if (n) return n; const list = visibleSteps(); return list[list.indexOf(step) + 1]?.id; };
  const prevOf = step => { const list = visibleSteps(); return list[list.indexOf(step) - 1]?.id; };

  // ---- snapshots: Back puts the app back as it was when that step began ----
  // Kept for this browser tab, so Back still undoes after a reload.
  const SNAP_KEY = KEY + '.snapshots';
  const snaps = (() => { try { return JSON.parse(sessionStorage.getItem(SNAP_KEY) || '{}') || {}; } catch { return {}; } })();
  const keepSnaps = () => { try { sessionStorage.setItem(SNAP_KEY, JSON.stringify(snaps)); } catch { /* too large or blocked: Back still moves, without undoing */ } };
  const page = () => !$('results')?.hidden ? 'results' : !$('step-function')?.hidden ? 'function' : 'data';
  function snapshot(stepId) {
    try { snaps[stepId] = {doc: JSON.parse(JSON.stringify(buildDocument())), page: page(), adjust: $('visual-match-open')?.getAttribute('aria-expanded') === 'true'}; keepSnaps(); } catch (e) { console.warn('tutorial snapshot', e); }
  }
  function restore(stepId) {
    const s = snaps[stepId]; if (!s) return false;
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    try {
      const doc = JSON.parse(JSON.stringify(s.doc));
      if (window.WorkspaceStore) doc.revision = window.WorkspaceStore.read(localStorage).revision;   // the stored session moved on since the snapshot
      applyDocument(doc);
      if (typeof autosave === 'function') autosave();
      document.querySelector(`.step-chip[data-target="step-${s.page}"]`)?.click();
      const open = $('visual-match-open');
      if (open && !open.disabled && (open.getAttribute('aria-expanded') === 'true') !== s.adjust) open.click();
      document.dispatchEvent(new Event('change'));
    } catch (e) { console.warn('tutorial restore', e); return false; }
    return true;
  }

  // ---- state of the current step ----
  let doneAtEntry = false, isDone = false, checksLeft = 0, advancing = null, showed = false;
  function finished(step) {
    if (step.final || step.choices) return false;
    if (step.checks) return checksLeft === 0;
    try { return !!step.done?.(ctx); } catch { return false; }
  }

  // ---- rendering ----
  function panel(p, kind) {
    if (!p) return '';
    const mark = kind === 'right' ? '<span class="tut-mark ok" aria-label="Right">✓</span>' : kind === 'wrong' ? '<span class="tut-mark bad" aria-label="Wrong">✕</span>' : '';
    return `<figure class="tut-fig ${kind}">${mark}<div class="tut-pic">${val(p.pic) || ''}</div><figcaption>${val(p.cap) || ''}</figcaption></figure>`;
  }
  function render() {
    const step = byId[state.step];
    const list = visibleSteps(), at = list.indexOf(step), ph = phases();
    q('.tut-phases').innerHTML = ph.map(p => {
      const mine = list.filter(s => s.phase === p), cur = p === step.phase;
      const done = mine.length && mine.every(s => state.done.includes(s.id) || list.indexOf(s) < at);
      return `<li class="${cur ? 'is-current' : done ? 'is-done' : ''}" title="${esc(p)}"></li>`;
    }).join('');
    q('.tut-phase').textContent = step.phase || '';
    q('.tut-count').innerHTML = `<b>${at + 1}</b> / ${list.length}`;
    q('.tut-say').innerHTML = val(step.say) || '';
    const note = val(step.note); q('.tut-note').hidden = !note; q('.tut-note').innerHTML = note || '';
    const panels = q('.tut-panels');
    const html = (step.inset ? panel(step.inset, 'inset') : '') + (step.right ? panel(step.right, 'right') : '') + (step.wrong ? panel(step.wrong, 'wrong') : '');
    panels.hidden = !html; panels.innerHTML = html;
    const extra = val(step.extra); q('.tut-extra').hidden = !extra; q('.tut-extra').innerHTML = extra || '';
    const choices = q('.tut-choices');
    choices.hidden = !step.choices;
    choices.innerHTML = (step.choices || []).map(c => `<button type="button" class="tut-choice" data-choice="${esc(c.id)}" data-goto="${esc(c.goto)}"><strong>${esc(c.label)}</strong><span>${esc(c.desc)}</span></button>`).join('');
    renderChecks(step);
    bBack.disabled = at <= 0;
    bShow.hidden = !step.show; q('.tut-help').hidden = !(step.doIt && showed);
    bNext.hidden = !!step.choices || !!step.final;
    q('.tut-keys').hidden = touch || at !== 0;
    card.classList.toggle('is-final', !!step.final);
    q('[aria-live]').textContent = `Step ${at + 1} of ${list.length}. ${q('.tut-say').textContent}`;
    status(); placeTarget(true);
  }
  function renderChecks(step) {
    const box = q('.tut-checks');
    if (!step.checks) { box.hidden = true; box.innerHTML = ''; return; }
    const items = val(step.checks), i = items.length - checksLeft;
    box.hidden = false;
    box.innerHTML = checksLeft ? `<div class="tut-check"><span class="tut-check-n">Check ${i + 1} of ${items.length}</span><p>${items[i]}</p><button type="button" class="tut-confirm">Confirm</button></div>`
      : `<div class="tut-check is-done"><span class="tut-check-n">All ${items.length} checks confirmed</span></div>`;
  }
  function status() {
    const step = byId[state.step];
    isDone = finished(step);
    q('.tut-status').hidden = !isDone || !!step.checks;
    bNext.disabled = !isDone;
    bNext.classList.toggle('is-ready', isDone);
    const warn = isDone ? null : val(step.warn);
    q('.tut-warn').hidden = !warn; q('.tut-warn').innerHTML = warn || '';
  }

  // ---- target: ring around the control, a leader from the card, the page scrolled to frame the work ----
  let targetEl = null;
  function findTarget(step) { const t = val(step.target); if (!t) return null; return typeof t === 'string' ? document.querySelector(t) : t; }
  function placeTarget(scroll) {
    const step = byId[state.step];
    targetEl = findTarget(step);
    const visible = targetEl && targetEl.getClientRects().length;
    if (scroll && visible && !step.noScroll) {
      const frame = (step.frame && (typeof step.frame === 'string' ? document.querySelector(step.frame) : val(step.frame))) || targetEl;
      try { frame.scrollIntoView({block: step.frameBlock || 'center', behavior: 'instant'}); } catch {}
      ensureVisible(targetEl);
    }
    draw();
  }
  // Bring the target into the part of the screen nothing covers: above the card on a phone,
  // below the sticky preview, inside its own scrolling list or dialog.
  function scroller(el) {
    for (let box = el.parentElement; box && box !== document.body && box !== document.documentElement; box = box.parentElement) {
      const cs = getComputedStyle(box);
      if (/(auto|scroll)/.test(cs.overflowY) && box.scrollHeight > box.clientHeight + 2) return box;
    }
    return null;
  }
  function freeBand(el) {
    let top = 0, bottom = innerHeight;
    if (innerWidth <= 980) bottom = Math.min(bottom, card.getBoundingClientRect().top - 8);
    const bar = document.querySelector('.fit-bar');   // the app's sticky bottom bar
    if (bar && !bar.contains(el) && bar.getClientRects().length) { const r = bar.getBoundingClientRect(); if (r.top < bottom && r.bottom >= bottom - 4) bottom = r.top - 6; }
    const sticky = document.querySelector('.visual-match-layout .visual-preview-plot');
    if (sticky && !sticky.contains(el) && sticky.getClientRects().length && getComputedStyle(sticky).position === 'sticky') {
      const r = sticky.getBoundingClientRect(); if (r.top < 140 && r.bottom > 0 && r.bottom < bottom - 80) top = Math.max(top, r.bottom + 6);
    }
    const head = document.querySelector('.masthead'); if (head && getComputedStyle(head).position === 'fixed' || head && getComputedStyle(head).position === 'sticky') top = Math.max(top, head.getBoundingClientRect().bottom + 4);
    return [top, bottom];
  }
  function ensureVisible(el) {
    for (let pass = 0; pass < 3; pass++) {
      const r = el.getBoundingClientRect(); let [top, bottom] = freeBand(el);
      const box = scroller(el);
      if (box) { const b = box.getBoundingClientRect(); top = Math.max(top, b.top + 4); bottom = Math.min(bottom, b.bottom - 4); }
      if (bottom - top < 40) return;
      if (r.top >= top && r.bottom <= bottom) return;
      const delta = r.height > bottom - top ? r.top - top : (r.top + r.height / 2) - (top + bottom) / 2;
      const before = box ? box.scrollTop : scrollY;
      if (box) box.scrollTop += delta; else scrollBy(0, delta);
      if ((box ? box.scrollTop : scrollY) === before) {   // that list cannot move further: let the page move
        if (box) { scrollBy(0, delta); } else return;
      }
    }
  }
  function draw() {
    document.body.style.setProperty('--tut-sheet', innerWidth <= 980 ? card.offsetHeight + 'px' : '0px');
    const live = targetEl && targetEl.isConnected && targetEl.getClientRects().length;
    ring.hidden = !live; const noLeader = !live || innerWidth <= 980; leader.toggleAttribute('hidden', noLeader);
    if (!live) return;
    const r = targetEl.getBoundingClientRect(), pad = 4;
    Object.assign(ring.style, {left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px'});
    if (noLeader) return;
    const c = card.getBoundingClientRect(), say = q('.tut-say').getBoundingClientRect();
    const x1 = c.left, y1 = Math.min(Math.max(r.top + r.height / 2, c.top + 24), c.bottom - 24);   // level with the target where the card allows
    const x2 = Math.min(Math.max(x1, r.left - pad), r.right + pad), y2 = Math.min(Math.max(y1, r.top - pad), r.bottom + pad);
    const ln = leader.querySelector('line'), dot = leader.querySelector('circle');
    const off = x2 >= x1 - 8;   // the target sits under the card's edge: no leader
    leader.style.display = off ? 'none' : '';
    ln.setAttribute('x1', x1); ln.setAttribute('y1', y1); ln.setAttribute('x2', x2); ln.setAttribute('y2', y2);
    dot.setAttribute('cx', x2); dot.setAttribute('cy', y2);
  }
  addEventListener('scroll', draw, {passive: true, capture: true}); addEventListener('resize', draw);

  // ---- Show me: a pointer travels to the control and acts out the gesture; nothing changes ----
  let showTimer = null;
  async function showMe() {
    const step = byId[state.step]; placeTarget(true);
    await new Promise(r => setTimeout(r, 450));
    const el = findTarget(step); if (!el) return;
    const g = val(step.show) || {};
    const r = el.getBoundingClientRect(), c = card.getBoundingClientRect();
    const tx = r.left + Math.min(r.width / 2, 60), ty = r.top + Math.min(r.height / 2, 22);
    clearTimeout(showTimer);
    pointer.hidden = false; pointer.classList.remove('is-click');
    Object.assign(pointer.style, {transition: 'none', left: (innerWidth > 980 ? c.left - 30 : r.left + r.width / 2) + 'px', top: (innerWidth > 980 ? c.top + 60 : innerHeight - 40) + 'px'});
    pointer.getBoundingClientRect();
    Object.assign(pointer.style, {transition: 'left .7s ease, top .7s ease', left: tx + 'px', top: ty + 'px'});
    showTimer = setTimeout(() => {
      pointer.classList.add('is-click');
      if (g.text) { bubble.hidden = false; bubble.innerHTML = g.text; Object.assign(bubble.style, {left: Math.min(tx + 18, innerWidth - 240) + 'px', top: ty + 18 + 'px'}); }
      showTimer = setTimeout(() => { pointer.hidden = true; bubble.hidden = true; }, g.text ? 2600 : 1200);
    }, 760);
    if (step.doIt && !showed) { showed = true; q('.tut-help').hidden = false; }
  }

  // ---- moving between steps ----
  function go(stepId, {back = false} = {}) {
    if (!byId[stepId]) return;
    clearTimeout(advancing); advancing = null;
    const from = byId[state.step];
    from?.leave?.(ctx);
    pointer.hidden = true; bubble.hidden = true;
    if (back) { if (restore(stepId)) state.done = state.done.filter(d => d !== stepId); }
    state.step = stepId; save();
    const step = byId[stepId];
    checksLeft = step.checks ? val(step.checks).length : 0;
    showed = false;
    step.ui?.(ctx);
    if (!back) snapshot(stepId);
    step.enter?.(ctx);
    doneAtEntry = finished(step);
    render();
    setTimeout(() => placeTarget(true), 120);
  }
  function next() {
    const step = byId[state.step];
    if (!finished(step)) return;
    if (!state.done.includes(step.id)) state.done.push(step.id);
    const n = nextOf(step); if (n) go(n); else save();
  }
  function back() { const p = prevOf(byId[state.step]); if (p) go(p, {back: true}); }

  bNext.addEventListener('click', next);
  bBack.addEventListener('click', back);
  bShow.addEventListener('click', showMe);
  bDoit.addEventListener('click', async () => { try { await byId[state.step].doIt?.(ctx); } catch (e) { console.warn('tutorial doIt', e); } tick(); });
  q('.tut-exit').addEventListener('click', () => exit());
  card.addEventListener('click', e => {
    const choice = e.target.closest('[data-choice]');
    if (choice) { state.branch = choice.dataset.choice; if (!state.done.includes(state.step)) state.done.push(state.step); go(choice.dataset.goto); return; }
    if (e.target.closest('.tut-confirm')) { confirmCheck(); return; }
    const flag = e.target.closest('[data-flag]');
    if (flag) { ctx.flags[flag.dataset.flag] = true; setTimeout(tick, 0); }
    if (e.target.closest('[data-redo]')) { restore(state.step); doneAtEntry = false; render(); return; }
    if (e.target.closest('[data-restart]')) { restore(steps[0].id); state.done = []; state.branch = null; ctx.flags = {}; for (const k in snaps) if (k !== steps[0].id) delete snaps[k]; keepSnaps(); go(steps[0].id); return; }
    const jump = e.target.closest('[data-goto]');
    if (jump) go(jump.dataset.goto, {back: visibleSteps().indexOf(byId[jump.dataset.goto]) < visibleSteps().indexOf(byId[state.step])});
  });
  function confirmCheck() {
    if (!checksLeft) return;
    checksLeft--; renderChecks(byId[state.step]); status();
    if (!checksLeft) bNext.focus({preventScroll: true});
  }
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target, field = t.closest?.('input, textarea, select, [contenteditable], button, summary, a');
    if (field || document.querySelector('dialog[open]')) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (checksLeft) confirmCheck(); else next();
    } else if (e.key === 'Backspace') { e.preventDefault(); back(); }
  });

  function exit() {
    exited = true;
    byId[state.step]?.leave?.(ctx);
    layer.remove();
    document.body.classList.remove('with-tutorial'); document.body.style.removeProperty('--tut-sheet');
    const url = new URL(location.href); url.searchParams.delete('tutorial'); history.replaceState(null, '', url);
    clearInterval(timer);
  }

  // ---- watching the app ----
  function tick() {
    if (exited) return;
    watchDialogs();
    const step = byId[state.step];
    step.tick?.(ctx);
    if (step.live) {   // steps whose text reports progress re-render as the state changes
      const html = val(step.say); const box = q('.tut-say'); if (box.innerHTML !== html) box.innerHTML = html;
      const ex = val(step.extra); const eb = q('.tut-extra'); if ((ex || '') !== eb.innerHTML) { eb.hidden = !ex; eb.innerHTML = ex || ''; }
    }
    const was = isDone;
    status();
    const t = findTarget(step);   // the target can move: a dialog closes, a box is re-rendered
    if (t !== targetEl) placeTarget(false); else draw();
    // Move on by itself only when the user has just done a one-action step; anything to look at waits for Next.
    if (isDone && !was && !doneAtEntry && !step.look && !step.checks && !advancing) {
      advancing = setTimeout(() => { advancing = null; if (state.step === step.id && finished(step)) next(); }, 700);
    }
    if (!isDone) doneAtEntry = false;
  }
  const timer = setInterval(tick, 300);
  for (const type of ['input', 'change', 'click', 'keyup']) document.addEventListener(type, () => setTimeout(tick, 40), true);
  new MutationObserver(watchDialogs).observe(document.body, {subtree: true, attributes: true, attributeFilter: ['open'], childList: true});

  lesson.start?.(ctx);
  window.Tutorial = {go, state, exit, next, back, ctx};
  go(state.step, {back: false});
})();
