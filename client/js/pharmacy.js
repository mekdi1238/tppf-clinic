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
const importSlot = document.getElementById('import-icon-slot');
document.getElementById('rx-modal-close').innerHTML = Icons.render('close');
document.getElementById('rx-detail-close').innerHTML = Icons.render('close');
document.getElementById('drug-modal-close').innerHTML = Icons.render('close');
document.getElementById('restock-modal-close').innerHTML = Icons.render('close');

const newRxBtn = document.getElementById('new-rx-btn');
const newDrugBtn = document.getElementById('new-drug-btn');
const importDrugsBtn = document.getElementById('import-drugs-btn');
if (typeof Permissions !== 'undefined') {
  if (newRxBtn) newRxBtn.style.display = Permissions.has('pharmacy.dispense') ? 'inline-flex' : 'none';
  if (newDrugBtn) newDrugBtn.style.display = Permissions.has('pharmacy.manage_stock') ? 'inline-flex' : 'none';
  if (importDrugsBtn) importDrugsBtn.style.display = Permissions.has('pharmacy.manage_stock') ? 'inline-flex' : 'none';
}

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
      eligibleVisits.map(v => `<option value="${v.id}" data-physician="${v.physician_id}">${UI.escapeHtml(v.patient ? v.patient.full_name : '')} — ${v.patient ? v.patient.patient_code : ''} · ${UI.formatDate(v.visit_date)}</option>`).join('');

    const visitOptions = eligibleVisits.map(v => ({
      value: v.id,
      label: `${v.patient ? v.patient.full_name : 'Patient'} (${v.patient ? v.patient.patient_code : ''})`,
      sublabel: `${UI.escapeHtml(v.chief_complaint || 'Visit')} · ${UI.formatDate(v.visit_date)}`
    }));
    UI.makeSearchableSelect(visitSelect, visitOptions, 'Search patient by name or code…');
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
              <td>
                <div style="display:flex; align-items:center; gap:4px;">
                  <button class="icon-btn" title="Print Prescription" onclick="printPrescription('${rx.id}', event)">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  </button>
                  <button class="icon-btn" title="View" onclick="openRxDetail('${rx.id}')">${Icons.render('eye')}</button>
                  <button class="icon-btn icon-btn-danger" title="Delete Prescription" onclick="deletePrescription('${rx.id}', event)">${Icons.render('trash')}</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

