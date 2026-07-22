/* ===========================================================
   Pharmacy page logic
   -----------------------------------------------------------
   Drugs/stock/prescriptions are mock-only until the real
   backend routes exist (see BACKEND_HANDOFF.md). Visits and
   physicians come from the real API.
   =========================================================== */

Auth.requireAuth();
if (RoleGuard.blockIfNotAllowed('pharmacy')) { throw new Error('redirecting'); }
renderShell('pharmacy');
setPageTitle('Pharmacy');

document.getElementById('search-icon-slot').innerHTML = Icons.render('search');
document.getElementById('plus-icon-slot').innerHTML = Icons.render('plus');
document.getElementById('stock-search-icon-slot').innerHTML = Icons.render('search');
document.getElementById('drug-plus-icon-slot').innerHTML = Icons.render('plus');
document.getElementById('rx-modal-close').innerHTML = Icons.render('close');
document.getElementById('rx-detail-close').innerHTML = Icons.render('close');
document.getElementById('drug-modal-close').innerHTML = Icons.render('close');
document.getElementById('restock-modal-close').innerHTML = Icons.render('close');

let physiciansCache = [];
let visitsCache = [];
let drugsCache = [];
let eligibleVisits = [];
let rxLineCounter = 0;

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
function physicianName(id) {
  const p = physiciansCache.find(x => String(x.id) === String(id));
  return p ? p.full_name : '—';
}

// ---------- Tabs ----------
function switchTab(tab) {
  document.getElementById('tab-prescriptions').style.display = tab === 'prescriptions' ? '' : 'none';
  document.getElementById('tab-stock').style.display = tab === 'stock' ? '' : 'none';
  document.getElementById('tab-btn-prescriptions').classList.toggle('active', tab === 'prescriptions');
  document.getElementById('tab-btn-stock').classList.toggle('active', tab === 'stock');
  if (tab === 'stock') loadStock();
}
document.getElementById('tab-btn-prescriptions').addEventListener('click', () => switchTab('prescriptions'));
document.getElementById('tab-btn-stock').addEventListener('click', () => switchTab('stock'));

// ---------- Lookups ----------
async function loadLookups() {
  [physiciansCache, visitsCache, drugsCache] = await Promise.all([
    Api.physicians.list(),
    Api.visits.list(),
    Api.drugs.list(),
  ]);
  eligibleVisits = visitsCache.filter(v => v.status !== 'closed');

  document.getElementById('rf-physician').innerHTML = `<option value="">Select…</option>` +
    physiciansCache.map(p => `<option value="${p.id}">${UI.escapeHtml(p.full_name)}</option>`).join('');

  const visitSelect = document.getElementById('rf-visit');
  if (!eligibleVisits.length) {
    visitSelect.innerHTML = `<option value="">No open visits</option>`;
  } else {
    visitSelect.innerHTML = `<option value="">Select a visit…</option>` +
      eligibleVisits.map(v => `<option value="${v.id}" data-physician="${v.physician_id}">${UI.escapeHtml(v.patient.full_name)} — ${v.patient.patient_code} · ${UI.formatDate(v.visit_date)}</option>`).join('');
  }
}
document.getElementById('rf-visit').addEventListener('change', (e) => {
  const opt = e.target.selectedOptions[0];
  if (opt && opt.dataset.physician) document.getElementById('rf-physician').value = opt.dataset.physician;
});

// ---------- Prescription drug-line rows ----------
function drugOptionsHtml(selected) {
  return `<option value="">Select drug…</option>` +
    drugsCache.map(d => `<option value="${d.id}" ${d.id === selected ? 'selected' : ''}>${UI.escapeHtml(d.name)} (${UI.escapeHtml(d.unit || '')})</option>`).join('');
}
function addRxLine() {
  rxLineCounter += 1;
  const id = `rxline-${rxLineCounter}`;
  const wrap = document.createElement('div');
  wrap.className = 'form-grid';
  wrap.id = id;
  wrap.style.cssText = 'border:1px solid var(--color-border); border-radius:var(--radius-sm); padding:10px; margin-bottom:8px;';
  wrap.innerHTML = `
    <div class="field span-2">
      <select class="rx-line-drug">${drugOptionsHtml()}</select>
    </div>
    <div class="field"><input type="text" class="rx-line-dosage" placeholder="Dosage, e.g. 500mg" /></div>
    <div class="field"><input type="text" class="rx-line-frequency" placeholder="Frequency, e.g. 3x/day" /></div>
    <div class="field"><input type="text" class="rx-line-duration" placeholder="Duration, e.g. 5 days" /></div>
    <div class="field"><input type="number" class="rx-line-qty" min="1" placeholder="Qty prescribed" /></div>
    <div class="field span-2"><input type="text" class="rx-line-instructions" placeholder="Instructions (optional)" /></div>
    <div class="span-2" style="text-align:right;">
      <button type="button" class="btn btn-ghost btn-sm rx-remove-line">Remove line</button>
    </div>
  `;
  wrap.querySelector('.rx-remove-line').addEventListener('click', () => wrap.remove());
  document.getElementById('rx-items-list').appendChild(wrap);
}
document.getElementById('rx-add-item-btn').addEventListener('click', addRxLine);

