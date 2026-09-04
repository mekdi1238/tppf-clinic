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

const newOrderBtn = document.getElementById('new-order-btn');
if (newOrderBtn && typeof Permissions !== 'undefined') {
  newOrderBtn.style.display = Permissions.has('lab.create_order') ? 'inline-flex' : 'none';
}

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
    sections: [
      {
        name: 'Cell Counts & Leukocyte Differentials',
        catalogPanel: 'Hematology',
        codes: ['WBC', 'DIFF', 'CBC', 'ESR', 'HGB', 'HCT', 'LYMPH', 'MID', 'GRAN'],
      },
      {
        name: 'Erythrocyte & Thrombocyte Indices',
        catalogPanel: 'Hematology',
        codes: ['RBC', 'MCV', 'MCH', 'MCHC', 'RDW-CV', 'RDW-SD', 'PLT', 'MPV', 'PDW', 'PCT'],
      },
      {
        name: 'Serology & Rapid Tests',
        catalogPanel: 'Hematology',
        codes: ['BF', 'CPP', 'HCVAB', 'HBSAG', 'HPAB', 'RPR-VDRL', 'SEROLOGY'],
        subsections: [
          {
            name: 'WWF',
            codes: ['SO', 'SH', 'Ox19'],
          },
        ],
      },
    ],
  },
  'Parasitology|Urinalysis': {
    label: 'Parasitology | Urinalysis',
    containerId: 'lab-tests-ParasitologyUrinalysis',
    panelTabId: 'tab-panel-Parasitology|Urinalysis',
    sections: [
      {
        name: 'Stool Examination',
        catalogPanel: 'Stool',
        codes: ['STOOL', 'STOOL-COLOR', 'STOOL-CONSISTENCY', 'STOOL-ME'],
      },
      {
        name: 'Parasitology & Antigens',
        catalogPanel: 'Parasitology',
        codes: ['CONCENTRATION', 'HPAG', 'OCCULT-BLOOD'],
      },
      {
        name: 'Urinalysis',
        catalogPanel: 'Urinalysis',
        codes: null,
      },
    ],
  },
  'Sed|Bacteriology|Other': {
    label: 'Sed | Bacteriology | Other',
    containerId: 'lab-tests-SedBacteriologyOther',
    panelTabId: 'tab-panel-Sed|Bacteriology|Other',
    sections: [
      { name: 'Sed (Sediment / Microscopy)', catalogPanel: 'Sed', codes: null },
      { name: 'Bacteriology', catalogPanel: 'Bacteriology', codes: null },
      { name: 'Other Body Fluids', catalogPanel: 'Other Body Fluids', codes: null },
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

    if (tabKey === 'Chemistry') {
      // Chemistry — 3 even columns
      const tests = catalogCache.filter(t => t.panel === 'Chemistry');
      const third = Math.ceil(tests.length / 3);
      container.innerHTML = `
        <div>${buildTestRows(tests.slice(0, third))}</div>
        <div>${buildTestRows(tests.slice(third, third * 2))}</div>
        <div>${buildTestRows(tests.slice(third * 2))}</div>
      `;
    } else {
      // Multi-section tabs (Hematology, Parasitology/Urinalysis, Sed/Bacteriology/Other)
      let html = '';
      for (const section of tabDef.sections) {
        let tests = [];
        if (section.codes) {
          tests = section.codes.map(c => catalogCache.find(t => t.code.toUpperCase() === c.toUpperCase())).filter(Boolean);
        } else if (section.catalogPanel) {
          tests = catalogCache.filter(t => t.panel === section.catalogPanel);
        }

        let subHtml = '';
        if (section.subsections && section.subsections.length) {
          for (const sub of section.subsections) {
            const subTests = sub.codes.map(c => catalogCache.find(t => t.code.toUpperCase() === c.toUpperCase())).filter(Boolean);
            subHtml += `
              <div style="margin-top:14px;">
                ${sub.name ? `<div class="lab-panel-section-title" style="margin-top:6px; margin-bottom:6px;">${UI.escapeHtml(sub.name)}</div>` : ''}
                ${buildTestRows(subTests)}
              </div>
            `;
          }
        }

        html += `
          <div>
            ${section.name ? `<div class="lab-panel-section-title">${UI.escapeHtml(section.name)}</div>` : ''}
            ${buildTestRows(tests)}
            ${subHtml}
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
        `<option value="${v.id}" data-physician="${v.physician_id}">${UI.escapeHtml(v.patient ? v.patient.full_name : '')} — ${v.patient ? v.patient.patient_code : ''} · ${UI.formatDate(v.visit_date)}</option>`
      ).join('');

    const visitOptions = eligibleVisits.map(v => ({
      value: v.id,
      label: `${v.patient ? v.patient.full_name : 'Patient'} (${v.patient ? v.patient.patient_code : ''})`,
      sublabel: `${UI.escapeHtml(v.chief_complaint || 'Visit')} · ${UI.formatDate(v.visit_date)}`
    }));
    UI.makeSearchableSelect(visitSelect, visitOptions, 'Search patient by name or code…');
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
              <td>
                <div style="display:flex; align-items:center; gap:4px;">
                  <button class="icon-btn" title="View" onclick="openOrderDetail('${o.id}')">${Icons.render('eye')}</button>
                  <button class="icon-btn icon-btn-danger" title="Delete Lab Order" onclick="deleteLabOrder('${o.id}', event)">${Icons.render('trash')}</button>
                </div>
              </td>
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
  document.getElementById('of-physician-note').value = '';
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
    physician_note: document.getElementById('of-physician-note').value.trim() || null,
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
const NEXT_LAB_LABEL = { in_progress: 'Mark In Progress', completed: 'Mark Completed' };

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
  const PANEL_ORDER = ['Hematology', 'Stool', 'Parasitology', 'Urinalysis', 'Sed', 'Bacteriology', 'Other Body Fluids', 'Chemistry', 'Other'];
  const panelKeys = [...new Set([...PANEL_ORDER, ...Object.keys(groups)])].filter(k => groups[k]);

  for (const panel of panelKeys) {
    const items = groups[panel];
    if (!items || !items.length) continue;
    panelHtml += `
      <div class="lab-result-section-head">${UI.escapeHtml(panel === 'Stool' ? 'Stool Examination' : panel)}</div>
      ${items.map(i => {
      const range = (i.test && i.test.normal_range) ? i.test.normal_range : '';
      const flag = UI.checkLabResultRange(i.result_value, range);
      return `
          <div class="lab-result-item" id="lab-item-box-${i.id}">
            <span class="lab-result-label">${i.test ? UI.escapeHtml(i.test.code) : '?'}</span>
            <input type="text"
              class="lab-result-input"
              data-item-id="${i.id}"
              data-range="${UI.escapeHtml(range)}"
              value="${UI.escapeHtml(i.result_value || '')}"
              placeholder="${range ? 'e.g. ' + range : 'Result…'}"
              ${canEnter ? '' : 'disabled'}
            />
            ${range ? `<span class="lab-result-range">${UI.escapeHtml(range)}</span>` : ''}
            <span class="lab-result-flag" id="lab-item-flag-${i.id}" style="min-width:65px; display:inline-flex; align-items:center;">
              ${flag ? flag.badgeHtml : ''}
            </span>
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

    <!-- Notes Exchange Section -->
    <div class="detail-section" style="margin-top:4px;">
      <h4 style="margin-bottom:12px;">${Icons.render('info')} Notes</h4>

      <!-- Physician note (read-only for lab tech, always shown) -->
      <div style="margin-bottom:14px;">
        <div style="font-size:12px; font-weight:700; color:var(--color-primary); text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px;">
          ${Icons.render('stethoscope')} ${UI.escapeHtml(o.physician_full_name || physicianName(o.physician_id) || 'Physician')} (Ordering Physician)
        </div>
        ${o.physician_note
      ? `<div style="background:var(--color-info-light); border:1px solid var(--color-info); border-left:4px solid var(--color-info); border-radius:8px; padding:10px 14px; font-size:13.5px; color:var(--color-text); white-space:pre-wrap;">${UI.escapeHtml(o.physician_note)}</div>`
      : `<p class="text-muted" style="font-size:13px; font-style:italic;">No note from the physician.</p>`
    }
      </div>

      <!-- Technician note (editable if order not completed) -->
      <div>
        <div style="font-size:12px; font-weight:700; color:var(--color-accent); text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px;">
          ${Icons.render('flask')} Lab Technician Note
        </div>
        ${canEnter
      ? `<div style="display:flex; flex-direction:column; gap:8px;">
               <textarea id="od-tech-note" rows="2" placeholder="Add findings, observations, or a message to the physician…" style="resize:vertical; font-size:13.5px;">${UI.escapeHtml(o.technician_note || '')}</textarea>
               <button type="button" class="btn btn-secondary btn-sm" id="od-tech-note-save" style="align-self:flex-end;">${Icons.render('check')} Save Note</button>
             </div>`
      : (o.technician_note
        ? `<div style="background:var(--color-accent-light); border:1px solid var(--color-accent); border-left:4px solid var(--color-accent); border-radius:8px; padding:10px 14px; font-size:13.5px; color:var(--color-text); white-space:pre-wrap;">${UI.escapeHtml(o.technician_note)}</div>`
        : `<p class="text-muted" style="font-size:13px; font-style:italic;">No note from the lab technician.</p>`
      )
    }
      </div>
    </div>

    <div id="order-block-notice"></div>
  `;

  // Live range badge calculation as technician types
  document.querySelectorAll('.lab-result-input').forEach(input => {
    input.addEventListener('input', () => {
      const range = input.dataset.range;
      const itemId = input.dataset.itemId;
      const flagSlot = document.getElementById(`lab-item-flag-${itemId}`);
      if (flagSlot) {
        const flag = UI.checkLabResultRange(input.value, range);
        flagSlot.innerHTML = flag ? flag.badgeHtml : '';
      }
    });
  });

  // Wire technician note save button
  const techNoteSaveBtn = document.getElementById('od-tech-note-save');
  if (techNoteSaveBtn) {
    techNoteSaveBtn.addEventListener('click', async () => {
      const noteText = document.getElementById('od-tech-note').value.trim();
      techNoteSaveBtn.disabled = true;
      techNoteSaveBtn.innerHTML = '<span class="spinner"></span>';
      try {
        await Api.labOrders.updateNote(o.id, noteText);
        UI.toast('Lab technician note saved.');
        techNoteSaveBtn.disabled = false;
        techNoteSaveBtn.innerHTML = `${Icons.render('check')} Save Note`;
      } catch (e) {
        UI.toast(UI.errorMessage(e), 'danger');
        techNoteSaveBtn.disabled = false;
        techNoteSaveBtn.innerHTML = `${Icons.render('check')} Save Note`;
      }
    });
  }

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
  const deleteBtn = `<button class="btn btn-danger btn-sm" id="order-delete-btn" style="margin-right:auto; display:inline-flex; align-items:center; gap:4px;">${Icons.render('trash')} Delete Order</button>`;

  if (!next) {
    footer.innerHTML = `${deleteBtn}<span class="footer-note">This order is completed.</span>${printBtn}<button class="btn btn-secondary" id="order-close-modal">Close</button>`;
  } else {
    footer.innerHTML = `
      ${deleteBtn}
      ${printBtn}
      <button class="btn btn-secondary" id="order-close-modal">Close</button>
      <button class="btn btn-primary" id="order-advance">${NEXT_LAB_LABEL[next]}</button>
    `;
  }

  document.getElementById('order-close-modal').addEventListener('click', closeOrderDetail);
  const delBtn = document.getElementById('order-delete-btn');
  if (delBtn) delBtn.addEventListener('click', () => deleteLabOrder(o.id));
  const printButton = document.getElementById('order-print-btn');
  if (printButton) printButton.addEventListener('click', () => window.print());

  const advanceBtn = document.getElementById('order-advance');
  if (advanceBtn) {
    advanceBtn.addEventListener('click', async () => {
      advanceBtn.disabled = true;
      advanceBtn.innerHTML = '<span class="spinner"></span> Updating…';
      try {
        const noteEl = document.getElementById('od-tech-note');
        if (noteEl) {
          const noteText = noteEl.value.trim();
          if (noteText !== (o.technician_note || '')) {
            await Api.labOrders.updateNote(o.id, noteText);
          }
        }
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

window.deleteLabOrder = async function(id, event) {
  if (event) event.stopPropagation();
  if (!confirm('Are you sure you want to delete this lab order? It will also be removed from the patient visit record.')) return;
  try {
    await Api.labOrders.delete(id);
    UI.toast('Lab order deleted successfully.');
    closeOrderDetail();
    loadOrders();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  }
};


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

  setInterval(() => {
    const activeBackdrop = document.querySelector('.modal-backdrop.visible');
    if (!activeBackdrop) {
      loadOrders();
    }
  }, 8000);
}
init();