window.printPrescription = async function(id, event) {
  if (event) event.stopPropagation();
  try {
    const rx = await Api.prescriptions.get(id);
    if (typeof PrintDoc !== 'undefined') {
      PrintDoc.prescription(rx);
    } else {
      window.print();
    }
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
};

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

  const delBtn = document.getElementById('rx-detail-delete-btn');
  if (delBtn) {
    delBtn.onclick = () => deletePrescription(rx.id);
  }

  const printBtn = document.getElementById('rx-detail-print-btn');
  if (printBtn) {
    printBtn.onclick = () => {
      if (typeof PrintDoc !== 'undefined') {
        PrintDoc.prescription(rx);
      } else {
        window.print();
      }
    };
  }

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

window.deletePrescription = async function(id, event) {
  if (event) event.stopPropagation();
  if (!confirm('Are you sure you want to delete this prescription? Any dispensed stock will be restored to pharmacy inventory and it will be removed from the patient visit record.')) return;
  try {
    await Api.prescriptions.delete(id);
    UI.toast('Prescription deleted successfully.');
    closeRxDetail();
    loadRx();
    loadStock();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  }
};


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
    const category = document.getElementById('stock-category-filter') ? document.getElementById('stock-category-filter').value : 'all';
    const condition = document.getElementById('stock-condition-filter') ? document.getElementById('stock-condition-filter').value : 'all';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sixMonthsLater = new Date(today);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);

    let list = drugsCache;

    if (search) {
      list = list.filter(d =>
        (d.name && d.name.toLowerCase().includes(search)) ||
        (d.drug_code && d.drug_code.toLowerCase().includes(search)) ||
        (d.category && d.category.toLowerCase().includes(search)) ||
        (d.batch_no && d.batch_no.toLowerCase().includes(search)) ||
        (d.description && d.description.toLowerCase().includes(search))
      );
    }

    if (category && category !== 'all') {
      if (category === 'Other') {
        const STANDARD_CATS = [
          'Anti Acid drugs', 'Eye ointment', 'Skin ointment', 'Iv Fluid', 'Syringe',
          'Anti Pain', 'Dressing materials', 'Disinfectant solution', 'Adhesive Plaster',
          'Anti bacterial Drug', 'Cardiovascular Drug (CVS)', 'Anti diabetic',
          'minerals', 'Anti protocol', 'Anti Inflammatory Drugs'
        ];
        list = list.filter(d => !STANDARD_CATS.includes(d.category));
      } else {
        list = list.filter(d => d.category === category);
      }
    }

    if (condition === 'good') {
      list = list.filter(d => d.expiry_date && new Date(d.expiry_date) > sixMonthsLater);
    } else if (condition === 'expiring_soon') {
      list = list.filter(d => d.expiry_date && new Date(d.expiry_date) >= today && new Date(d.expiry_date) <= sixMonthsLater);
    } else if (condition === 'expired') {
      list = list.filter(d => d.expiry_date && new Date(d.expiry_date) < today);
    } else if (condition === 'low_stock') {
      list = list.filter(d => {
        const stock = d.stock || { quantity_on_hand: 0, reorder_threshold: 0 };
        const q = Number(stock.quantity_on_hand);
        const t = Number(stock.reorder_threshold);
        return q > 0 && q <= t;
      });
    } else if (condition === 'out_of_stock') {
      list = list.filter(d => {
        const stock = d.stock || { quantity_on_hand: 0 };
        return Number(stock.quantity_on_hand) === 0;
      });
    } else if (condition === 'overstock') {
      list = list.filter(d => {
        const stock = d.stock || {};
        return stock.max_threshold !== null && stock.max_threshold !== undefined && Number(stock.quantity_on_hand) > Number(stock.max_threshold);
      });
    }

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
          <h3>No drugs match the filter</h3>
          <p>Try a different search, category, or condition filter, or add a new drug.</p>
          <div style="display:flex; gap:10px; justify-content:center; margin-top:12px;">
            <button class="btn btn-secondary" onclick="ImportModal.open('drugs', () => loadStock())">${Icons.render('upload')} Import Drugs</button>
            <button class="btn btn-primary" onclick="openDrugForm()">${Icons.render('plus')} Add Drug</button>
          </div>
        </div>
      </div>`;
    return;
  }
  region.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Item Name</th>
            <th>Category</th>
            <th>Unit / Measure</th>
            <th>Batch No</th>
            <th>Min (Thresh)</th>
            <th>Maximum</th>
            <th>Quantity</th>
            <th>Expiry Date (YYYY-MM-DD)</th>
            <th>Stock Status</th>
            <th>Expiry Status</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(d => {
            const stock = d.stock || { quantity_on_hand: 0, reorder_threshold: 0, max_threshold: null };
            return `
              <tr>
                <td class="cell-code" style="font-weight:700; color:var(--color-primary); cursor:pointer;" onclick="openEditDrugFormById('${d.id}')">
                  ${UI.escapeHtml(d.drug_code || '—')}
                </td>
                <td class="cell-primary" style="cursor:pointer;" onclick="openEditDrugFormById('${d.id}')">
                  <div style="font-weight:600;">${UI.escapeHtml(d.name)}</div>
                  ${d.description ? `<div style="font-size:11.5px; color:var(--color-text-muted); font-weight:normal; max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${UI.escapeHtml(d.description)}</div>` : ''}
                </td>
                <td>
                  ${d.category
                    ? `<span class="badge badge-neutral" style="font-size:11.5px; font-weight:600; background:rgba(0,102,204,0.08); color:var(--color-primary);">${UI.escapeHtml(d.category)}</span>`
                    : '<span class="text-muted">—</span>'}
                </td>
                <td class="cell-muted" style="font-size:12.5px;">${UI.escapeHtml(d.unit || '—')}</td>
                <td class="cell-muted" style="font-family:monospace; font-size:12px; font-weight:600;">${UI.escapeHtml(d.batch_no || '—')}</td>
                <td class="cell-muted" style="font-weight:600;">${stock.reorder_threshold !== null && stock.reorder_threshold !== undefined ? stock.reorder_threshold : 0}</td>
                <td class="cell-muted" style="font-weight:600;">${stock.max_threshold !== null && stock.max_threshold !== undefined ? stock.max_threshold : '—'}</td>
                <td style="font-weight:700; font-size:14px; color:var(--color-text);">${stock.quantity_on_hand}</td>
                <td class="cell-muted" style="font-weight:600;">${d.expiry_date ? UI.formatDate(d.expiry_date) : '<span class="text-muted">Not set</span>'}</td>
                <td>${UI.stockBadge(stock)}</td>
                <td>${UI.drugExpiryBadge(d.expiry_date)}</td>
                <td>
                  <div style="display:flex; gap:6px; justify-content:flex-end;">
                    <button class="btn btn-secondary btn-sm" onclick="openEditDrugFormById('${d.id}')" title="Edit Drug Details">Edit</button>
                    <button class="btn btn-secondary btn-sm" onclick="openRestockForm('${d.id}')" title="Quick Quantity Adjustment">Adjust</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteDrug('${d.id}', '${UI.escapeHtml(d.name)}')" style="background-color:#dc3545; color:white;">Delete</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function deleteDrug(id, name) {
  if (!confirm(`Delete "${name}" from the formulary? This action cannot be undone.`)) return;
  try {
    await Api.drugs.delete(id);
    UI.toast('Drug deleted.');
    await loadStock();
    await loadLookups();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  }
}