function readRxLines() {
  return Array.from(document.getElementById('rx-items-list').children).map(row => ({
    drug_id: row.querySelector('.rx-line-drug').value,
    dosage: row.querySelector('.rx-line-dosage').value.trim(),
    frequency: row.querySelector('.rx-line-frequency').value.trim(),
    duration: row.querySelector('.rx-line-duration').value.trim(),
    quantity_prescribed: Number(row.querySelector('.rx-line-qty').value),
    instructions: row.querySelector('.rx-line-instructions').value.trim(),
  })).filter(it => it.drug_id && it.quantity_prescribed > 0);
}

// ---------- New prescription modal ----------
function openRxForm(visitId = null) {
  if (!eligibleVisits.length) { UI.toast('No open visits are eligible for a prescription.', 'danger'); return; }
  document.getElementById('rx-form').reset();
  document.getElementById('rx-items-list').innerHTML = '';
  addRxLine();
  if (visitId) {
    document.getElementById('rf-visit').value = visitId;
    document.getElementById('rf-visit').dispatchEvent(new Event('change'));
  }
  document.getElementById('rx-modal-backdrop').classList.add('visible');
}
function closeRxForm() { document.getElementById('rx-modal-backdrop').classList.remove('visible'); }
document.getElementById('new-rx-btn').addEventListener('click', () => openRxForm());
document.getElementById('rx-modal-close').addEventListener('click', closeRxForm);
document.getElementById('rx-form-cancel').addEventListener('click', closeRxForm);
document.getElementById('rx-modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'rx-modal-backdrop') closeRxForm(); });

document.getElementById('rx-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const visitId = document.getElementById('rf-visit').value;
  const visit = eligibleVisits.find(v => String(v.id) === String(visitId));
  const items = readRxLines();
  if (!visit) { UI.toast('Select a valid visit.', 'danger'); return; }
  if (!items.length) { UI.toast('Add at least one drug with a quantity.', 'danger'); return; }

  const payload = {
    visit_id: visit.id,
    patient_name: visit.patient.full_name,
    patient_code: visit.patient.patient_code,
    physician_id: document.getElementById('rf-physician').value,
    diagnosis_note: document.getElementById('rf-diagnosis-note').value.trim(),
    items,
  };
  if (!payload.physician_id) { UI.toast('Select the prescribing physician.', 'danger'); return; }

  const btn = document.getElementById('rx-form-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';
  try {
    await Api.prescriptions.create(payload);
    UI.toast('Prescription saved.');
    closeRxForm();
    loadRx();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Prescription';
  }
});

// ---------- Prescriptions list ----------
async function loadRx() {
  const search = document.getElementById('search-input').value.trim();
  const status = document.getElementById('status-filter').value;
  try {
    const list = await Api.prescriptions.list({ search, status });
    renderRxTable(list);
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

function renderRxTable(list) {
  const region = document.getElementById('rx-table-region');
  if (!list.length) {
    region.innerHTML = `
      <div class="table-wrap">
        <div class="empty-state">
          <div class="empty-icon">${Icons.render('pill')}</div>
          <h3>No prescriptions found</h3>
          <p>Try a different filter, or write a new prescription.</p>
          <button class="btn btn-primary" onclick="openRxForm()">${Icons.render('plus')} New Prescription</button>
        </div>
      </div>`;
    return;
  }
  region.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Patient</th><th>Physician</th><th>Prescribed</th><th>Drugs</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${list.map(rx => `
            <tr>
              <td class="cell-primary" style="cursor:pointer;" onclick="openRxDetail('${rx.id}')">
                ${UI.escapeHtml(rx.patient_name)} <span class="cell-code">${UI.escapeHtml(rx.patient_code)}</span>
              </td>
              <td class="cell-muted">${UI.escapeHtml(physicianName(rx.physician_id))}</td>
              <td class="cell-muted">${UI.formatDateTime(rx.prescribed_date)}</td>
              <td class="cell-muted">${rx.items.map(i => i.drug ? UI.escapeHtml(i.drug.name) : '?').join(', ')}</td>
              <td>${UI.prescriptionStatusBadge(rx.status)}</td>
              <td><button class="icon-btn" title="View" onclick="openRxDetail('${rx.id}')">${Icons.render('eye')}</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ---------- Prescription detail / dispense ----------
async function openRxDetail(id) {
  try {
    const rx = await Api.prescriptions.get(id);
    renderRxDetail(rx);
    document.getElementById('rx-detail-backdrop').classList.add('visible');
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

function renderRxDetail(rx) {
  document.getElementById('rxd-name').textContent = rx.patient_name;
  document.getElementById('rxd-sub').textContent = `${rx.patient_code} · prescribed ${UI.formatDateTime(rx.prescribed_date)} by ${UI.escapeHtml(physicianName(rx.physician_id))}`;

  document.getElementById('rx-detail-body').innerHTML = `
    <div style="margin-bottom:14px;">${UI.prescriptionStatusBadge(rx.status)}</div>
    ${rx.diagnosis_note ? `<div class="detail-item" style="margin-bottom:14px;"><div class="k">Diagnosis / note</div><div class="v" style="font-weight:500;">${UI.escapeHtml(rx.diagnosis_note)}</div></div>` : ''}
    <div class="table-wrap" style="box-shadow:none;">
      <table class="data-table">
        <thead><tr><th>Drug</th><th>Dosage</th><th>Prescribed</th><th>Remaining</th><th>Dispense</th></tr></thead>
        <tbody>
          ${rx.items.map(i => `
            <tr>
              <td class="cell-primary">${i.drug ? UI.escapeHtml(i.drug.name) : 'Unknown drug'}</td>
              <td class="cell-muted">${UI.escapeHtml(i.dosage)}${i.frequency ? ' · ' + UI.escapeHtml(i.frequency) : ''}${i.duration ? ' · ' + UI.escapeHtml(i.duration) : ''}</td>
              <td class="cell-muted">${i.quantity_prescribed} ${i.drug ? UI.escapeHtml(i.drug.unit || '') : ''}</td>
              <td class="cell-muted">${i.remaining}</td>
              <td>
                ${i.remaining > 0 ? `
                  <div style="display:flex; gap:6px;">
                    <input type="number" min="1" max="${i.remaining}" class="dispense-qty" data-item-id="${i.id}" style="width:70px; border:1px solid var(--color-border-strong); border-radius:6px; padding:5px 7px; font-size:12.5px;" placeholder="qty" />
                    <button type="button" class="btn btn-secondary btn-sm" data-dispense-item="${i.id}">Dispense</button>
                  </div>
                ` : `<span class="text-muted" style="font-size:11.5px;">Fully dispensed</span>`}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div id="rx-block-notice"></div>
  `;

  document.getElementById('rx-detail-body').querySelectorAll('[data-dispense-item]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const itemId = btn.dataset.dispenseItem;
      const input = document.querySelector(`.dispense-qty[data-item-id="${itemId}"]`);
      const qty = Number(input.value);
      if (!qty || qty <= 0) { UI.toast('Enter a quantity to dispense.', 'danger'); return; }
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>';
      try {
        await Api.prescriptions.dispense(rx.id, itemId, qty);
        UI.toast('Dispensed.');
        const fresh = await Api.prescriptions.get(rx.id);
        renderRxDetail(fresh);
        loadRx();
      } catch (e) {
        document.getElementById('rx-block-notice').innerHTML = `
          <div class="notice notice-warning">${Icons.render('alert')}<span>${UI.escapeHtml(UI.errorMessage(e))}</span></div>
        `;
        btn.disabled = false;
        btn.textContent = 'Dispense';
      }
    });
  });
}

function closeRxDetail() { document.getElementById('rx-detail-backdrop').classList.remove('visible'); }
document.getElementById('rx-detail-close').addEventListener('click', closeRxDetail);
document.getElementById('rx-detail-close-btn').addEventListener('click', closeRxDetail);
document.getElementById('rx-detail-backdrop').addEventListener('click', (e) => { if (e.target.id === 'rx-detail-backdrop') closeRxDetail(); });

document.getElementById('search-input').addEventListener('input', debounce(loadRx, 250));
document.getElementById('status-filter').addEventListener('change', loadRx);

// ---------- Drug stock tab ----------
async function loadStock() {
  try {
    drugsCache = await Api.drugs.list();
    const search = document.getElementById('stock-search-input').value.trim().toLowerCase();
    const list = search ? drugsCache.filter(d => d.name.toLowerCase().includes(search)) : drugsCache;
    renderStockTable(list);
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

function renderStockTable(list) {
  const region = document.getElementById('stock-table-region');
  if (!list.length) {
    region.innerHTML = `
      <div class="table-wrap">
        <div class="empty-state">
          <div class="empty-icon">${Icons.render('pill')}</div>
          <h3>No drugs found</h3>
          <p>Add a drug to the formulary to get started.</p>
          <button class="btn btn-primary" onclick="openDrugForm()">${Icons.render('plus')} Add Drug</button>
        </div>
      </div>`;
    return;
  }
  region.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Unit</th><th>On hand</th><th>Reorder threshold</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${list.map(d => `
            <tr>
              <td class="cell-primary">${UI.escapeHtml(d.name)}</td>
              <td class="cell-muted">${UI.escapeHtml(d.unit)}</td>
              <td class="cell-muted">${d.stock.quantity_on_hand}</td>
              <td class="cell-muted">${d.stock.reorder_threshold}</td>
              <td>${UI.stockBadge(d.stock)}</td>
              <td><button class="btn btn-secondary btn-sm" onclick="openRestockForm('${d.id}')">Adjust</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function openDrugForm() {
  document.getElementById('drug-form').reset();
  document.getElementById('drug-modal-backdrop').classList.add('visible');
}
function closeDrugForm() { document.getElementById('drug-modal-backdrop').classList.remove('visible'); }
document.getElementById('new-drug-btn').addEventListener('click', openDrugForm);
document.getElementById('drug-modal-close').addEventListener('click', closeDrugForm);
document.getElementById('drug-form-cancel').addEventListener('click', closeDrugForm);
document.getElementById('drug-modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'drug-modal-backdrop') closeDrugForm(); });

document.getElementById('drug-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    name: document.getElementById('df-name').value.trim(),
    unit: document.getElementById('df-unit').value.trim(),
    description: document.getElementById('df-description').value.trim(),
    initial_quantity: document.getElementById('df-quantity').value,
    reorder_threshold: document.getElementById('df-threshold').value,
  };
  const btn = document.getElementById('drug-form-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';
  try {
    await Api.drugs.create(payload);
    UI.toast('Drug added.');
    closeDrugForm();
    loadStock();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Drug';
  }
});

let restockDrugId = null;
function openRestockForm(drugId) {
  restockDrugId = drugId;
  const drug = drugsCache.find(d => d.id === drugId);
  document.getElementById('restock-form').reset();
  document.getElementById('restock-title').textContent = `Adjust Stock — ${drug ? drug.name : ''}`;
  document.getElementById('restock-modal-backdrop').classList.add('visible');
}
function closeRestockForm() { document.getElementById('restock-modal-backdrop').classList.remove('visible'); }
document.getElementById('restock-modal-close').addEventListener('click', closeRestockForm);
document.getElementById('restock-form-cancel').addEventListener('click', closeRestockForm);
document.getElementById('restock-modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'restock-modal-backdrop') closeRestockForm(); });

document.getElementById('restock-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const delta = Number(document.getElementById('rs-delta').value);
  if (!delta) { UI.toast('Enter a non-zero quantity.', 'danger'); return; }
  const btn = document.getElementById('restock-form-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';
  try {
    await Api.drugs.adjustStock(restockDrugId, delta);
    UI.toast('Stock updated.');
    closeRestockForm();
    loadStock();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }
});

document.getElementById('stock-search-input').addEventListener('input', debounce(loadStock, 250));

// ---------- Init ----------
async function init() {
  await loadLookups();
  await loadRx();
  const params = new URLSearchParams(window.location.search);
  if (params.get('open')) openRxDetail(params.get('open'));
  if (params.get('newFor')) openRxForm(params.get('newFor'));
}
init();
