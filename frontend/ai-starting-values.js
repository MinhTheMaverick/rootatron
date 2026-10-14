/* Build a self-contained AI request locally; sharing remains a user action. */
(function (scope) {
  'use strict';
  const csvCell = value => /[",\r\n]/.test(String(value)) ? '"' + String(value).replace(/"/g, '""') + '"' : String(value);
  const csv = rows => rows.map(row => row.map(csvCell).join(',')).join('\n');
  const uncertainty = (values, i) => values?.length === 1 ? values[0] : (values?.[i] ?? '');

  function buildPrompt(p, parameters, context = {}) {
    if (!parameters.length) throw new Error('Choose a model with adjustable parameters first.');
    const type = p.analysis_type || 'xy';
    const lines = [
      'Suggest starting parameter values for this model in ROOT-A-TRON 3000 (CERN ROOT).',
      'I need initial guesses for a subsequent fit, not claimed fit results or invented parameter uncertainties.',
      'Use the supplied measurements, equation, units and fit range. Keep the model unchanged.',
      'Explain briefly how you estimated the values. Flag poorly constrained or ambiguous parameters, invalid domains, and any assumptions about units.',
      'Return one finite numeric value per parameter in the exact order below. Scientific notation is accepted. Do not omit parameter slots or change the order.',
      'End with a single line containing only the comma-separated starting values, with no labels or units on that line.',
      '',
      'ANALYSIS',
      `Type: ${type}`,
      `Dataset: ${p.dataset_name || 'Untitled'}`,
      `Plot title: ${p.title || '(not specified)'}`,
      '',
      'MODEL (ROOT expression)',
    ];
    if (type === 'multivariate') {
      p.models.forEach((model, i) => lines.push(`Output ${i} (${p.output_names[i]}): ${model}`));
      lines.push('Inputs use x0, x1, ... in the order listed below. Parameter indices are shared across all output models.');
    } else {
      lines.push(p.formula);
      lines.push(`X-axis label / supplied units: ${p.x_title || '(not specified)'}`);
      lines.push(`Y-axis label / supplied units: ${p.y_title || '(not specified)'}`);
    }
    lines.push('', 'PARAMETER ORDER');
    parameters.forEach((parameter, i) => {
      const name = parameter.name || `p${i}`;
      const guess = p.initial_guesses?.[i];
      lines.push(`[${i}]: ${name}${parameter.symbol && parameter.symbol !== name ? ` (equation symbol: ${parameter.symbol})` : ''}; current guess: ${guess == null || guess === '' ? '(blank)' : guess}`);
    });
    lines.push('Current guesses are editable starting points and may be wrong.');
    lines.push('For ROOT built-ins, respect their parameter conventions and offsets: gaus = height, mean, sigma; gausn = area, mean, sigma; expo = exp(p0 + p1*x); polN = coefficients in ascending powers of x.');
    if (context.notes?.trim()) lines.push('', 'USER NOTES (context, not model changes)', context.notes.trim());
    lines.push('', 'MEASUREMENTS');
    if (type === 'multivariate') {
      const headers = [], columns = [];
      p.inputs.forEach((values, i) => {
        headers.push(`x${i}: ${p.input_names[i]}`, `uncertainty_x${i}`);
        columns.push(values, values.map((_, j) => uncertainty(p.input_errors[i], j)));
      });
      p.outputs.forEach((values, i) => {
        headers.push(`output${i}: ${p.output_names[i]}`, `uncertainty_output${i}`);
        columns.push(values, values.map((_, j) => uncertainty(p.output_errors[i], j)));
      });
      lines.push('All supplied rows are included. Blank uncertainty cells mean none was supplied; zero means the supplied uncertainty was zero.');
      lines.push('```csv', csv([headers, ...p.inputs[0].map((_, i) => columns.map(column => column[i]))]), '```');
    } else if (type === 'histogram') {
      const h = p.histogram;
      lines.push('The model is a count density (counts per unit X). Integrating it over a bin predicts that bin’s count; do not fit bin counts as density heights without accounting for bin widths.');
      lines.push(`Fit method: ${h.method === 'chi2' ? 'chi-squared with sqrt(count) uncertainties; empty bins excluded' : 'binned Poisson likelihood; empty bins included'}.`);
      lines.push(`Fit range (select bins by their centers): ${JSON.stringify(p.x_range || 'full histogram')}`);
      if (h.source === 'counts') {
        lines.push('```csv', csv([['bin_low', 'bin_high', 'count'], ...h.counts.map((v, i) => [h.edges[i], h.edges[i + 1], v])]), '```');
      } else {
        lines.push(`Binning: ${JSON.stringify({edges:h.edges?.length ? h.edges : undefined, bins:h.bins, range:h.range})}. Unspecified settings use the tool’s automatic binning; state any binning assumptions in your estimate.`);
        lines.push('Raw samples (not bin counts):', '```csv', csv([['sample'], ...h.samples.map(v => [v])]), '```');
      }
    } else {
      const range = p.x_range;
      const rows = p.x.map((x, i) => [x, p.y[i], uncertainty(p.ex, i), uncertainty(p.ey, i)])
        .filter(row => !range || ((range[0] == null || row[0] >= range[0]) && (range[1] == null || row[0] <= range[1])));
      lines.push(`Fit range: ${range ? JSON.stringify(range) : 'full data range'}.`);
      lines.push('Only included measurements within the fit range are listed. Manually excluded points are omitted. Blank uncertainty cells mean none was supplied; zero means the supplied uncertainty was zero.');
      lines.push('```csv', csv([['x', 'y', 'uncertainty_x', 'uncertainty_y'], ...rows]), '```');
    }
    return lines.join('\n') + '\n';
  }
  if (typeof module === 'object' && module.exports) module.exports = {buildPrompt, csv};
  if (typeof document === 'undefined') return;
  const $ = id => document.getElementById(id);
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.id = 'ask-ai-starting-values';
  trigger.textContent = 'Ask AI for starting values';
  trigger.setAttribute('aria-haspopup', 'dialog');
  let dialog;
  function refresh() {
    const type = $('analysis-type').value;
    const mount = type === 'multivariate' ? $('multivariate-model') : document.querySelector('.starting-values-actions');
    if (mount && trigger.parentElement !== mount) mount.append(trigger);
    trigger.disabled = !['xy', 'histogram', 'multivariate'].includes(type);
  }
  function createDialog() {
    dialog = document.createElement('dialog');
    dialog.id = 'ai-starting-dialog'; dialog.className = 'ai-starting-dialog';
    dialog.setAttribute('aria-labelledby', 'ai-starting-title');
    dialog.innerHTML = `
      <button type="button" class="ai-starting-close" aria-label="Close AI starting values">×</button>
      <h2 id="ai-starting-title">Ask AI for starting values</h2>
      <p>Stuck? Time to ask uncle ChatGPT or aunty Claude.</p>
      <ol class="ai-starting-steps">
        <li><strong>Copy the prompt</strong> below, or download the .txt file. It includes your model, parameter order, data and uncertainties.</li>
        <li><strong>Paste the copied text into ChatGPT, Claude or another AI chat</strong>, or attach the .txt file and send it. The instructions are already included—there’s nothing else to write.</li>
        <li><strong>Copy the final comma-separated values</strong> into Manual entry here. Review the values and the starting curve where available, adjust if needed, then run Fit.</li>
      </ol>
      <p class="ai-starting-hint">Suggestions can be wrong—review them before fitting. Nothing is sent to an AI service by this tool.</p>
      <p id="ai-starting-error" role="alert" hidden></p>
      <details id="ai-starting-preview"><summary>Review the prompt and data</summary>
        <textarea id="ai-starting-prompt" aria-label="Prompt and data for AI" readonly spellcheck="false"></textarea>
      </details>
      <div class="ai-starting-actions">
        <button type="button" class="primary" id="ai-starting-copy">Copy prompt</button>
        <button type="button" id="ai-starting-download">Download .txt</button>
        <button type="button" id="ai-starting-manual">Manual entry</button>
      </div>
      <p id="ai-starting-status" role="status" aria-live="polite"></p>`;
    document.body.append(dialog);
    dialog.querySelector('.ai-starting-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      const r = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) dialog.close();
    });
    $('ai-starting-copy').addEventListener('click', async () => {
      const text = $('ai-starting-prompt').value;
      try { await navigator.clipboard.writeText(text); $('ai-starting-status').textContent = 'Copied. Paste it into your AI chat.'; }
      catch (_) {
        $('ai-starting-preview').open = true;
        $('ai-starting-prompt').focus(); $('ai-starting-prompt').select();
        $('ai-starting-status').textContent = 'Copy the selected text, or use Download .txt.';
      }
    });
    $('ai-starting-download').addEventListener('click', () => {
      downloadText($('ai-starting-prompt').value, 'starting-values-prompt.txt', 'text/plain;charset=utf-8');
      $('ai-starting-status').textContent = 'Download requested. Attach the .txt file to your AI chat.';
    });
    $('ai-starting-manual').addEventListener('click', () => {
      dialog.close();
      if ($('analysis-type').value === 'multivariate') { $('mv-par-guesses').focus(); return; }
      $('starting-values-manual').click();
      const paste = document.querySelector('.parameter-paste');
      if (paste) paste.open = true;
      $('initial-guesses').focus();
    });
  }
  trigger.addEventListener('click', () => {
    if (!dialog) createDialog();
    $('ai-starting-prompt').value = '';
    $('ai-starting-status').textContent = '';
    $('ai-starting-error').hidden = true;
    $('ai-starting-preview').open = false;
    let ready = false;
    try {
      const multivariate = $('analysis-type').value === 'multivariate';
      if (!multivariate) {
        $('fit-equation')?.dispatchEvent(new Event('change', {bubbles:true}));
        scope.RootEquationEditor?.validate();
      }
      if (hasPendingTableEdits()) throw new Error('Apply or cancel the pending data-table edits first.');
      if (scope.WorkspaceStore && scope.WorkspaceStore.read(localStorage).revision !== (workspaceDocument?.revision || null)) throw new Error('Another tab updated this workspace. Save local edits, then reload before exporting a prompt.');
      const dataset = datasets[activeIdx];
      if (dataset.calculationError) throw new Error(dataset.calculationError);
      const payload = multivariate ? scope.Multivariate.buildPayload(dataset, {search:true}) : buildPayload(readForm());
      if (!multivariate && !payload.formula) throw new Error('Choose or enter a model first.');
      const equation = !multivariate && scope.RootEquationEditor?.snapshot();
      const count = multivariate ? countParams(payload.models.join(' + ')) : (scope.RootEquationEditor?.parameterCount() ?? countParams(payload.formula));
      const parameters = Array.from({length:count}, (_, i) => ({name:payload.param_names[i], symbol:equation?.mode === 'equation' ? equation.parameters[i] : undefined}));
      $('ai-starting-prompt').value = buildPrompt(payload, parameters, {notes:$('doc-notes')?.value});
      ready = true;
    } catch (error) {
      $('ai-starting-error').textContent = error.message;
      $('ai-starting-error').hidden = false;
    }
    $('ai-starting-copy').disabled = !ready;
    $('ai-starting-download').disabled = !ready;
    $('ai-starting-preview').hidden = !ready;
    dialog.showModal();
  });
  document.addEventListener('change', refresh);
  document.addEventListener('rootfit:reset', refresh);
  document.addEventListener('click', refresh);
  refresh();
})(globalThis);