// ---------- Add / Edit Drug Modal ----------
const STANDARD_CATEGORIES = [
  'Anti Acid drugs', 'Eye ointment', 'Skin ointment', 'Iv Fluid', 'Syringe',
  'Anti Pain', 'Dressing materials', 'Disinfectant solution', 'Adhesive Plaster',
  'Anti bacterial Drug', 'Cardiovascular Drug (CVS)', 'Anti diabetic',
  'minerals', 'Anti protocol', 'Anti Inflammatory Drugs'
];
const STANDARD_UNITS = ['bottle', 'strips', 'capsul', 'packet', 'sachet'];

function openDrugForm() {
  document.getElementById('drug-form').reset();
  document.getElementById('df-id').value = '';
  document.getElementById('drug-modal-title').textContent = 'Add Drug';
  document.getElementById('drug-modal-subtitle').textContent = 'Add a new pharmaceutical stock item to the clinic formulary.';
  document.getElementById('df-custom-category-wrap').style.display = 'none';
  document.getElementById('df-custom-category').value = '';
  document.getElementById('df-custom-unit-wrap').style.display = 'none';
  document.getElementById('df-custom-unit').value = '';
  document.getElementById('drug-modal-backdrop').classList.add('visible');
}

function openEditDrugForm(d) {
  if (!d) return;
  document.getElementById('drug-form').reset();
  document.getElementById('df-id').value = d.id;
  document.getElementById('drug-modal-title').textContent = `Edit Drug — ${d.name}`;
  document.getElementById('drug-modal-subtitle').textContent = `Update item code, clinical category, thresholds, quantity, and expiration date.`;

  document.getElementById('df-code').value = d.drug_code || '';
  document.getElementById('df-name').value = d.name || '';
  
  if (d.category && STANDARD_CATEGORIES.includes(d.category)) {
    document.getElementById('df-category').value = d.category;
    document.getElementById('df-custom-category-wrap').style.display = 'none';
    document.getElementById('df-custom-category').value = '';
  } else if (d.category) {
    document.getElementById('df-category').value = 'other';
    document.getElementById('df-custom-category-wrap').style.display = '';
    document.getElementById('df-custom-category').value = d.category;
  } else {
    document.getElementById('df-category').value = '';
    document.getElementById('df-custom-category-wrap').style.display = 'none';
    document.getElementById('df-custom-category').value = '';
  }
  
  const unitClean = (d.unit || '').replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
  const matchedStandardUnit = STANDARD_UNITS.find(u => u.toLowerCase() === unitClean || u.toLowerCase() === (d.unit || '').toLowerCase());
  if (matchedStandardUnit) {
    document.getElementById('df-unit').value = matchedStandardUnit;
    document.getElementById('df-custom-unit-wrap').style.display = 'none';
    document.getElementById('df-custom-unit').value = '';
  } else if (d.unit) {
    document.getElementById('df-unit').value = 'other';
    document.getElementById('df-custom-unit').value = d.unit;
    document.getElementById('df-custom-unit-wrap').style.display = '';
  } else {
    document.getElementById('df-unit').value = '';
    document.getElementById('df-custom-unit-wrap').style.display = 'none';
    document.getElementById('df-custom-unit').value = '';
  }


  document.getElementById('df-batch').value = d.batch_no || '';
  
  const stock = d.stock || {};
  document.getElementById('df-threshold').value = stock.reorder_threshold !== undefined ? stock.reorder_threshold : 0;
  document.getElementById('df-max').value = stock.max_threshold !== null && stock.max_threshold !== undefined ? stock.max_threshold : '';
  document.getElementById('df-quantity').value = stock.quantity_on_hand !== undefined ? stock.quantity_on_hand : 0;
  document.getElementById('df-expiry').value = d.expiry_date ? d.expiry_date.slice(0, 10) : '';
  document.getElementById('df-description').value = d.description || '';

  document.getElementById('drug-modal-backdrop').classList.add('visible');
}

