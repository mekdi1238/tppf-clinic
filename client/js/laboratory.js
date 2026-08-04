/* ===========================================================
   Laboratory page logic — tabbed lab test selector
   =========================================================== */

Auth.requireAuth();
if (RoleGuard.blockIfNotAllowed('laboratory')) { throw new Error('redirecting'); }
renderShell('laboratory');
setPageTitle('Laboratory');

document.getElementById('search-icon-slot').innerHTML = Icons.render('search');
document.getElementById('plus-icon-slot').innerHTML = Icons.render('plus');
document.getElementById('order-modal-close').innerHTML = Icons.render('close');
document.getElementById('order-detail-close').innerHTML = Icons.render('close');

let physiciansCache = [];
let visitsCache = [];
let catalogCache = [];
let eligibleVisits = [];
let ordersCache = [];

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function physicianName(id) {
  const p = physiciansCache.find(x => String(x.id) === String(id));
  return p ? p.full_name : '—';
}

/* ── Tab definitions (maps tab key → panels shown, order matters) ── */
const TAB_PANELS = {
  'Hematology': {
    label: 'Hematology',
    containerId: 'lab-tests-Hematology',
    panelTabId: 'tab-panel-Hematology',
    // left column panels / right column panels for 2-col layout
    sections: [
      { name: null,        catalogPanel: 'Hematology', codes: ['WBC','DIFF','CBC','ESR','HGB','HCT'] },
      { name: null,        catalogPanel: 'Hematology', codes: ['BF','CPP','HCVAB','HBSAG','HPAB','RPR-VDRL','SEROLOGY'] },
    ],
  },
  'Parasitology|Urinalysis': {
    label: 'Parasitology | Urinalysis',
    containerId: 'lab-tests-ParasitologyUrinalysis',
    panelTabId: 'tab-panel-Parasitology|Urinalysis',
    sections: [
      { name: 'Parasitology', catalogPanel: 'Parasitology', codes: null },
      { name: 'Urinalysis',   catalogPanel: 'Urinalysis',   codes: null },
    ],
  },
  'Sed|Bacteriology|Other': {
    label: 'Sed | Bacteriology | Other',
    containerId: 'lab-tests-SedBacteriologyOther',
    panelTabId: 'tab-panel-Sed|Bacteriology|Other',
    sections: [
      { name: 'Sed (Sediment)',     catalogPanel: 'Sed',               codes: null },
      { name: 'Bacteriology',       catalogPanel: 'Bacteriology',      codes: null },
      { name: 'Other Body Fluids',  catalogPanel: 'Other Body Fluids', codes: null },
    ],
  },
  'Chemistry': {
    label: 'Chemistry',
    containerId: 'lab-tests-Chemistry',
    panelTabId: 'tab-panel-Chemistry',
    sections: [
      { name: null, catalogPanel: 'Chemistry', codes: null },
    ],
  },
};

/* ── Build test rows for the order form ── */
function buildTestRows(tests) {
  if (!tests.length) return '<p class="text-muted" style="font-size:13px;">No tests in this section.</p>';
  return tests.map(t => `
    <label class="lab-test-row">
      <input type="checkbox" name="of-test" value="${t.id}" data-code="${UI.escapeHtml(t.code)}" />
      <span class="lab-test-name">${UI.escapeHtml(t.code)}:</span>
      <span style="font-size:12.5px; color:var(--color-text); flex:1;">${UI.escapeHtml(t.display_name)}</span>
      ${t.normal_range ? `<span class="lab-test-range">${UI.escapeHtml(t.normal_range)}</span>` : ''}
    </label>
  `).join('');
}

