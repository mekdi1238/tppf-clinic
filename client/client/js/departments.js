/* ===========================================================
   Departments & Positions Management
   -----------------------------------------------------------
   Super Admin only interface to manage company departments and
   job positions, ensuring cascaded synchronization across patients,
   candidates, and staff.
   =========================================================== */

Auth.requireAuth();
if (RoleGuard.blockIfNotAllowed('departments')) {
  throw new Error('redirecting');
}
if (!RoleGuard.has('system_administrator')) {
  window.location.replace('dashboard.html');
  throw new Error('unauthorized');
}

renderShell('departments');
setPageTitle('Departments & Positions');

// Render Icons
const iconSlots = {
  'plus-icon-slot': 'plus',
  'building-icon-slot': 'building',
  'employees-icon-slot': 'employees',
  'patients-icon-slot': 'patients',
  'search-icon-slot': 'search',
  'close-icon-create': 'close',
  'close-icon-edit': 'close',
  'close-icon-delete': 'close',
  'close-icon-pos-create': 'close',
  'close-icon-pos-edit': 'close',
  'close-icon-pos-delete': 'close',
};

for (const [id, icon] of Object.entries(iconSlots)) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = Icons.render(icon);
}

let departmentsData = [];
let searchQuery = '';

function escapeHtml(str) {
  return UI.escapeHtml(str || '');
}