function openEditDrugFormById(id) {
  const d = drugsCache.find(x => String(x.id) === String(id));
  if (d) openEditDrugForm(d);
}

function closeDrugForm() { document.getElementById('drug-modal-backdrop').classList.remove('visible'); }
document.getElementById('new-drug-btn').addEventListener('click', openDrugForm);

const categorySelect = document.getElementById('df-category');
if (categorySelect) {
  categorySelect.addEventListener('change', () => {
    const isOther = categorySelect.value === 'other';
    document.getElementById('df-custom-category-wrap').style.display = isOther ? '' : 'none';
    if (isOther) {
      document.getElementById('df-custom-category').focus();
    } else {
      document.getElementById('df-custom-category').value = '';
    }
  });
}

const unitSelect = document.getElementById('df-unit');
if (unitSelect) {
  unitSelect.addEventListener('change', () => {
    const isOther = unitSelect.value === 'other';
    document.getElementById('df-custom-unit-wrap').style.display = isOther ? '' : 'none';
    if (isOther) {
      document.getElementById('df-custom-unit').focus();
    } else {
      document.getElementById('df-custom-unit').value = '';
    }
  });
}

const importIconSlot = document.getElementById('import-icon-slot');
if (importIconSlot) importIconSlot.innerHTML = Icons.render('upload');

const exportIconSlot = document.getElementById('export-icon-slot');
if (exportIconSlot) exportIconSlot.innerHTML = Icons.render('download');

const drugPlusIconSlot = document.getElementById('drug-plus-icon-slot');
if (drugPlusIconSlot) drugPlusIconSlot.innerHTML = Icons.render('plus');

if (importDrugsBtn) {
  importDrugsBtn.addEventListener('click', () => {
    ImportModal.open('drugs', () => {
      loadStock();
      loadLookups();
    });
  });
}

const exportDrugsBtn = document.getElementById('export-drugs-btn');
if (exportDrugsBtn) {
  exportDrugsBtn.addEventListener('click', () => {
    ExportModal.open('drugs');
  });
}