/* ── Populate tabs in the new order form ── */
function populateOrderFormTabs() {
  for (const [tabKey, tabDef] of Object.entries(TAB_PANELS)) {
    const container = document.getElementById(tabDef.containerId);
    if (!container) continue;

    if (tabDef.sections.length === 1 && !tabDef.sections[0].name) {
      // Single un-named section (Hematology split or Chemistry)
      if (tabKey === 'Hematology') {
        // Hematology: left and right column explicitly defined by codes
        const leftCodes = tabDef.sections[0].codes;
        const rightCodes = tabDef.sections[1].codes;
        const allHema = catalogCache.filter(t => t.panel === 'Hematology');
        const left = allHema.filter(t => leftCodes.includes(t.code));
        const right = allHema.filter(t => rightCodes.includes(t.code));

        container.innerHTML = `
          <div>${buildTestRows(left)}</div>
          <div>${buildTestRows(right)}</div>
        `;
      } else {
        // Chemistry — 3 even columns
        const tests = catalogCache.filter(t => t.panel === 'Chemistry');
        const third = Math.ceil(tests.length / 3);
        container.innerHTML = `
          <div>${buildTestRows(tests.slice(0, third))}</div>
          <div>${buildTestRows(tests.slice(third, third * 2))}</div>
          <div>${buildTestRows(tests.slice(third * 2))}</div>
        `;
      }
    } else {
      // Multi-section tabs (Parasitology/Urinalysis, Sed/Bacteriology/Other)
      let html = '';
      for (const section of tabDef.sections) {
        let tests;
        if (section.codes) {
          tests = catalogCache.filter(t => section.codes.includes(t.code));
        } else {
          tests = catalogCache.filter(t => t.panel === section.catalogPanel);
        }
        html += `
          <div>
            ${section.name ? `<div class="lab-panel-section-title">${UI.escapeHtml(section.name)}</div>` : ''}
            ${buildTestRows(tests)}
          </div>
        `;
      }
      container.innerHTML = html;
    }
  }

  // Update selected count live
  document.querySelectorAll('input[name="of-test"]').forEach(cb => {
    cb.addEventListener('change', updateSelectedSummary);
  });
}

function updateSelectedSummary() {
  const checked = document.querySelectorAll('input[name="of-test"]:checked');
  const el = document.getElementById('order-selected-summary');
  if (!el) return;
  if (!checked.length) {
    el.textContent = 'No tests selected yet.';
  } else {
    const codes = Array.from(checked).map(c => c.dataset.code).join(', ');
    el.textContent = `${checked.length} test${checked.length !== 1 ? 's' : ''} selected: ${codes}`;
  }
}

/* ── Tab switching ── */
document.getElementById('lab-tabs-nav').addEventListener('click', (e) => {
  const btn = e.target.closest('.lab-tab-btn');
  if (!btn) return;
  const tabKey = btn.dataset.tab;

  document.querySelectorAll('.lab-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.lab-tab-panel').forEach(p => p.classList.remove('active'));

  btn.classList.add('active');
  const panel = document.getElementById(`tab-panel-${tabKey}`);
  if (panel) panel.classList.add('active');
});

/* ── Load lookups ── */
async function loadLookups() {
  [physiciansCache, visitsCache, catalogCache] = await Promise.all([
    Api.physicians.list(),
    Api.visits.list(),
    Api.labCatalog.list(),
  ]);

  eligibleVisits = visitsCache.filter(v => v.status !== 'closed');

  document.getElementById('of-physician').innerHTML = `<option value="">Select…</option>` +
    physiciansCache.map(p => `<option value="${p.id}">${UI.escapeHtml(p.full_name)}</option>`).join('');

  const visitSelect = document.getElementById('of-visit');
  if (!eligibleVisits.length) {
    visitSelect.innerHTML = `<option value="">No open visits</option>`;
  } else {
    visitSelect.innerHTML = `<option value="">Select a visit…</option>` +
      eligibleVisits.map(v =>
        `<option value="${v.id}" data-physician="${v.physician_id}">${UI.escapeHtml(v.patient.full_name)} — ${v.patient.patient_code} · ${UI.formatDate(v.visit_date)}</option>`
      ).join('');
  }

  populateOrderFormTabs();
  updateSelectedSummary();
}

document.getElementById('of-visit').addEventListener('change', (e) => {
  const opt = e.target.selectedOptions[0];
  if (opt && opt.dataset.physician) {
    document.getElementById('of-physician').value = opt.dataset.physician;
  }
});