async function loadDepartments() {
  const container = document.getElementById('departments-list-region');
  container.innerHTML = `
    <div style="text-align:center; padding:48px 20px; color:var(--color-text-muted);">
      <div class="spinner" style="margin:0 auto 12px auto;"></div>
      <div>Loading departments &amp; positions…</div>
    </div>
  `;

  try {
    departmentsData = await Api.departments.list();
    renderOverviewStats();
    renderDepartmentsList();
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state" style="padding:40px; text-align:center;">
        <p style="color:var(--color-danger); font-weight:600;">Failed to load departments: ${escapeHtml(UI.errorMessage(err))}</p>
        <button class="btn btn-secondary btn-sm" onclick="loadDepartments()">Retry</button>
      </div>
    `;
    UI.toast(UI.errorMessage(err), 'danger');
  }
}

function renderOverviewStats() {
  const totalDepts = departmentsData.length;
  const totalPositions = departmentsData.reduce((sum, d) => sum + (d.positions ? d.positions.length : 0), 0);
  const totalPatients = departmentsData.reduce((sum, d) => sum + (Number(d.patient_count) || 0), 0);

  document.getElementById('stat-total-depts').textContent = totalDepts;
  document.getElementById('stat-total-positions').textContent = totalPositions;
  document.getElementById('stat-total-patients').textContent = totalPatients;
}

function renderDepartmentsList() {
  const container = document.getElementById('departments-list-region');
  const countIndicator = document.getElementById('dept-count-indicator');

  const q = searchQuery.toLowerCase().trim();
  const filtered = departmentsData.filter(d => {
    if (!q) return true;
    if (d.name.toLowerCase().includes(q)) return true;
    if (d.positions && d.positions.some(p => p.name.toLowerCase().includes(q))) return true;
    return false;
  });

  if (countIndicator) {
    countIndicator.textContent = `${filtered.length} of ${departmentsData.length} department${departmentsData.length === 1 ? '' : 's'}`;
  }

  if (!filtered.length) {
    container.innerHTML = `
      <div class="panel" style="padding:48px 20px; text-align:center;">
        <div style="font-size:36px; margin-bottom:12px; opacity:0.6;">${Icons.render('building')}</div>
        <h3 style="margin:0 0 6px 0;">No departments found</h3>
        <p class="text-muted" style="margin:0 0 16px 0; font-size:13.5px;">
          ${q ? 'No departments or positions matched your search query.' : 'No departments have been configured yet.'}
        </p>
        ${q ? `<button class="btn btn-secondary btn-sm" onclick="document.getElementById('search-input').value=''; searchQuery=''; renderDepartmentsList();">Clear Search</button>` : `<button class="btn btn-primary btn-sm" onclick="openCreateDeptModal()">Create First Department</button>`}
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(dept => {
    const posList = dept.positions || [];
    const patientCount = Number(dept.patient_count) || 0;
    const regCount = Number(dept.registration_count) || 0;

    return `
      <div class="panel" style="margin-bottom:18px; border:1px solid var(--color-border); border-radius:var(--radius-md); background:var(--color-surface); box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        <!-- Department Card Header -->
        <div style="padding:16px 20px; border-bottom:1px solid var(--color-border); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; background:var(--color-bg-secondary, #F9FAFA); border-top-left-radius:var(--radius-md); border-top-right-radius:var(--radius-md);">
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:8px; background:var(--color-primary-light, #EBF5F4); color:var(--color-primary, #12817A);">
              ${Icons.render('building')}
            </div>
            <div>
              <div style="display:flex; align-items:center; gap:8px;">
                <h3 style="margin:0; font-size:16px; font-weight:700; color:var(--color-text-heading, #0A4F49);">${escapeHtml(dept.name)}</h3>
                <span class="badge badge-neutral" style="font-size:11px; padding:2px 7px;">Order: ${dept.display_order}</span>
              </div>
              <div style="display:flex; align-items:center; gap:12px; margin-top:4px; font-size:12px; color:var(--color-text-muted);">
                <span><strong>${posList.length}</strong> position${posList.length === 1 ? '' : 's'}</span>
                <span>•</span>
                <span><strong>${patientCount}</strong> active patient${patientCount === 1 ? '' : 's'}</span>
                <span>•</span>
                <span><strong>${regCount}</strong> candidate${regCount === 1 ? '' : 's'}</span>
              </div>
            </div>
          </div>

          <div style="display:flex; align-items:center; gap:8px;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="openAddPositionModal(${dept.id}, '${escapeHtml(dept.name)}')" style="font-size:12.5px; padding:5px 10px; display:inline-flex; align-items:center; gap:5px;">
              ${Icons.render('plus')} Add Position
            </button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="openEditDeptModal(${dept.id})" style="font-size:12.5px; padding:5px 10px; display:inline-flex; align-items:center; gap:5px;">
              ${Icons.render('edit')} Edit
            </button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="openDeleteDeptModal(${dept.id})" style="font-size:12.5px; padding:5px 10px; color:var(--color-danger, #C0483C); display:inline-flex; align-items:center; gap:5px;" title="Delete Department">
              ${Icons.render('trash')} Delete
            </button>
          </div>
        </div>

        <!-- Department Positions Region -->
        <div style="padding:16px 20px;">
          <div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--color-text-muted); margin-bottom:10px;">
            Department Positions (${posList.length})
          </div>

          ${posList.length === 0 ? `
            <p class="text-muted" style="margin:0; font-size:13px; font-style:italic;">
              No positions added yet. Click <strong>Add Position</strong> above to add job titles for this department.
            </p>
          ` : `
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:10px;">
              ${posList.map(pos => `
                <div style="display:flex; align-items:center; justify-content:space-between; background:var(--color-surface); border:1px solid var(--color-border); border-radius:6px; padding:8px 12px; font-size:13px; transition:border-color 0.15s ease;" onmouseover="this.style.borderColor='var(--color-primary)'" onmouseout="this.style.borderColor='var(--color-border)'">
                  <span style="font-weight:600; color:var(--color-text); word-break:break-word;">${escapeHtml(pos.name)}</span>
                  <div style="display:flex; align-items:center; gap:2px; margin-left:8px; flex-shrink:0;">
                    <button type="button" class="icon-btn" title="Edit Position" onclick="openEditPositionModal(${dept.id}, '${escapeHtml(dept.name)}', ${pos.id}, '${escapeHtml(pos.name)}', ${pos.display_order || 0})" style="padding:4px; width:26px; height:26px;">
                      ${Icons.render('edit')}
                    </button>
                    <button type="button" class="icon-btn" title="Delete Position" onclick="openDeletePositionModal(${dept.id}, '${escapeHtml(dept.name)}', ${pos.id}, '${escapeHtml(pos.name)}')" style="padding:4px; width:26px; height:26px; color:var(--color-danger, #C0483C);">
                      ${Icons.render('trash')}
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;
  }).join('');
}

// -------------------------------------------------------------
// Search input debounce
// -------------------------------------------------------------
const searchInput = document.getElementById('search-input');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderDepartmentsList();
  });
}

// -------------------------------------------------------------
// Modal 1: Create Department
// -------------------------------------------------------------
function openCreateDeptModal() {
  document.getElementById('dc-name').value = '';
  document.getElementById('dc-order').value = departmentsData.length + 1;
  document.getElementById('dc-positions').value = '';
  document.getElementById('dept-create-backdrop').classList.add('visible');
  document.getElementById('dc-name').focus();
}

function closeCreateDeptModal() {
  document.getElementById('dept-create-backdrop').classList.remove('visible');
}

document.getElementById('new-dept-btn').addEventListener('click', openCreateDeptModal);
document.getElementById('dept-create-close').addEventListener('click', closeCreateDeptModal);
document.getElementById('dept-create-cancel').addEventListener('click', closeCreateDeptModal);

document.getElementById('dept-create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('dc-name').value.trim();
  const display_order = parseInt(document.getElementById('dc-order').value, 10) || 0;
  const positionsRaw = document.getElementById('dc-positions').value;
  const positions = positionsRaw
    .split('\n')
    .map(p => p.trim())
    .filter(Boolean);

  const submitBtn = document.getElementById('dept-create-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating…';

  try {
    const created = await Api.departments.create({ name, display_order, positions });
    UI.toast(`Department '${created.name}' created successfully.`);
    closeCreateDeptModal();
    await loadDepartments();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Department';
  }
});

// -------------------------------------------------------------
// Modal 2: Edit Department
// -------------------------------------------------------------
function openEditDeptModal(deptId) {
  const dept = departmentsData.find(d => d.id === deptId);
  if (!dept) return;

  document.getElementById('de-id').value = dept.id;
  document.getElementById('de-name').value = dept.name;
  document.getElementById('de-order').value = dept.display_order;
  document.getElementById('de-subtitle').textContent = `Editing department '${dept.name}'`;
  document.getElementById('dept-edit-backdrop').classList.add('visible');
  document.getElementById('de-name').focus();
}

function closeEditDeptModal() {
  document.getElementById('dept-edit-backdrop').classList.remove('visible');
}

document.getElementById('dept-edit-close').addEventListener('click', closeEditDeptModal);
document.getElementById('dept-edit-cancel').addEventListener('click', closeEditDeptModal);

document.getElementById('dept-edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const deptId = document.getElementById('de-id').value;
  const name = document.getElementById('de-name').value.trim();
  const display_order = parseInt(document.getElementById('de-order').value, 10) || 0;

  const submitBtn = document.getElementById('dept-edit-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';

  try {
    const updated = await Api.departments.update(deptId, { name, display_order });
    UI.toast(`Department updated to '${updated.name}' and all matching records synced.`);
    closeEditDeptModal();
    await loadDepartments();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Changes';
  }
});

// -------------------------------------------------------------
// Modal 3: Delete Department
// -------------------------------------------------------------
function openDeleteDeptModal(deptId) {
  const dept = departmentsData.find(d => d.id === deptId);
  if (!dept) return;

  const patientCount = Number(dept.patient_count) || 0;
  const regCount = Number(dept.registration_count) || 0;

  document.getElementById('dd-id').value = dept.id;
  document.getElementById('dd-subtitle').textContent = `Deleting '${dept.name}'`;

  const warningMsg = document.getElementById('dd-warning-msg');
  const reassignWrap = document.getElementById('dd-reassign-wrap');
  const reassignSelect = document.getElementById('dd-reassign-select');

  if (patientCount > 0 || regCount > 0) {
    warningMsg.innerHTML = `
      <strong>Caution:</strong> This department currently has <strong>${patientCount}</strong> patient(s) and <strong>${regCount}</strong> candidate registration(s) assigned to it.<br/>
      Please select a department to move them to before deleting.
    `;
    reassignWrap.style.display = 'block';
    reassignSelect.required = true;

    // Populate other departments
    const otherDepts = departmentsData.filter(d => d.id !== deptId);
    reassignSelect.innerHTML = `<option value="">Select target department…</option>` +
      otherDepts.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
  } else {
    warningMsg.textContent = `Are you sure you want to delete '${dept.name}'? This action cannot be undone.`;
    reassignWrap.style.display = 'none';
    reassignSelect.required = false;
  }

  document.getElementById('dept-delete-backdrop').classList.add('visible');
}

function closeDeleteDeptModal() {
  document.getElementById('dept-delete-backdrop').classList.remove('visible');
}

document.getElementById('dept-delete-close').addEventListener('click', closeDeleteDeptModal);
document.getElementById('dept-delete-cancel').addEventListener('click', closeDeleteDeptModal);

document.getElementById('dept-delete-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const deptId = document.getElementById('dd-id').value;
  const reassignSelect = document.getElementById('dd-reassign-select');
  const reassign_to_id = reassignSelect.value ? parseInt(reassignSelect.value, 10) : null;

  const submitBtn = document.getElementById('dept-delete-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Deleting…';

  try {
    await Api.departments.delete(deptId, { reassign_to_id });
    UI.toast(`Department deleted successfully.`);
    closeDeleteDeptModal();
    await loadDepartments();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Delete Department';
  }
});

// -------------------------------------------------------------
// Modal 4: Add Position
// -------------------------------------------------------------
function openAddPositionModal(deptId, deptName) {
  document.getElementById('pc-dept-id').value = deptId;
  document.getElementById('pc-name').value = '';
  document.getElementById('pc-order').value = 0;
  document.getElementById('pc-subtitle').textContent = `Add position to '${deptName}'`;
  document.getElementById('pos-create-backdrop').classList.add('visible');
  document.getElementById('pc-name').focus();
}

function closeAddPositionModal() {
  document.getElementById('pos-create-backdrop').classList.remove('visible');
}

document.getElementById('pos-create-close').addEventListener('click', closeAddPositionModal);
document.getElementById('pos-create-cancel').addEventListener('click', closeAddPositionModal);

document.getElementById('pos-create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const deptId = document.getElementById('pc-dept-id').value;
  const name = document.getElementById('pc-name').value.trim();
  const display_order = parseInt(document.getElementById('pc-order').value, 10) || 0;

  const submitBtn = document.getElementById('pos-create-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Adding…';

  try {
    await Api.departments.addPosition(deptId, { name, display_order });
    UI.toast(`Position '${name}' added successfully.`);
    closeAddPositionModal();
    await loadDepartments();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Add Position';
  }
});

// -------------------------------------------------------------
// Modal 5: Edit Position
// -------------------------------------------------------------
function openEditPositionModal(deptId, deptName, posId, posName, displayOrder) {
  document.getElementById('pe-dept-id').value = deptId;
  document.getElementById('pe-pos-id').value = posId;
  document.getElementById('pe-name').value = posName;
  document.getElementById('pe-order').value = displayOrder || 0;
  document.getElementById('pe-subtitle').textContent = `Edit position in '${deptName}'`;
  document.getElementById('pos-edit-backdrop').classList.add('visible');
  document.getElementById('pe-name').focus();
}

function closeEditPositionModal() {
  document.getElementById('pos-edit-backdrop').classList.remove('visible');
}

document.getElementById('pos-edit-close').addEventListener('click', closeEditPositionModal);
document.getElementById('pos-edit-cancel').addEventListener('click', closeEditPositionModal);

document.getElementById('pos-edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const deptId = document.getElementById('pe-dept-id').value;
  const posId = document.getElementById('pe-pos-id').value;
  const name = document.getElementById('pe-name').value.trim();
  const display_order = parseInt(document.getElementById('pe-order').value, 10) || 0;

  const submitBtn = document.getElementById('pos-edit-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';

  try {
    await Api.departments.updatePosition(deptId, posId, { name, display_order });
    UI.toast(`Position updated to '${name}' and associated records updated.`);
    closeEditPositionModal();
    await loadDepartments();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Changes';
  }
});

// -------------------------------------------------------------
// Modal 6: Delete Position
// -------------------------------------------------------------
function openDeletePositionModal(deptId, deptName, posId, posName) {
  document.getElementById('pd-dept-id').value = deptId;
  document.getElementById('pd-pos-id').value = posId;
  document.getElementById('pd-subtitle').textContent = `Department: '${deptName}'`;
  document.getElementById('pd-msg').textContent = `Are you sure you want to remove position '${posName}' from '${deptName}'?`;
  document.getElementById('pos-delete-backdrop').classList.add('visible');
}

function closeDeletePositionModal() {
  document.getElementById('pos-delete-backdrop').classList.remove('visible');
}

document.getElementById('pos-delete-close').addEventListener('click', closeDeletePositionModal);
document.getElementById('pos-delete-cancel').addEventListener('click', closeDeletePositionModal);

document.getElementById('pos-delete-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const deptId = document.getElementById('pd-dept-id').value;
  const posId = document.getElementById('pd-pos-id').value;

  const submitBtn = document.getElementById('pos-delete-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Deleting…';

  try {
    await Api.departments.deletePosition(deptId, posId);
    UI.toast(`Position deleted successfully.`);
    closeDeletePositionModal();
    await loadDepartments();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Delete Position';
  }
});

// Window click to close modals
window.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.classList.remove('visible');
  }
});

// Expose handlers for inline HTML onclick attributes
window.openCreateDeptModal = openCreateDeptModal;
window.openEditDeptModal = openEditDeptModal;
window.openDeleteDeptModal = openDeleteDeptModal;
window.openAddPositionModal = openAddPositionModal;
window.openEditPositionModal = openEditPositionModal;
window.openDeletePositionModal = openDeletePositionModal;
window.loadDepartments = loadDepartments;

// Initialize
loadDepartments();