document.getElementById('drug-modal-close').addEventListener('click', closeDrugForm);
document.getElementById('drug-form-cancel').addEventListener('click', closeDrugForm);
document.getElementById('drug-modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'drug-modal-backdrop') closeDrugForm(); });

document.getElementById('drug-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('df-id').value;
  const drugCode = document.getElementById('df-code').value.trim();
  const name = document.getElementById('df-name').value.trim();
  
  let category = document.getElementById('df-category').value;
  if (category === 'other') {
    category = document.getElementById('df-custom-category').value.trim();
    if (!category) {
      UI.toast('Please type a custom category name.', 'danger');
      document.getElementById('df-custom-category').focus();
      return;
    }
  }

  let unit = document.getElementById('df-unit').value;
  if (unit === 'other') {
    unit = document.getElementById('df-custom-unit').value.trim();
    if (!unit) {
      UI.toast('Please type a custom unit of measurement.', 'danger');
      document.getElementById('df-custom-unit').focus();
      return;
    }
  }

  const batchNo = document.getElementById('df-batch').value.trim();
  const rawQty = document.getElementById('df-quantity').value;
  const rawThreshold = document.getElementById('df-threshold').value;
  const rawMax = document.getElementById('df-max').value;
  const rawExpiry = document.getElementById('df-expiry').value;
  const description = document.getElementById('df-description').value.trim();

  const payload = {
    drug_code: drugCode || null,
    name,
    category: category || null,
    unit: unit || null,
    batch_no: batchNo || null,
    description: description || null,
    reorder_threshold: rawThreshold !== '' ? Number(rawThreshold) : 0,
    max_threshold: rawMax !== '' ? Number(rawMax) : null,
    expiry_date: rawExpiry ? rawExpiry : null,
  };

  const btn = document.getElementById('drug-form-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';
  try {
    if (id) {
      payload.quantity_on_hand = rawQty !== '' ? Number(rawQty) : 0;
      await Api.drugs.update(id, payload);
      UI.toast('Drug updated successfully.');
    } else {
      payload.initial_quantity = rawQty !== '' ? Number(rawQty) : 0;
      await Api.drugs.create(payload);
      UI.toast('Drug added to formulary.');
    }
    closeDrugForm();
    await loadStock();
    await loadLookups();
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
  const drug = drugsCache.find(d => String(d.id) === String(drugId));
  document.getElementById('restock-form').reset();
  document.getElementById('restock-title').textContent = `Adjust Stock — ${drug ? drug.name : ''}`;
  if (drug && drug.expiry_date) {
    document.getElementById('rs-expiry').value = drug.expiry_date.slice(0, 10);
  } else {
    document.getElementById('rs-expiry').value = '';
  }
  document.getElementById('restock-modal-backdrop').classList.add('visible');
}
function closeRestockForm() { document.getElementById('restock-modal-backdrop').classList.remove('visible'); }
document.getElementById('restock-modal-close').addEventListener('click', closeRestockForm);
document.getElementById('restock-form-cancel').addEventListener('click', closeRestockForm);
document.getElementById('restock-modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'restock-modal-backdrop') closeRestockForm(); });

document.getElementById('restock-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const delta = Number(document.getElementById('rs-delta').value);
  const expiryDate = document.getElementById('rs-expiry').value || null;
  if (isNaN(delta)) { UI.toast('Enter a valid quantity change.', 'danger'); return; }
  const btn = document.getElementById('restock-form-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';
  try {
    await Api.drugs.adjustStock(restockDrugId, delta, expiryDate);
    UI.toast('Stock and expiry updated.');
    closeRestockForm();
    await loadStock();
    await loadLookups();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }
});

document.getElementById('stock-search-input').addEventListener('input', debounce(loadStock, 250));
const categoryFilter = document.getElementById('stock-category-filter');
if (categoryFilter) categoryFilter.addEventListener('change', loadStock);
const conditionFilter = document.getElementById('stock-condition-filter');
if (conditionFilter) conditionFilter.addEventListener('change', loadStock);

// ---------- Init ----------
async function init() {
  await loadLookups();
  await loadRx();
  const params = new URLSearchParams(window.location.search);
  if (params.get('open')) openRxDetail(params.get('open'));
  if (params.get('newFor')) openRxForm(params.get('newFor'));

  setInterval(() => {
    const activeBackdrop = document.querySelector('.modal-backdrop.visible');
    if (!activeBackdrop) {
      loadRx();
    }
  }, 10000);
}
init();

