/* ===========================================================
   Laboratory page logic
   -----------------------------------------------------------
   Lab orders are mock-only until the real backend route exists
   (see BACKEND_HANDOFF.md). Visits/physicians come from the
   real API; this page joins them client-side.
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
      eligibleVisits.map(v => `<option value="${v.id}" data-physician="${v.physician_id}">${UI.escapeHtml(v.patient.full_name)} — ${v.patient.patient_code} · ${UI.formatDate(v.visit_date)}</option>`).join('');
  }

  const panels = [...new Set(catalogCache.map(t => t.panel))];
  document.getElementById('of-tests-list').innerHTML = panels.map(panel => `
    <div style="margin-bottom:8px;">
      <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:var(--color-text-faint); margin-bottom:4px;">${UI.escapeHtml(panel)}</div>
      ${catalogCache.filter(t => t.panel === panel).map(t => `
        <label style="display:flex; align-items:center; gap:8px; font-size:13px; padding:4px 0; cursor:pointer;">
          <input type="checkbox" name="of-test" value="${t.id}" />
          <span>${UI.escapeHtml(t.display_name)} <span class="cell-code">${UI.escapeHtml(t.code)}</span></span>
        </label>
      `).join('')}
    </div>
  `).join('');
}

document.getElementById('of-visit').addEventListener('change', (e) => {
  const opt = e.target.selectedOptions[0];
  if (opt && opt.dataset.physician) {
    document.getElementById('of-physician').value = opt.dataset.physician;
  }
});

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

// ---------- New order ----------
function openOrderForm(visitId = null) {
  if (!eligibleVisits.length) {
    UI.toast('No open visits are eligible for a lab order.', 'danger');
    return;
  }
  document.getElementById('order-form').reset();
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

// ---------- Detail ----------
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

function renderOrderDetail(o) {
  document.getElementById('od-name').textContent = o.patient_name;
  document.getElementById('od-sub').textContent = `${o.patient_code} · ordered ${UI.formatDateTime(o.order_date)} by ${UI.escapeHtml(physicianName(o.physician_id))}`;

  const canEnter = o.status !== 'completed';

  document.getElementById('order-detail-body').innerHTML = `
    <div style="margin-bottom:14px;">${UI.labOrderStatusBadge(o.status)}</div>
    <div class="detail-section">
      <h4>Test results</h4>
      <div class="table-wrap" style="box-shadow:none;">
        <table class="data-table">
          <thead><tr><th>Test</th><th>Result</th><th></th></tr></thead>
          <tbody>
            ${o.items.map(i => `
              <tr>
                <td class="cell-primary">${i.test ? UI.escapeHtml(i.test.display_name) : 'Unknown test'} <span class="cell-code">${i.test ? UI.escapeHtml(i.test.code) : ''}</span></td>
                <td><input type="text" class="lab-result-input" data-item-id="${i.id}" value="${UI.escapeHtml(i.result_value) || ''}" placeholder="Enter result…" ${canEnter ? '' : 'disabled'} style="width:100%; border:1px solid var(--color-border-strong); border-radius:6px; padding:6px 9px; font-size:13px;" /></td>
                <td id="lab-item-action-${i.id}">${canEnter ? `<button type="button" class="btn btn-secondary btn-sm" data-save-item="${i.id}">Save</button>` : (i.entered_at ? `<span class="text-muted" style="font-size:11.5px;">${UI.formatDateTime(i.entered_at)}</span>` : '')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div id="order-block-notice"></div>
  `;

  document.getElementById('order-detail-body').querySelectorAll('[data-save-item]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const itemId = btn.dataset.saveItem;
      const input = document.querySelector(`.lab-result-input[data-item-id="${itemId}"]`);
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>';
      try {
        const updatedItem = await Api.labOrders.updateItem(o.id, itemId, input.value.trim());
        UI.toast('Result saved.');
        
        // Update just this row to avoid wiping out other unsaved inputs in the modal
        const actionCell = document.getElementById(`lab-item-action-${itemId}`);
        if (actionCell && updatedItem.entered_at) {
          actionCell.innerHTML = `<span class="text-muted" style="font-size:11.5px;">${UI.formatDateTime(updatedItem.entered_at)}</span>`;
        } else {
          btn.disabled = false;
          btn.textContent = 'Save';
        }
        
        // Still reload the list in the background so the table row is up to date
        loadOrders();
      } catch (e) {
        UI.toast(UI.errorMessage(e), 'danger');
        btn.disabled = false;
        btn.textContent = 'Save';
      }
    });
  });

  const footer = document.getElementById('order-detail-footer');
  const next = NEXT_LAB_STATUS[o.status];
  const printBtn = o.status === 'completed' ? `<button class="btn btn-secondary" id="order-print-btn">${Icons.render('reports')} Print Report</button>` : '';
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
