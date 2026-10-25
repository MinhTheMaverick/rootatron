/* Lesson 1: Your first fit. The user rebuilds the double-slit fit from the
 * downloaded file, one action per step, in the real app: data, model,
 * starting values (read off the plot one at a time, or from a language
 * model), fit, and reading the result. Every step waits for the user to do
 * it; right/wrong panels show the mistake that step makes possible. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const MODEL = {
    formula: '[1]+[0]/2*([2]*(x-[4])==0?1:pow(sin([2]*(x-[4]))/([2]*(x-[4])),2))*(1+([6]+[7]*(x-[4]))*cos(2*[3]*(x-[5])))',
    params: 'count_scale, background, envelope_scale, fringe_frequency, envelope_center, fringe_origin, visibility, visibility_slope',
    guesses: '1, 0, 1, 5, 0, 0, 0.5, 0',
    symbols: 'N0, N_bg, k_a, k_d, x_1, x_0, V, V_1',
  };
  const GOOD = [60000, 0, 1, 4.13, 5.5, 5.75, 0.5, 0];   // what the plot-reading steps arrive at
  // "Close enough" for each starting value: wide bands, since the fit does the rest.
  const between = (lo, hi) => v => Number.isFinite(v) && v >= lo && v <= hi;
  const TARGETS = [between(30000, 90000), between(0, 3000), between(0.5, 2), between(3.6, 4.6), between(5.2, 5.8), between(5.4, 6.1), between(0.2, 0.9), between(-0.3, 0.3)];
  const norm = f => String(f || '').replace(/\s+/g, '');
  const numbers = text => (String(text || '').match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) || []).map(Number);
  const active = () => (typeof datasets !== 'undefined' && datasets[activeIdx]) || {};
  const result = () => active().result?.response || null;
  const onFitStep = () => $('step-function') && !$('step-function').hidden;
  const modelChosen = () => norm($('formula')?.value) === norm(MODEL.formula);
  const guesses = () => numbers($('initial-guesses')?.value);
  const guessOk = i => TARGETS[i](guesses()[i]);
  const guessesChanged = () => { const g = guesses(); return g.length === 8 && g.join() !== numbers(MODEL.guesses).join(); };
  const fire = (el, type = 'input') => el && el.dispatchEvent(new Event(type, {bubbles: true}));
  const fmt = v => Number(v).toPrecision(3).replace(/\.?0+$/, '');
  const thousands = v => Math.round(v).toLocaleString('en-US').replace(/,/g, ' ');
  const dialogOpen = sel => !!document.querySelector(sel + '[open]');
  const libraryCard = name => [...document.querySelectorAll('.model-library-dialog[open] .ml-card')].find(c => c.querySelector('.ml-name')?.textContent.trim() === name);
  const LINEAR = 'Double-slit (linear fringe visibility)';
  const setGuesses = v => { const el = $('initial-guesses'); el.value = v.join(', '); fire(el); fire(el, 'change'); };
  const setGuess = (i, v) => { const g = guesses(); const base = g.length === 8 ? g : numbers(MODEL.guesses); base[i] = v; setGuesses(base); };
  const card = i => $('visual-value-' + i);

  // ---- the data, for the small right/wrong plots ----
  let DATA = null;
  async function loadData(ctx) {
    if (DATA) return DATA;
    try {
      const text = await (await fetch('tutorials/double-slit.csv')).text();
      const rows = text.trim().split('\n').slice(1).map(l => l.split(',').map(Number));
      DATA = {x: rows.map(r => r[0]), y: rows.map(r => r[1]), e: rows.map(r => r[2]), text};
      ctx?.refresh();
    } catch {}
    return DATA;
  }
  function model(x, p) {
    const [N0, bg, ka, kd, x1, x0, V, V1] = p, u = ka * (x - x1), s = u === 0 ? 1 : (Math.sin(u) / u) ** 2;
    return bg + N0 / 2 * s * (1 + (V + V1 * (x - x1)) * Math.cos(2 * kd * (x - x0)));
  }
  // A small copy of the app's starting-curve preview: the data as dots, the curve dashed.
  function miniPlot(p) {
    if (!DATA) return '<div style="height:92px"></div>';
    const W = 300, H = 92, L = 6, R = 294, T = 6, B = 86;
    const lo = Math.min(...DATA.x), hi = Math.max(...DATA.x), y0 = Math.min(...DATA.y), y1 = Math.max(...DATA.y), span = y1 - y0, ymin = y0 - span * .08, ymax = y1 + span * .08;
    const sx = x => L + (x - lo) / (hi - lo) * (R - L), sy = y => Math.max(-500, Math.min(500, B - (y - ymin) / (ymax - ymin) * (B - T)));
    let d = '';
    for (let i = 0; i <= 200; i++) { const x = lo + (hi - lo) * i / 200; d += (i ? 'L' : 'M') + sx(x).toFixed(1) + ',' + sy(model(x, p)).toFixed(1); }
    const dots = DATA.x.map((x, i) => `<circle cx="${sx(x).toFixed(1)}" cy="${sy(DATA.y[i]).toFixed(1)}" r="1.7" fill="#354759"/>`).join('');
    const id = 'tc' + Math.random().toString(36).slice(2, 7);
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Starting curve over the data"><defs><clipPath id="${id}"><rect x="${L}" y="${T}" width="${R - L}" height="${B - T}"/></clipPath></defs><path d="M${L} ${T}V${B}H${R}" stroke="#becbd7" fill="none"/><g clip-path="url(#${id})">${dots}<path d="${d}" stroke="#346295" stroke-width="1.8" stroke-dasharray="5 3" fill="none"/></g></svg>`;
  }
  const P = (over) => { const p = [1, 0, 1, 5, 0, 0, .5, 0]; for (const [i, v] of Object.entries(over)) p[i] = v; return p; };
  // Stages of the plot-reading route, so each picture shows what the user really sees at that step.
  const AT = {
    count: P({4: 5.5, 0: 60000}),
    origin: P({4: 5.5, 0: 60000, 5: 5.75}),
    freq: P({4: 5.5, 0: 60000, 5: 5.75, 3: 4.13}),
  };

  // ---- measurements drawn on the app's own preview: one per step ----
  function features() {
    const xs = numbers($('col-x')?.value), ys = numbers($('col-y')?.value);
    if (xs.length < 10 || xs.length !== ys.length) return null;
    const lo = $('fit-xmin')?.value.trim(), hi = $('fit-xmax')?.value.trim();
    const low = lo ? Number(lo) : Math.min(...xs), high = hi ? Number(hi) : Math.max(...xs);
    const pts = xs.map((x, i) => [x, ys[i]]).filter(p => p[0] >= low && p[0] <= high);
    const yv = pts.map(p => p[1]), y0 = Math.min(...yv), y1 = Math.max(...yv), span = (y1 - y0) || 1, ymin = y0 - span * .08, ymax = y1 + span * .08;
    // The same data-to-pixel mapping as the preview drawn by fit-model.js (viewBox 624 x 244).
    const sx = x => 52 + (x - low) / (high - low) * 544, sy = y => 210 - (y - ymin) / (ymax - ymin) * 184;
    const peaks = [], dips = [];
    for (let i = 3; i < pts.length - 3; i++) {
      const w = pts.slice(i - 3, i + 4).map(p => p[1]);
      if (pts[i][1] === Math.max(...w) && w.filter(v => v === pts[i][1]).length === 1) peaks.push(pts[i]);
      if (pts[i][1] === Math.min(...w) && w.filter(v => v === pts[i][1]).length === 1) dips.push(pts[i]);
    }
    if (peaks.length < 2) return null;
    const top = peaks.reduce((a, b) => b[1] > a[1] ? b : a);
    const i = peaks.indexOf(top), next = peaks[i + 1] || peaks[i - 1];
    const dip = dips.filter(d => (d[0] - top[0]) * (d[0] - next[0]) < 0)[0];
    const big = peaks.filter(p => p[1] > top[1] * .4);
    const centre = big.reduce((s, p) => s + p[0] * p[1], 0) / big.reduce((s, p) => s + p[1], 0);
    return {sx, sy, top, next, dip, centre, spacing: Math.abs(next[0] - top[0])};
  }
  const BLUE = '#346295';   // the site's blue: measurements drawn by the tutorial
  function chip(x, y, text, anchor = 'start') {
    const w = text.length * 6.2 + 12, x0 = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
    return `<rect x="${x0.toFixed(1)}" y="${(y - 13).toFixed(1)}" width="${w.toFixed(1)}" height="18" rx="3" fill="${BLUE}"/><text x="${(x0 + 6).toFixed(1)}" y="${(y).toFixed(1)}" font-size="11.5" font-weight="600" fill="#fff" font-family="-apple-system, BlinkMacSystemFont, Roboto, 'Segoe UI', Arial, sans-serif">${text}</text>`;
  }
  const seg = (d, dash = '') => `<path d="${d}" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/><path d="${d}" fill="none" stroke="${BLUE}" stroke-width="1.8" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
  function annotate(kind) {
    const svg = $('guess-preview')?.querySelector('svg');
    if (!svg) return;
    const old = svg.querySelector('#tut-annot');
    if (old?.dataset.kind === kind) return;
    old?.remove();
    const f = features(); if (!f) return;
    const {sx, sy, top, next, centre, spacing} = f;
    const X = sx(top[0]), Y = sy(top[1]);
    let g = '';
    if (kind === 'middle') { const xc = sx(centre); g = seg(`M${xc} 24V210`, '6 4') + chip(xc - 6, 40, `middle ≈ ${centre.toFixed(1)}`, 'end'); }
    if (kind === 'peak') g = seg(`M54 ${Y}H${X - 5}`) + seg(`M54 ${Y - 5}v10`) + chip(60, Y - 8, `tallest peak ≈ ${thousands(Math.round(top[1] / 1000) * 1000)}`);
    if (kind === 'bright') g = seg(`M${X} ${Y + 6}V210`, '2 3') + chip(X + 6, 204, `brightest fringe at ${top[0].toFixed(2)}`);
    if (kind === 'spacing') { const x2 = sx(next[0]); g = seg(`M${X} ${Y - 4}V18H${x2}V${sy(next[1]) - 4}`) + chip((X + x2) / 2, 14, `spacing ${spacing.toFixed(2)}`, 'middle'); }
    svg.insertAdjacentHTML('beforeend', `<g id="tut-annot" data-kind="${kind}">${g}</g>`);
  }
  const unannotate = () => $('guess-preview')?.querySelector('#tut-annot')?.remove();

  // ---- small pictures of the app's controls ----
  const gridPic = shifted => `<table class="tut-mini"><tr><th>X</th><th>Y</th><th>X uncertainty</th><th>Y uncertainty</th></tr>${shifted
    ? '<tr><td class="bad"></td><td class="bad">3.65</td><td class="bad">7540</td><td>86.83</td></tr><tr><td class="bad"></td><td class="bad">3.7</td><td class="bad">7335</td><td>85.64</td></tr>'
    : '<tr><td>3.65</td><td>7540</td><td class="dim">—</td><td>86.83</td></tr><tr><td>3.7</td><td>7335</td><td class="dim">—</td><td>85.64</td></tr>'}</table>`;
  const sheetPic = `<table class="tut-mini"><tr><th class="colhead"></th><th class="colhead">A</th><th class="colhead">B</th><th class="colhead">C</th></tr><tr><th class="colhead">1</th><td class="sel">x</td><td class="sel">y</td><td class="sel">y uncertainty</td></tr><tr><th class="colhead">2</th><td class="sel">3.65</td><td class="sel">7540</td><td class="sel">86.83</td></tr><tr><th class="colhead">3</th><td class="sel">3.7</td><td class="sel">7335</td><td class="sel">85.64</td></tr></table>`;
  const ctl = (label, ...boxes) => `<div class="tut-ctl"><span class="lbl">${label}</span>${boxes.join('')}</div>`;
  const sel = t => `<span class="sel-box">${t}</span>`, num = t => `<span class="num-box">${t}</span>`;
  const modelPic = (name, hi) => `<div class="tut-ctl${hi ? ' hi' : ''}"><span class="lbl">${name}</span><span class="use">Use</span></div>`;

  // ---- a starting value read off the plot: one step each ----
  function estimate(i, kind, opts) {
    return {
      id: opts.id, branch: 'adjust', phase: 'Starting values', look: true,
      target: () => card(i), frame: '#guess-preview-panel', frameBlock: 'start',
      say: opts.say, note: opts.note, right: opts.right, wrong: opts.wrong,
      tick: () => annotate(kind), leave: unannotate,
      ui: ensureAdjusting,
      done: () => guessOk(i),
      show: {text: opts.hint},
      doIt: () => setGuess(i, GOOD[i]),
    };
  }
  function ensureAdjusting() {
    const open = $('visual-match-open');
    if (open && !open.disabled && open.getAttribute('aria-expanded') !== 'true') open.click();
  }

  window.TutorialLessons = window.TutorialLessons || {};
  window.TutorialLessons['first-fit'] = {
    title: 'Your first fit',
    defaultBranch: 'adjust',
    start(ctx) {
      loadData(ctx);
      // Work in a fresh dataset so nothing of the user's is touched.
      if (typeof syncActiveFromColumns !== 'function') return;
      syncActiveFromColumns();
      const d = datasets[activeIdx];
      const untouched = !d.analysis_type && !/[0-9]/.test(d.x + d.y);
      if (ctx.state.done.length && d.name === 'Double slit (tutorial)') return;   // resuming
      if (!untouched) { datasets.push(newDataset('Double slit (tutorial)', '')); activeIdx = datasets.length - 1; }
      else d.name = 'Double slit (tutorial)';
      showActiveInColumns();
      document.addEventListener('click', e => { if (e.target.closest('[data-action="save"], #btn-save')) ctx.flags.saved = true; }, true);
    },
    steps: [
      // ---------------- data
      {
        id: 'get-data', phase: 'Data',
        say: 'Download the double-slit data, either as an Excel file or as a CSV file.',
        note: 'It holds 80 rows: the detector position <code>x</code>, the counts <code>y</code>, and the uncertainty on each count.',
        extra: `<div class="tut-downloads"><a href="tutorials/double-slit.xlsx" download data-flag="downloaded">Excel file (.xlsx)</a><a href="tutorials/double-slit.csv" download data-flag="downloaded">CSV file</a></div>
          <p style="margin-top:8px"><button type="button" class="tut-link" data-flag="downloaded">I already have the file</button></p>`,
        done: ctx => ctx.flags.downloaded,
      },
      {
        id: 'type', phase: 'Data', target: '#setup-type',
        say: 'Choose <strong>One variable f(x)</strong> as the data type.',
        note: 'The counts depend on one other quantity, the detector position.',
        done: () => active().analysis_type === 'xy',
        show: {text: 'Open the list and choose <b>One variable f(x)</b>'},
        doIt: () => { const s = $('setup-type'); s.value = 'xy'; fire(s, 'change'); },
      },
      {
        id: 'paste', phase: 'Data', target: '#setup-grid',
        say: 'Open the file and select the three columns from the header row down. Copy them, click the first cell under <strong>X</strong>, and paste.',
        note: 'Or press <strong>Import CSV</strong> below the table and choose the CSV file.',
        inset: {pic: sheetPic, cap: 'Select from row 1, the header row, down to the last row.'},
        right: {pic: gridPic(false), cap: '<b>With the header row,</b> each column lands under its own name, whichever cell you paste into.'},
        wrong: {pic: gridPic(true), cap: '<b>Without it,</b> the columns fill from the cell you click. Start in Y and the positions land under Y.'},
        warn: () => { const d = active(), y = numbers(d.y); return y.length >= 10 && Math.max(...y) < 50 ? 'The columns have shifted: the positions are under Y. <button type="button" class="tut-link" data-redo>Clear the table</button> and paste again, from the header row down.' : null; },
        done: () => { const d = active(), x = numbers(d.x), y = numbers(d.y), ey = numbers(d.ey); return x.length >= 80 && y.length >= 80 && ey.length >= 80 && Math.max(...y) > 1000 && Math.max(...x) < 50; },
        show: {text: 'Click the first X cell, then press <kbd>Ctrl</kbd> <kbd>V</kbd> (<kbd>⌘</kbd> <kbd>V</kbd> on a Mac)'},
        doIt: async () => {
          const rows = (await loadData()).text.trim().split('\n').slice(1).map(l => l.split(','));
          const put = (id, i) => { const el = $(id); el.value = rows.map(r => r[i]).join('\n'); fire(el); };
          put('col-x', 0); put('col-y', 1); put('col-ey', 2);
          syncActiveFromColumns(); const d = active(); d.uncertainty_modes = {...(d.uncertainty_modes || {}), ey: 'per-point'}; showActiveInColumns();
        },
      },
      {
        id: 'xunc', phase: 'Data',
        target: () => [...document.querySelectorAll('#setup-grid .unc-mode')].find(s => /^x/i.test(s.getAttribute('aria-label') || ''))?.closest('th'),
        say: 'Set <strong>X uncertainty</strong> to <strong>Constant</strong>, then type <code>0.01</code> in the box under it.',
        note: 'Every position was read to ±0.01, so the file leaves that column out.',
        right: {pic: ctl('X uncertainty', sel('Constant'), num('0.01')), cap: '<b>Constant 0.01:</b> every position carries its ±0.01 into the fit.'},
        wrong: {pic: ctl('X uncertainty', sel('None')), cap: '<b>None:</b> the fit treats every position as exact, which no measurement is.'},
        done: () => { const d = active(); const v = numbers($('col-ex')?.value); return v.length === 1 && Math.abs(v[0] - 0.01) < 1e-9 && (d.uncertainty_modes?.ex || 'constant') === 'constant'; },
        show: {text: 'Choose <b>Constant</b>, then type <b>0.01</b>'},
        doIt: () => { const el = $('col-ex'); el.value = '0.01'; fire(el); syncActiveFromColumns(); const d = active(); d.uncertainty_modes = {...(d.uncertainty_modes || {}), ex: 'constant'}; showActiveInColumns(); },
      },
      {
        id: 'preview', phase: 'Data', target: '#setup-preview',
        say: 'Look at the preview beside the table.',
        checks: ['The preview shows one bright central fringe, with smaller fringes on either side.'],
      },
      // ---------------- model
      {
        id: 'continue', phase: 'Model', target: '#modern-next',
        say: 'Press <strong>Continue to fit model</strong>.',
        done: onFitStep,
        show: {}, doIt: () => $('modern-next').click(),
      },
      {
        id: 'library', phase: 'Model', target: '#model-library-btn',
        say: 'Press <strong>Choose a model…</strong>.',
        note: 'The model library holds the fit functions for common experiments.',
        done: () => dialogOpen('.model-library-dialog') || modelChosen(),
        show: {}, doIt: () => $('model-library-btn').click(),
      },
      {
        id: 'category', phase: 'Model',
        target: () => [...document.querySelectorAll('.model-library-dialog[open] .ml-cat')].find(b => b.textContent === 'Waves & optics') || $('model-library-btn'),
        ui: () => { if (!dialogOpen('.model-library-dialog') && !modelChosen()) window.ModelLibrary?.open(); },
        say: 'Open the <strong>Waves &amp; optics</strong> tab.',
        done: () => !!libraryCard(LINEAR) || modelChosen(),
        show: {}, doIt: () => [...document.querySelectorAll('.model-library-dialog[open] .ml-cat')].find(b => b.textContent === 'Waves & optics')?.click(),
      },
      {
        id: 'model', phase: 'Model',
        target: () => libraryCard(LINEAR)?.querySelector('.ml-use') || $('model-library-btn'),
        frame: () => libraryCard(LINEAR),
        ui: () => { if (modelChosen()) return; if (!dialogOpen('.model-library-dialog')) window.ModelLibrary?.open(); if (!libraryCard(LINEAR)) [...document.querySelectorAll('.model-library-dialog[open] .ml-cat')].find(b => b.textContent === 'Waves & optics')?.click(); },
        say: `Press <strong>Use</strong> on <strong>${LINEAR}</strong>.`,
        note: 'It is the second of the two double-slit models.',
        right: {pic: modelPic(LINEAR, true), cap: '<b>Linear fringe visibility:</b> it has a visibility parameter, the quantity this experiment measures.'},
        wrong: {pic: modelPic('Double-slit (with single-slit envelope)'), cap: '<b>With single-slit envelope:</b> its fringes always dip to zero, so it cannot measure visibility.'},
        warn: () => !dialogOpen('.model-library-dialog') && /cos\(\[1\]/.test($('formula')?.value || '') ? 'That is the other double-slit model. Press <strong>Choose a model…</strong> again and use the one with linear fringe visibility.' : null,
        done: modelChosen,
        show: {}, doIt: () => { const use = libraryCard(LINEAR)?.querySelector('.ml-use'); if (use) use.click(); else { applyFunctionExample([MODEL.formula, MODEL.params, MODEL.guesses, MODEL.symbols].join('|')); document.querySelector('.model-library-dialog[open]')?.close(); } },
      },
      // ---------------- starting values
      {
        id: 'generic', phase: 'Starting values', target: '#guess-preview', frameBlock: 'center', look: true,
        say: 'Look at the starting-curve preview. The dashed curve is missing: the library\'s generic starting values put it far below the data.',
        note: 'A fit only improves a curve near where it starts, so first you move the curve onto the data.',
        done: () => true,
      },
      {
        id: 'choose', phase: 'Starting values',
        say: 'Choose how to estimate the eight starting values.',
        note: 'Either way they are rough estimates. The fit refines every one of them.',
        choices: [
          {id: 'adjust', goto: 'adjust-open', label: 'Read them off the plot', desc: 'Measure each feature on the preview and type the value in, one at a time.'},
          {id: 'ai', goto: 'ai-open', label: 'Ask an AI', desc: 'Give the data and the equation to a language model and enter the values it suggests.'},
        ],
      },
      // --- branch: read them off the plot
      {
        id: 'adjust-open', branch: 'adjust', phase: 'Starting values', target: '#visual-match-open',
        say: 'Press <strong>Adjust on the plot</strong>.',
        note: 'A box for each of the eight values opens beside the preview.',
        done: () => $('visual-match-open')?.getAttribute('aria-expanded') === 'true',
        show: {}, doIt: ensureAdjusting,
      },
      estimate(4, 'middle', {
        id: 'center',
        say: 'Find the middle of the whole pattern, marked on the plot, and type its position into <strong>envelope_center</strong>.',
        note: 'The curve will not appear yet: it is still only about one count tall.',
        hint: 'Click the <b>envelope_center</b> box and type the position, about <b>5.5</b>',
      }),
      estimate(0, 'peak', {
        id: 'count',
        say: 'Read the height of the tallest peak, then type about 1.3 times that height into <strong>count_scale</strong>.',
        note: 'count_scale is the height of the envelope, which stands a little above any single fringe.',
        hint: 'Type about 1.3 × 46 000, which is about <b>60000</b>',
        right: {pic: () => miniPlot(AT.count), cap: '<b>Right:</b> the curve now rises to about the height of the data. The fringes line up in the next two steps.'},
        wrong: {pic: () => miniPlot(P({4: 5.5, 0: 46})), cap: '<b>46 instead of 46 000:</b> the curve stays far below the plot.'},
      }),
      estimate(5, 'bright', {
        id: 'origin',
        say: 'Type the position of the brightest single fringe, marked on the plot, into <strong>fringe_origin</strong>.',
        note: 'This puts a bright fringe of the curve on the brightest fringe of the data.',
        hint: 'Type the position marked on the plot, about <b>5.7</b>',
        right: {pic: () => miniPlot(AT.origin), cap: '<b>Right:</b> the curve\'s central fringe sits on the brightest fringe of the data.'},
        wrong: {pic: () => miniPlot(P({4: 5.5, 0: 60000, 5: 5.5})), cap: '<b>The middle of the pattern instead:</b> the curve\'s bright fringe moves off the brightest one.'},
      }),
      estimate(3, 'spacing', {
        id: 'freq',
        say: 'Measure the spacing between two neighbouring bright fringes, marked on the plot, and type π divided by that spacing into <strong>fringe_frequency</strong>.',
        note: 'The fringes repeat every π ÷ fringe_frequency.',
        hint: 'Type π ÷ the spacing, about <b>4.1</b>',
        right: {pic: () => miniPlot(AT.freq), cap: '<b>Right:</b> every fringe of the curve lines up with a fringe of the data.'},
        wrong: {pic: () => miniPlot(P({4: 5.5, 0: 60000, 5: 5.75, 3: 0.76})), cap: '<b>The spacing itself:</b> the fringes come out about five times too wide.'},
      }),
      // --- branch: ask an AI
      {
        id: 'ai-open', branch: 'ai', phase: 'Starting values', target: '#ask-ai-starting-values',
        say: 'Press <strong>Ask AI for starting values</strong>.',
        note: 'The dialog assembles a prompt that holds the data, the equation and the parameter names.',
        done: ctx => { if (dialogOpen('#ai-starting-dialog')) ctx.flags.aiSeen = true; return !!ctx.flags.aiSeen; },
        enter: ctx => { ctx.flags.aiSeen = false; },
        show: {}, doIt: () => $('ask-ai-starting-values')?.click(),
      },
      {
        id: 'ai-ask', branch: 'ai', phase: 'Starting values',
        target: () => [...document.querySelectorAll('#ai-starting-dialog[open] button')].find(b => /copy/i.test(b.textContent)) || $('ask-ai-starting-values'),
        say: 'Copy the prompt, paste it into a language model of your choice, and ask it for the eight starting values.',
        note: 'This page sends nothing by itself. The values that come back are estimates, which you check on the plot.',
        checks: ['You have eight comma-separated values from the language model.'],
      },
      {
        id: 'ai-enter', branch: 'ai', phase: 'Starting values',
        target: () => dialogOpen('#ai-starting-dialog') ? ($('ai-starting-manual')?.hidden ? document.querySelector('#ai-starting-dialog .ai-starting-close') : $('ai-starting-manual')) : ($('initial-guesses')?.getClientRects().length ? $('initial-guesses') : document.querySelector('.parameter-paste > summary') || $('starting-values-manual')),
        say: 'Press <strong>Go to manual entry</strong>, then paste the eight values into <strong>Initial guesses</strong>.',
        note: 'If the dialog is already closed, open <strong>Edit values</strong> and then <strong>Paste comma-separated parameters</strong>.',
        done: guessesChanged,
        show: {}, doIt: () => setGuesses(GOOD),
      },
      // --- both routes
      {
        id: 'check', phase: 'Starting values', target: '#guess-preview', frameBlock: 'center',
        say: 'Check the starting curve against the data before you fit.',
        note: ctx => ctx.state.branch === 'ai' ? null : 'The four values you did not touch (background, envelope_scale, visibility and visibility_slope) already start close enough for the fit.',
        right: {pic: () => miniPlot(AT.freq), cap: '<b>Ready to fit:</b> the curve follows the data and its fringes line up.'},
        wrong: {pic: () => miniPlot(P({4: 5.5, 0: 60000, 5: 5.75})), cap: '<b>Out of step:</b> the fit cannot repair this. Go back and fix the value that is off.'},
        checks: ['The dashed curve lies over the data across the whole plot.', 'Its bright fringes line up with the bright fringes of the data.'],
        extra: '<button type="button" class="tut-link" data-goto="choose">Choose the method again</button>',
      },
      // ---------------- fit
      {
        id: 'fit', phase: 'Fit', target: '#btn-fit',
        say: 'Press <strong>Fit</strong>.',
        note: 'ROOT now moves all eight values until χ², the weighted distance between the curve and the points, is as small as it can be.',
        warn: () => {
          const r = result();
          if (r && r.converged === false) return 'The fit did not converge: from these starting values ROOT found no minimum. <button type="button" class="tut-link" data-goto="check">Go back to the starting values</button>.';
          if (/not completed/i.test($('fit-status')?.textContent || '')) return 'The fit could not run: ' + ($('message')?.textContent.trim() || 'the fitting server did not answer.') + ' Press <strong>Fit</strong> again in a moment.';
          return null;
        },
        done: () => { const r = result(); return !!r && r.converged !== false; },
        show: {}, doIt: () => $('btn-fit').click(),
      },
      // ---------------- result
      {
        id: 'visibility', phase: 'Result',
        target: () => [...document.querySelectorAll('#report .report-table tbody tr')].find(tr => tr.cells[0]?.textContent.trim() === 'visibility'),
        say: 'Find <strong>visibility</strong> in the fit report. Its value ± uncertainty is the fringe visibility that this experiment measures.',
        note: 'The uncertainty comes from how fast χ² rises as the visibility moves away from its best value.',
        checks: ['You are reading the row named visibility, not visibility_slope.'],
      },
      {
        id: 'chi2', phase: 'Result', look: true,
        target: () => [...document.querySelectorAll('#report .summary .stat')].find(s => /NDF/.test(s.querySelector('.k')?.textContent || '') && /χ/.test(s.textContent)),
        say: 'Read <strong>χ²/NDF</strong> under the table. It tells you whether the curve and the error bars agree.',
        right: {pic: () => miniPlot(GOOD), cap: '<b>Near 1:</b> the points scatter about the curve by about the size of their error bars.'},
        wrong: {pic: () => miniPlot([44000, 4100, 1.08, 3.95, 5.51, 5.73, .35, 0]), cap: '<b>Far above 1:</b> the curve misses the points by many error bars. The model or the uncertainties are wrong.'},
        extra: () => {
          const r = result(), c = r?.chi2_ndf, p = r?.prob; if (c == null) return '';
          const verdict = (p != null && p < 0.01) || c > 3 ? 'That is high: the data depart from the model by more than their error bars.'
            : p != null && p < 0.05 ? 'That is a little high: the points scatter somewhat more than their error bars say. The fit is usable, and the excess is worth noting.'
            : (p != null && p > 0.99) || c < 0.3 ? 'That is low: the error bars may be larger than the real scatter.'
            : 'The model and the stated uncertainties agree with the data.';
          return `<p>Yours is <strong>${fmt(c)}</strong>${p != null ? ` (p = ${fmt(p)})` : ''}. ${verdict}</p>`;
        },
        done: () => true,
      },
      {
        id: 'save', phase: 'Result', target: () => [...document.querySelectorAll('.fit-bar-save, #btn-save')].find(b => b.getClientRects().length),
        say: 'Press <strong>Save</strong> to keep the analysis as a file.',
        note: 'The file holds the data, the model, the starting values and the result. Open it again with <strong>Open…</strong>.',
        done: ctx => !!ctx.flags.saved,
        show: {},
      },
      {
        id: 'done', phase: 'Result', final: true, target: '#plot', frameBlock: 'start',
        say: 'Well done. You have fitted measured double-slit data and read off its fringe visibility.',
        note: 'Every fit follows the same order: data, model, starting values, fit, result.',
        extra: `<p><a class="tut-next-lesson" href="tutorials.html">More tutorials →</a></p>
          <p><button type="button" class="tut-link" data-goto="choose">Try the other way to set starting values</button> · <button type="button" class="tut-link" data-restart>Start over</button></p>`,
      },
    ],
  };
})();