/* ── Load & render orders list ── */
async function loadOrders() {
  const search = document.getElementById('search-input').value.trim();
  const status = document.getElementById('status-filter').value;
  try {
    ordersCache = await Api.labOrders.list({ search, status });
    renderTable(ordersCache);
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

function renderTable(list) {
  const region = document.getElementById('orders-table-region');
  if (!list.length) {
    region.innerHTML = `
      <div class="table-wrap">
        <div class="empty-state">
          <div class="empty-icon">${Icons.render('flask')}</div>
          <h3>No lab orders found</h3>
          <p>Try a different filter, or create a new order.</p>
          <button class="btn btn-primary" onclick="openOrderForm()">${Icons.render('plus')} New Lab Order</button>
        </div>
      </div>`;
    return;
  }
  region.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Patient</th><th>Physician</th><th>Ordered</th><th>Tests</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${list.map(o => `
            <tr>
              <td class="cell-primary" style="cursor:pointer;" onclick="openOrderDetail('${o.id}')">
                ${UI.escapeHtml(o.patient_name)} <span class="cell-code">${UI.escapeHtml(o.patient_code)}</span>
              </td>
              <td class="cell-muted">${UI.escapeHtml(physicianName(o.physician_id))}</td>
              <td class="cell-muted">${UI.formatDateTime(o.order_date)}</td>
              <td class="cell-muted">${o.items.map(i => i.test ? UI.escapeHtml(i.test.code) : '?').join(', ')}</td>
              <td>${UI.labOrderStatusBadge(o.status)}</td>
              <td><button class="icon-btn" title="View" onclick="openOrderDetail('${o.id}')">${Icons.render('eye')}</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/* ── New order modal ── */
function openOrderForm(visitId = null) {
  if (!eligibleVisits.length) {
    UI.toast('No open visits are eligible for a lab order.', 'danger');
    return;
  }
  document.getElementById('order-form').reset();
  document.querySelectorAll('input[name="of-test"]').forEach(cb => cb.checked = false);
  updateSelectedSummary();

  // Reset to first tab
  document.querySelectorAll('.lab-tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
  document.querySelectorAll('.lab-tab-panel').forEach((p, i) => p.classList.toggle('active', i === 0));

  if (visitId) {
    document.getElementById('of-visit').value = visitId;
    document.getElementById('of-visit').dispatchEvent(new Event('change'));
  }
  document.getElementById('order-modal-backdrop').classList.add('visible');
}
function closeOrderForm() {
  document.getElementById('order-modal-backdrop').classList.remove('visible');
}
document.getElementById('new-order-btn').addEventListener('click', () => openOrderForm());
document.getElementById('order-modal-close').addEventListener('click', closeOrderForm);
document.getElementById('order-form-cancel').addEventListener('click', closeOrderForm);
document.getElementById('order-modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'order-modal-backdrop') closeOrderForm();
});

document.getElementById('order-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const visitId = document.getElementById('of-visit').value;
  const visit = eligibleVisits.find(v => String(v.id) === String(visitId));
  const testIds = Array.from(document.querySelectorAll('input[name="of-test"]:checked')).map(el => el.value);
  if (!visit) { UI.toast('Select a valid visit.', 'danger'); return; }
  if (!testIds.length) { UI.toast('Select at least one test.', 'danger'); return; }

  const payload = {
    visit_id: visit.id,
    patient_name: visit.patient.full_name,
    patient_code: visit.patient.patient_code,
    physician_id: document.getElementById('of-physician').value,
    test_ids: testIds,
  };
  if (!payload.physician_id) { UI.toast('Select the ordering physician.', 'danger'); return; }

  const btn = document.getElementById('order-form-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Creating…';
  try {
    await Api.labOrders.create(payload);
    UI.toast('Lab order created.');
    closeOrderForm();
    loadOrders();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Order';
  }
});

/* ── Order Detail modal ── */
async function openOrderDetail(id) {
  try {
    const o = await Api.labOrders.get(id);
    renderOrderDetail(o);
    document.getElementById('order-detail-backdrop').classList.add('visible');
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

const NEXT_LAB_STATUS = { pending: 'in_progress', in_progress: 'completed' };
const NEXT_LAB_LABEL  = { in_progress: 'Mark In Progress', completed: 'Mark Completed' };

/* ── Group detail items by panel for tabbed display ── */
function groupItemsByPanel(items) {
  const groups = {};
  items.forEach(i => {
    const panel = (i.test && i.test.panel) ? i.test.panel : 'Other';
    if (!groups[panel]) groups[panel] = [];
    groups[panel].push(i);
  });
  return groups;
}

function renderOrderDetail(o) {
  document.getElementById('od-name').textContent = o.patient_name;
  document.getElementById('od-sub').textContent =
    `${o.patient_code} · ordered ${UI.formatDateTime(o.order_date)} by ${UI.escapeHtml(physicianName(o.physician_id))}`;

  const canEnter = o.status !== 'completed';
  const groups = groupItemsByPanel(o.items);

  let panelHtml = '';
  // Ordered panels for display
  const PANEL_ORDER = ['Hematology','Parasitology','Urinalysis','Sed','Bacteriology','Other Body Fluids','Chemistry','Other'];
  const panelKeys = [...new Set([...PANEL_ORDER, ...Object.keys(groups)])].filter(k => groups[k]);

  for (const panel of panelKeys) {
    const items = groups[panel];
    if (!items || !items.length) continue;
    panelHtml += `
      <div class="lab-result-section-head">${UI.escapeHtml(panel)}</div>
      ${items.map(i => {
        const range = (i.test && i.test.normal_range) ? i.test.normal_range : '';
        return `
          <div class="lab-result-item">
            <span class="lab-result-label">${i.test ? UI.escapeHtml(i.test.code) : '?'}</span>
            <input type="text"
              class="lab-result-input"
              data-item-id="${i.id}"
              value="${UI.escapeHtml(i.result_value || '')}"
              placeholder="${range ? 'e.g. ' + range : 'Result…'}"
              ${canEnter ? '' : 'disabled'}
            />
            ${range ? `<span class="lab-result-range">${UI.escapeHtml(range)}</span>` : ''}
            <span id="lab-item-action-${i.id}" style="flex-shrink:0;">
              ${canEnter
                ? `<button type="button" class="btn btn-secondary btn-sm" data-save-item="${i.id}">Save</button>`
                : (i.entered_at ? `<span class="text-muted" style="font-size:11px;">${UI.formatDateTime(i.entered_at)}</span>` : '')
              }
            </span>
          </div>
        `;
      }).join('')}
    `;
  }

  document.getElementById('order-detail-body').innerHTML = `
    <div style="margin-bottom:12px;">${UI.labOrderStatusBadge(o.status)}</div>
    <div class="detail-section">
      <h4>Test Results</h4>
      <div class="lab-result-grid">${panelHtml}</div>
    </div>
    <div id="order-block-notice"></div>
  `;

  // Wire Save buttons
  document.getElementById('order-detail-body').querySelectorAll('[data-save-item]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const itemId = btn.dataset.saveItem;
      const input = document.querySelector(`.lab-result-input[data-item-id="${itemId}"]`);
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>';
      try {
        const updatedItem = await Api.labOrders.updateItem(o.id, itemId, input.value.trim());
        UI.toast('Result saved.');
        const actionCell = document.getElementById(`lab-item-action-${itemId}`);
        if (actionCell && updatedItem.entered_at) {
          actionCell.innerHTML = `<span class="text-muted" style="font-size:11px;">${UI.formatDateTime(updatedItem.entered_at)}</span>`;
        } else {
          btn.disabled = false;
          btn.textContent = 'Save';
        }
        loadOrders();
      } catch (e) {
        UI.toast(UI.errorMessage(e), 'danger');
        btn.disabled = false;
        btn.textContent = 'Save';
      }
    });
  });

  // Footer
  const footer = document.getElementById('order-detail-footer');
  const next = NEXT_LAB_STATUS[o.status];
  const printBtn = o.status === 'completed'
    ? `<button class="btn btn-secondary" id="order-print-btn">${Icons.render('reports')} Print Report</button>`
    : '';

  if (!next) {
    footer.innerHTML = `<span class="footer-note">This order is completed.</span>${printBtn}<button class="btn btn-secondary" id="order-close-modal">Close</button>`;
  } else {
    footer.innerHTML = `
      ${printBtn}
      <button class="btn btn-secondary" id="order-close-modal">Close</button>
      <button class="btn btn-primary" id="order-advance">${NEXT_LAB_LABEL[next]}</button>
    `;
  }

  document.getElementById('order-close-modal').addEventListener('click', closeOrderDetail);
  const printButton = document.getElementById('order-print-btn');
  if (printButton) printButton.addEventListener('click', () => window.print());

  const advanceBtn = document.getElementById('order-advance');
  if (advanceBtn) {
    advanceBtn.addEventListener('click', async () => {
      advanceBtn.disabled = true;
      advanceBtn.innerHTML = '<span class="spinner"></span> Updating…';
      try {
        await Api.labOrders.updateStatus(o.id, next);
        UI.toast(`Order moved to "${next.replace('_', ' ')}".`);
        const fresh = await Api.labOrders.get(o.id);
        renderOrderDetail(fresh);
        loadOrders();
      } catch (e) {
        document.getElementById('order-block-notice').innerHTML = `
          <div class="notice notice-warning">${Icons.render('alert')}<span>${UI.escapeHtml(UI.errorMessage(e))}</span></div>
        `;
        advanceBtn.disabled = false;
        advanceBtn.textContent = NEXT_LAB_LABEL[next];
      }
    });
  }
}

function closeOrderDetail() {
  document.getElementById('order-detail-backdrop').classList.remove('visible');
}
document.getElementById('order-detail-close').addEventListener('click', closeOrderDetail);
document.getElementById('order-detail-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'order-detail-backdrop') closeOrderDetail();
});

document.getElementById('search-input').addEventListener('input', debounce(loadOrders, 250));
document.getElementById('status-filter').addEventListener('change', loadOrders);

async function init() {
  await loadLookups();
  await loadOrders();
  const params = new URLSearchParams(window.location.search);
  if (params.get('open')) openOrderDetail(params.get('open'));
  if (params.get('newFor')) openOrderForm(params.get('newFor'));
}
init();
