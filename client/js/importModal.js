/* ===========================================================
   ImportModal — Universal Employee Data Bulk Importer
   -----------------------------------------------------------
   Usage:
     ImportModal.open('registrations', onSuccessCallback)
     ImportModal.open('patients', onSuccessCallback)
   =========================================================== */

const ImportModal = (() => {
  let onSuccess = null;
  let currentDatasetKey = null;
  let parsedRows = [];
  let remainingRowsCache = null;  // for "resume import" after partial stop

  /* ── Dataset definitions ─────────────────────────────────── */
  const DATASET_CONFIGS = {
    registrations: {
      label: 'Pre-Employment Registrations',
      endpoint: (opts) => Api.registrations.import,
      requiredFields: ['full_name', 'department', 'position', 'occupation'],
      allFields: ['full_name', 'department', 'position', 'occupation', 'date_of_birth', 'gender', 'location'],
      templateHeaders: 'full_name,department,position,occupation,date_of_birth,gender,location',
      templateRow: 'Abebe Bekele,Medical,Nurse,Nurse,1990-04-12,male,Addis Ababa',
      note: 'Required: full_name, department, position, occupation',
    },
    patients: {
      label: 'Walk-in Patients',
      endpoint: (opts) => Api.patients.import,
      requiredFields: ['full_name'],
      allFields: ['full_name', 'department', 'position', 'date_of_birth', 'gender', 'location', 'address', 'phone'],
      templateHeaders: 'full_name,date_of_birth,gender,department,position,location,address,phone',
      templateRow: 'Marta Lemma,1988-11-02,female,Finance,Accountant,Addis Ababa,Bole Woreda 03,0911223344',
      note: 'Required: full_name. All other fields are optional.',
    },
  };

  const VALID_DEPARTMENTS = [
    'Medical', 'Finance', 'Human Resource Management',
    'Planning and Budget Service', 'Product Quality Control Service',
    'Production and Technic', 'Property Management',
  ];

  /* ── CSV parser ──────────────────────────────────────────── */
  function parseCsv(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return { headers: [], rows: [] };
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      // Simple CSV split (handles quoted fields with commas inside)
      const vals = splitCsvLine(line);
      const row = {};
      headers.forEach((h, idx) => { row[h] = (vals[idx] || '').trim(); });
      rows.push(row);
    }
    return { headers, rows };
  }

  function splitCsvLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && (i === 0 || line[i - 1] !== '\\')) {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    result.push(cur);
    return result;
  }

  /* ── Client-side validation ──────────────────────────────── */
  function validateRows(rows, config) {
    const errors = [];
    rows.forEach((row, i) => {
      const rowErrors = [];
      for (const field of config.requiredFields) {
        if (!row[field] || !row[field].toString().trim()) {
          rowErrors.push(`"${field}" is required`);
        }
      }
      if (row.department && !VALID_DEPARTMENTS.includes(row.department.trim())) {
        rowErrors.push(`Invalid department "${row.department}"`);
      }
      if (row.date_of_birth && row.date_of_birth.trim() && isNaN(Date.parse(row.date_of_birth))) {
        rowErrors.push(`Invalid date_of_birth "${row.date_of_birth}" — use YYYY-MM-DD`);
      }
      if (row.gender && row.gender.trim() && !['male', 'female'].includes(row.gender.trim().toLowerCase())) {
        rowErrors.push(`Invalid gender "${row.gender}" — use male or female`);
      }
      if (rowErrors.length) errors.push({ rowIndex: i + 1, row, errors: rowErrors });
    });
    return errors;
  }

  /* ── Modal markup injection ──────────────────────────────── */
  function ensureModalMarkup() {
    if (document.getElementById('import-modal-backdrop')) return;
    const config = DATASET_CONFIGS[currentDatasetKey];

    const html = `
      <div class="modal-backdrop" id="import-modal-backdrop" style="z-index:2100;">
        <div class="modal modal-wide" style="max-width:820px; width:95%;">
          <div class="modal-header">
            <div>
              <h2 style="display:flex;align-items:center;gap:8px;">
                <span style="display:inline-flex;width:22px;height:22px;flex-shrink:0;" id="imp-header-icon"></span>
                Import <span id="imp-dataset-label"></span>
              </h2>
              <p id="imp-subtitle">Upload a CSV file or paste data to bulk-import records.</p>
            </div>
            <button class="icon-btn" id="import-modal-close" aria-label="Close">${Icons.render('close')}</button>
          </div>

          <div class="modal-body" style="display:flex;flex-direction:column;gap:20px;">

            <!-- Step 1: Upload / Paste -->
            <div class="imp-section" id="imp-step-upload">
              <div class="imp-section-title">1. Upload or Paste Data</div>

              <div id="imp-drop-zone" class="imp-drop-zone" tabindex="0" role="button" aria-label="Upload CSV file">
                <div class="imp-drop-icon" id="imp-drop-icon-slot"></div>
                <div>
                  <div class="imp-drop-label">Drag &amp; drop a <strong>.csv</strong> or <strong>.json</strong> file here</div>
                  <div class="imp-drop-sub">or click to browse</div>
                </div>
                <input type="file" id="imp-file-input" accept=".csv,.json" style="display:none;" />
              </div>

              <div style="display:flex;align-items:center;gap:12px;margin-top:8px;">
                <div style="flex:1;height:1px;background:var(--color-border,#D8DFDE);"></div>
                <span style="font-size:12px;color:var(--color-text-muted);">or paste CSV text</span>
                <div style="flex:1;height:1px;background:var(--color-border,#D8DFDE);"></div>
              </div>

              <textarea id="imp-paste-area" rows="5" placeholder="Paste CSV data here (first row must be headers)…"
                style="width:100%;font-size:13px;font-family:monospace;resize:vertical;margin-top:8px;
                       border:1.5px solid var(--color-border,#D8DFDE);border-radius:8px;padding:10px;
                       background:var(--color-bg-secondary,#F4F6F6);color:var(--color-text);"></textarea>

              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
                <button type="button" class="btn btn-ghost" id="imp-download-template">
                  <span id="imp-dl-icon"></span> Download CSV Template
                </button>
                <button type="button" class="btn btn-primary" id="imp-parse-btn">Preview Data →</button>
              </div>

              <div id="imp-parse-error" class="imp-banner imp-banner-error" style="display:none;"></div>
            </div>

            <!-- Step 2: Preview & Validation -->
            <div class="imp-section" id="imp-step-preview" style="display:none;">
              <div class="imp-section-title" style="display:flex;justify-content:space-between;align-items:center;">
                <span>2. Preview &amp; Validate</span>
                <button type="button" class="btn btn-ghost" id="imp-back-btn" style="font-size:12px;">← Back</button>
              </div>
              <div id="imp-validation-banner" style="display:none;"></div>
              <div id="imp-preview-table-wrap" class="imp-table-wrap"></div>
              <div style="margin-top:12px;font-size:12px;color:var(--color-text-muted);">
                <span id="imp-row-count-label"></span>
              </div>
            </div>

            <!-- Step 3: Import Options -->
            <div class="imp-section" id="imp-step-options" style="display:none;">
              <div class="imp-section-title">3. Import Options</div>
              <div style="display:flex;flex-direction:column;gap:10px;">
                <label class="imp-radio-label" id="imp-mode-partial-label">
                  <input type="radio" name="imp-mode" value="partial" id="imp-mode-partial" checked />
                  <div>
                    <div class="imp-radio-title">Stop on error — keep valid rows <span class="badge badge-info" style="font-size:11px;margin-left:4px;">Recommended</span></div>
                    <div class="imp-radio-desc">Rows before the first error are saved. You'll be told exactly which row failed and can fix your file and resume.</div>
                  </div>
                </label>
                <label class="imp-radio-label" id="imp-mode-atomic-label">
                  <input type="radio" name="imp-mode" value="atomic" id="imp-mode-atomic" />
                  <div>
                    <div class="imp-radio-title">Atomic — all or nothing</div>
                    <div class="imp-radio-desc">If any row fails, all rows are rolled back. Nothing is saved until every row is valid.</div>
                  </div>
                </label>
              </div>
            </div>

          </div><!-- /modal-body -->

          <div class="modal-footer" id="import-modal-footer">
            <span class="footer-note" id="imp-footer-note"></span>
            <button type="button" class="btn btn-secondary" id="imp-cancel-btn">Cancel</button>
            <button type="button" class="btn btn-primary" id="imp-submit-btn" disabled>
              <span id="imp-submit-icon" style="display:inline-flex;width:16px;height:16px;"></span>
              Import Records
            </button>
          </div>

        </div>
      </div>

      <!-- Result modal -->
      <div class="modal-backdrop" id="imp-result-backdrop" style="z-index:2200;">
        <div class="modal" style="max-width:560px;">
          <div class="modal-header">
            <div>
              <h2 id="imp-result-title">Import Complete</h2>
              <p id="imp-result-sub"></p>
            </div>
            <button class="icon-btn" id="imp-result-close">${Icons.render('close')}</button>
          </div>
          <div class="modal-body" id="imp-result-body"></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="imp-result-resume-btn" style="display:none;">Resume Import</button>
            <button type="button" class="btn btn-secondary" id="imp-result-download-remaining" style="display:none;">Download Remaining Rows</button>
            <button type="button" class="btn btn-primary" id="imp-result-done-btn">Done</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    bindModalEvents();
  }

  /* ── Bind events ─────────────────────────────────────────── */
  function bindModalEvents() {
    const config = DATASET_CONFIGS[currentDatasetKey];

    // header icon & label
    document.getElementById('imp-header-icon').innerHTML = Icons.render('fileImport');
    document.getElementById('imp-dataset-label').textContent = config.label;
    document.getElementById('imp-dl-icon').innerHTML = Icons.render('download');
    document.getElementById('imp-submit-icon').innerHTML = Icons.render('upload');
    document.getElementById('imp-footer-note').textContent = config.note;
    document.getElementById('imp-drop-icon-slot').innerHTML = Icons.render('upload');

    // Close buttons
    document.getElementById('import-modal-close').addEventListener('click', closeModal);
    document.getElementById('imp-cancel-btn').addEventListener('click', closeModal);
    document.getElementById('imp-result-close').addEventListener('click', closeResultModal);
    document.getElementById('imp-result-done-btn').addEventListener('click', closeResultModal);

    // Back button
    document.getElementById('imp-back-btn').addEventListener('click', () => {
      parsedRows = [];
      showStep('upload');
      document.getElementById('imp-submit-btn').disabled = true;
    });

    // File drop zone
    const dropZone = document.getElementById('imp-drop-zone');
    const fileInput = document.getElementById('imp-file-input');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('imp-drop-zone--active'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('imp-drop-zone--active'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('imp-drop-zone--active');
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) handleFile(fileInput.files[0]);
    });

    // Template download
    document.getElementById('imp-download-template').addEventListener('click', downloadTemplate);

    // Parse button
    document.getElementById('imp-parse-btn').addEventListener('click', () => {
      const pasteText = document.getElementById('imp-paste-area').value.trim();
      if (pasteText) {
        processText(pasteText, 'csv');
      } else {
        showParseError('Please upload a file or paste CSV data first.');
      }
    });

    // Submit
    document.getElementById('imp-submit-btn').addEventListener('click', runImport);

    // Result modal
    document.getElementById('imp-result-resume-btn').addEventListener('click', resumeImport);
    document.getElementById('imp-result-download-remaining').addEventListener('click', downloadRemainingRows);
  }

  /* ── File handling ───────────────────────────────────────── */
  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      if (file.name.endsWith('.json')) {
        processText(text, 'json');
      } else {
        processText(text, 'csv');
      }
    };
    reader.readAsText(file);
  }

  function processText(text, format) {
    hideParseError();
    let rows = [];

    try {
      if (format === 'json') {
        const parsed = JSON.parse(text);
        rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.records) ? parsed.records : []);
        if (!rows.length) throw new Error('JSON must be an array of objects.');
      } else {
        const result = parseCsv(text);
        if (!result.headers.length) throw new Error('Could not parse CSV. Make sure the first row contains column headers.');
        rows = result.rows;
      }
    } catch (e) {
      showParseError(`Parse error: ${e.message}`);
      return;
    }

    if (!rows.length) {
      showParseError('No data rows found in the file.');
      return;
    }

    parsedRows = rows;
    renderPreview(rows);
    showStep('preview');
    showStep('options');
    document.getElementById('imp-submit-btn').disabled = false;
  }

  /* ── Preview table renderer ──────────────────────────────── */
  function renderPreview(rows) {
    const config = DATASET_CONFIGS[currentDatasetKey];
    const validationErrors = validateRows(rows, config);
    const errorRowSet = new Set(validationErrors.map(e => e.rowIndex));

    const allKeys = Object.keys(rows[0]);

    let tableHtml = `<table class="data-table" style="font-size:12px;">
      <thead><tr><th>#</th>${allKeys.map(k => `<th>${UI.escapeHtml(k)}</th>`).join('')}<th>Status</th></tr></thead>
      <tbody>`;

    rows.forEach((row, i) => {
      const rowNum = i + 1;
      const hasError = errorRowSet.has(rowNum);
      const errorEntry = validationErrors.find(e => e.rowIndex === rowNum);
      const rowClass = hasError ? 'imp-row-error' : 'imp-row-ok';
      const statusBadge = hasError
        ? `<span class="badge badge-danger" title="${UI.escapeHtml(errorEntry.errors.join('; '))}">⚠ Error</span>`
        : `<span class="badge badge-success">✓ OK</span>`;
      tableHtml += `<tr class="${rowClass}">
        <td style="font-weight:600;">${rowNum}</td>
        ${allKeys.map(k => `<td>${UI.escapeHtml((row[k] || '').toString())}</td>`).join('')}
        <td>${statusBadge}</td>
      </tr>`;
    });

    tableHtml += `</tbody></table>`;

    document.getElementById('imp-preview-table-wrap').innerHTML = tableHtml;
    document.getElementById('imp-row-count-label').textContent =
      `${rows.length} row${rows.length !== 1 ? 's' : ''} detected · ${validationErrors.length} client-side issue${validationErrors.length !== 1 ? 's' : ''} detected`;

    // Validation banner
    const bannerEl = document.getElementById('imp-validation-banner');
    if (validationErrors.length) {
      bannerEl.className = 'imp-banner imp-banner-warning';
      bannerEl.innerHTML = `
        <strong>${Icons.render('alert')} ${validationErrors.length} row${validationErrors.length !== 1 ? 's have' : ' has'} issues:</strong>
        <ul style="margin:6px 0 0 16px;padding:0;">
          ${validationErrors.slice(0, 8).map(e =>
            `<li>Row ${e.rowIndex}: ${UI.escapeHtml(e.errors.join('; '))}</li>`
          ).join('')}
          ${validationErrors.length > 8 ? `<li>…and ${validationErrors.length - 8} more</li>` : ''}
        </ul>
        <div style="margin-top:6px;font-size:12px;">In "stop on error" mode, rows before the first error will still be saved.</div>`;
      bannerEl.style.display = 'block';
    } else {
      bannerEl.innerHTML = `<span style="color:var(--color-success);">${Icons.render('check')} All ${rows.length} rows look valid — ready to import.</span>`;
      bannerEl.className = 'imp-banner imp-banner-success';
      bannerEl.style.display = 'block';
    }
  }

  /* ── Run the actual import ───────────────────────────────── */
  async function runImport() {
    if (!parsedRows.length) return;
    const atomicMode = document.getElementById('imp-mode-atomic').checked;
    const submitBtn = document.getElementById('imp-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Importing…';

    const apiCall = currentDatasetKey === 'registrations'
      ? Api.registrations.import
      : Api.patients.import;

    try {
      const result = await apiCall(parsedRows, { atomic: atomicMode });
      showResultModal(result);
    } catch (e) {
      // The backend responded with a non-2xx: parse partial/error result from the error body
      let result = null;
      try {
        // The Api layer might have thrown with the parsed JSON attached
        if (e && e.data) result = e.data;
      } catch (_) {}

      if (result) {
        showResultModal(result);
      } else {
        UI.toast(UI.errorMessage(e), 'danger');
        submitBtn.disabled = false;
        submitBtn.innerHTML = `${Icons.render('upload')} Import Records`;
      }
    }
  }

  /* ── Result modal ────────────────────────────────────────── */
  function showResultModal(result) {
    closeModal(true); // close import modal but don't reset state
    const backdrop = document.getElementById('imp-result-backdrop');
    backdrop.classList.add('visible');

    const titleEl = document.getElementById('imp-result-title');
    const subEl = document.getElementById('imp-result-sub');
    const bodyEl = document.getElementById('imp-result-body');
    const resumeBtn = document.getElementById('imp-result-resume-btn');
    const dlRemainingBtn = document.getElementById('imp-result-download-remaining');

    if (result.success) {
      titleEl.textContent = '✓ Import Successful';
      titleEl.style.color = 'var(--color-success, #22c55e)';
      subEl.textContent = `All ${result.successCount} record${result.successCount !== 1 ? 's' : ''} imported successfully.`;
      bodyEl.innerHTML = `
        <div class="imp-banner imp-banner-success">
          <strong>Import complete!</strong> ${result.successCount} record${result.successCount !== 1 ? 's' : ''} have been saved.
        </div>`;
      resumeBtn.style.display = 'none';
      dlRemainingBtn.style.display = 'none';
      // Trigger page refresh callback
      if (typeof onSuccess === 'function') onSuccess();
    } else {
      titleEl.textContent = '⚠ Import Stopped';
      titleEl.style.color = 'var(--color-warning, #f59e0b)';
      subEl.textContent = result.mode === 'atomic'
        ? 'Nothing was saved (atomic mode — all rows rolled back).'
        : `${result.successCount} row${result.successCount !== 1 ? 's' : ''} saved before the error.`;

      const modeNote = result.mode === 'atomic'
        ? `<p style="margin:0;font-size:13px;"><strong>Mode:</strong> Atomic (all-or-nothing). No records were saved. Fix all rows and try again.</p>`
        : `<p style="margin:0;font-size:13px;"><strong>Mode:</strong> Stop on error. ${result.successCount} record${result.successCount !== 1 ? 's were' : ' was'} saved to the database. Fix the data from row ${result.failedRowIndex} onward and re-import the remaining ${result.remainingRows ? result.remainingRows.length : '?'} rows.</p>`;

      bodyEl.innerHTML = `
        <div class="imp-banner imp-banner-error">
          <strong>Error on row ${result.failedRowIndex}:</strong> ${UI.escapeHtml(result.error)}
          <div style="margin-top:8px;font-size:12px;background:var(--color-bg,#fff);border-radius:6px;padding:8px;overflow:auto;">
            <code>${UI.escapeHtml(JSON.stringify(result.failedRow, null, 2))}</code>
          </div>
        </div>
        <div style="margin-top:12px;">${modeNote}</div>
        ${result.successCount > 0 ? `<div style="margin-top:8px;" class="imp-banner imp-banner-success"><strong>${result.successCount} record${result.successCount !== 1 ? 's' : ''} already saved</strong> — they are in the database now.</div>` : ''}`;

      remainingRowsCache = result.remainingRows || [];

      if (result.mode === 'partial' && remainingRowsCache.length) {
        resumeBtn.style.display = '';
        dlRemainingBtn.style.display = '';
      } else {
        resumeBtn.style.display = 'none';
        dlRemainingBtn.style.display = 'none';
      }

      // Partial success still calls callback to refresh the list
      if (result.successCount > 0 && typeof onSuccess === 'function') onSuccess();
    }
  }

  /* ── Resume import with remaining rows ───────────────────── */
  function resumeImport() {
    if (!remainingRowsCache || !remainingRowsCache.length) return;
    closeResultModal();
    parsedRows = remainingRowsCache;
    remainingRowsCache = null;
    open(currentDatasetKey, onSuccess);
    // After modal opens, skip to preview
    setTimeout(() => {
      renderPreview(parsedRows);
      showStep('preview');
      showStep('options');
      document.getElementById('imp-submit-btn').disabled = false;
    }, 50);
  }

  /* ── Download remaining rows as CSV ─────────────────────── */
  function downloadRemainingRows() {
    if (!remainingRowsCache || !remainingRowsCache.length) return;
    const keys = Object.keys(remainingRowsCache[0]);
    const csv = [keys.join(','), ...remainingRowsCache.map(r => keys.map(k => `"${(r[k] || '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `remaining_rows_${currentDatasetKey}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Template CSV download ───────────────────────────────── */
  function downloadTemplate() {
    const config = DATASET_CONFIGS[currentDatasetKey];
    const csv = config.templateHeaders + '\n' + config.templateRow;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template_${currentDatasetKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Step visibility ─────────────────────────────────────── */
  function showStep(step) {
    const steps = ['upload', 'preview', 'options'];
    steps.forEach(s => {
      const el = document.getElementById(`imp-step-${s}`);
      if (el) el.style.display = (s === step || (step !== 'upload' && s !== 'upload' && step !== 'preview' && s !== 'preview') ? '' : 'none');
    });
    // For preview and options: show both when step = preview
    if (step === 'preview') {
      document.getElementById('imp-step-upload').style.display = 'none';
      document.getElementById('imp-step-preview').style.display = '';
      document.getElementById('imp-step-options').style.display = '';
    }
    if (step === 'upload') {
      document.getElementById('imp-step-upload').style.display = '';
      document.getElementById('imp-step-preview').style.display = 'none';
      document.getElementById('imp-step-options').style.display = 'none';
    }
  }

  function showParseError(msg) {
    const el = document.getElementById('imp-parse-error');
    el.innerHTML = `${Icons.render('alert')} ${UI.escapeHtml(msg)}`;
    el.style.display = 'flex';
  }

  function hideParseError() {
    const el = document.getElementById('imp-parse-error');
    if (el) el.style.display = 'none';
  }

  /* ── Open / Close ────────────────────────────────────────── */
  function open(datasetKey, successCallback) {
    currentDatasetKey = datasetKey;
    onSuccess = successCallback || null;
    parsedRows = [];

    // Remove old markup so it re-renders fresh
    const old = document.getElementById('import-modal-backdrop');
    if (old) old.remove();

    ensureModalMarkup();

    const backdrop = document.getElementById('import-modal-backdrop');
    backdrop.classList.add('visible');
    showStep('upload');
  }

  function closeModal(preserve = false) {
    const backdrop = document.getElementById('import-modal-backdrop');
    if (backdrop) backdrop.classList.remove('visible');
    if (!preserve) {
      parsedRows = [];
      remainingRowsCache = null;
    }
  }

  function closeResultModal() {
    const backdrop = document.getElementById('imp-result-backdrop');
    if (backdrop) backdrop.classList.remove('visible');
    remainingRowsCache = null;
  }

  return { open };
})();
