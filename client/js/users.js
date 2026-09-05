/* ===========================================================
   Users & Roles Controller (users.js)
   -----------------------------------------------------------
   Manages user accounts, fine-tuned granular CRUD permissions,
   and customizable predefined system role defaults.
   =========================================================== */

Auth.requireAuth();
if (RoleGuard.blockIfNotAllowed('users')) { throw new Error('redirecting'); }
renderShell('users');
setPageTitle('Users & Roles');

// Icon setup
const iconSlots = {
  'search-icon-slot': 'search',
  'plus-icon-slot': 'plus',
  'tab-users-icon': 'users',
  'tab-roles-icon': 'shield',
  'user-modal-close': 'close',
  'user-edit-close': 'close',
  'role-edit-close': 'close',
};

for (const [id, icon] of Object.entries(iconSlots)) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = Icons.render(icon);
}

let physiciansCache = [];
let rolesCache = [];
let departmentsCache = [];
let usersCache = [];
let editingUserId = null;
let currentTab = 'users';

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// -------------------------------------------------------------
// Tab Switching: Users vs Predefined Roles
// -------------------------------------------------------------
const tabBtnUsers = document.getElementById('tab-btn-users');
const tabBtnRoles = document.getElementById('tab-btn-roles');
const secUsersView = document.getElementById('section-users-view');
const secRolesView = document.getElementById('section-roles-view');

function switchTab(tab) {
  currentTab = tab;
  if (tab === 'users') {
    tabBtnUsers.style.color = 'var(--color-primary)';
    tabBtnUsers.style.borderBottom = '2px solid var(--color-primary)';
    tabBtnUsers.style.fontWeight = '700';

    tabBtnRoles.style.color = 'var(--color-text-muted)';
    tabBtnRoles.style.borderBottom = 'none';
    tabBtnRoles.style.fontWeight = '600';

    secUsersView.style.display = 'block';
    secRolesView.style.display = 'none';
  } else {
    tabBtnRoles.style.color = 'var(--color-primary)';
    tabBtnRoles.style.borderBottom = '2px solid var(--color-primary)';
    tabBtnRoles.style.fontWeight = '700';

    tabBtnUsers.style.color = 'var(--color-text-muted)';
    tabBtnUsers.style.borderBottom = 'none';
    tabBtnUsers.style.fontWeight = '600';

    secUsersView.style.display = 'none';
    secRolesView.style.display = 'block';
    renderRolesTable();
  }
}

tabBtnUsers.addEventListener('click', () => switchTab('users'));
tabBtnRoles.addEventListener('click', () => switchTab('roles'));

// -------------------------------------------------------------
// Load Lookups (Physicians, Roles, Departments)
// -------------------------------------------------------------
async function loadLookups() {
  try {
    const [physicians, roles, depts] = await Promise.all([
      Api.physicians.list(),
      Api.roles.list(),
      Api.departments.list().catch(() => []),
    ]);

    physiciansCache = physicians;
    rolesCache = roles;
    departmentsCache = depts;

    const physOptions = `<option value="">None</option>` +
      physiciansCache.map(p => `<option value="${p.id}">${UI.escapeHtml(p.full_name)}</option>`).join('');
    document.getElementById('uf-physician').innerHTML = physOptions;
    document.getElementById('ue-physician').innerHTML = physOptions;

    const deptOptions = `<option value="">Select department…</option>` +
      departmentsCache.map(d => `<option value="${UI.escapeHtml(d.name)}">${UI.escapeHtml(d.name)}</option>`).join('');
    const ufDept = document.getElementById('uf-department');
    const ueDept = document.getElementById('ue-department');
    if (ufDept) ufDept.innerHTML = deptOptions;
    if (ueDept) ueDept.innerHTML = deptOptions;

    const roleBadge = document.getElementById('role-count-badge');
    if (roleBadge) roleBadge.textContent = rolesCache.length;

    renderRoleCheckboxes('uf-roles-list', 'uf-permissions-matrix', 'uf-dept-wrap');
  } catch (err) {
    console.error('Failed to load lookups in users page', err);
  }
}

function renderRoleCheckboxes(containerId, matrixContainerId, deptWrapId, checkedIds = []) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = rolesCache.map(r => `
    <label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer; user-select:none; margin:0;">
      <input type="checkbox" class="role-checkbox" value="${r.id}" ${checkedIds.includes(r.id) ? 'checked' : ''} onchange="handleRoleCheckboxChange('${containerId}', '${matrixContainerId}', '${deptWrapId}')" />
      <span style="font-weight:600;">${UI.escapeHtml(r.display_name || r.name)}</span>
    </label>
  `).join('');
}

function handleRoleCheckboxChange(rolesContainerId, matrixContainerId, deptWrapId) {
  const rolesContainer = document.getElementById(rolesContainerId);
  if (!rolesContainer) return;

  const selectedRoleIds = Array.from(rolesContainer.querySelectorAll('input.role-checkbox:checked'))
    .map(cb => parseInt(cb.value, 10));

  // Check if Department HR is selected
  const deptHrRole = rolesCache.find(r => r.name === 'department_hr');
  const deptWrap = document.getElementById(deptWrapId);
  if (deptWrap && deptHrRole) {
    deptWrap.style.display = selectedRoleIds.includes(deptHrRole.id) ? 'block' : 'none';
  }

  // Read current overrides to preserve manual tweaks if any
  const currentOverrides = Permissions.extractCustomOverrides(matrixContainerId);

  // Re-render matrix grid with newly merged role defaults
  Permissions.renderMatrixGrid(matrixContainerId, {
    selectedRoleIds,
    customOverrides: currentOverrides,
    dynamicRoles: rolesCache,
  });
}

// -------------------------------------------------------------
// Load Users
// -------------------------------------------------------------
async function loadUsers() {
  const search = document.getElementById('search-input').value.trim();
  const status = document.getElementById('status-filter').value;
  try {
    usersCache = await Api.users.list({ search, status });
    const userBadge = document.getElementById('user-count-badge');
    if (userBadge) userBadge.textContent = usersCache.length;
    renderTable(usersCache);
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

function renderTable(list) {
  const region = document.getElementById('users-table-region');
  if (!list.length) {
    region.innerHTML = `
      <div class="table-wrap">
        <div class="empty-state">
          <div class="empty-icon">${Icons.render('users')}</div>
          <h3>No users found</h3>
          <p>Try a different search or filter, or create a new user account.</p>
          <button class="btn btn-primary" onclick="openUserForm()">${Icons.render('plus')} New User</button>
        </div>
      </div>`;
    return;
  }
  region.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Full Name</th>
            <th>Assigned Roles</th>
            <th>Assigned Dept</th>
            <th>Linked Physician</th>
            <th>Custom Overrides</th>
            <th>Status</th>
            <th>Last Login</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(u => {
            const overrideCount = Object.keys(u.custom_permissions || {}).length;
            return `
              <tr>
                <td class="cell-primary" style="cursor:pointer;" onclick="openUserEdit('${u.id}')">
                  <div style="display:flex; align-items:center; gap:8px;">
                    ${UI.avatar(u.full_name || u.username, u.photo_url, 'width:30px; height:30px; font-size:11px;')}
                    <span style="font-weight:700;">${UI.escapeHtml(u.username)}</span>
                  </div>
                </td>
                <td class="cell-muted">${UI.escapeHtml(u.full_name) || '—'}</td>
                <td>${u.roles.map(r => `<span class="badge badge-primary" style="margin-right:4px;">${UI.escapeHtml(r.display_name || r.name)}</span>`).join('')}</td>
                <td class="cell-muted">${u.department ? UI.escapeHtml(u.department) : '—'}</td>
                <td class="cell-muted">${u.physician_id ? UI.escapeHtml((physiciansCache.find(p => String(p.id) === String(u.physician_id)) || {}).full_name || '—') : '—'}</td>
                <td>
                  ${overrideCount > 0
                    ? `<span class="badge badge-warning" style="font-weight:600;" title="${overrideCount} permission(s) fine-tuned">${overrideCount} override${overrideCount > 1 ? 's' : ''}</span>`
                    : `<span class="badge badge-neutral" style="opacity:0.7;">Role Default</span>`}
                </td>
                <td>${u.is_active ? `<span class="badge badge-success"><span class="badge-dot"></span>Active</span>` : `<span class="badge badge-neutral"><span class="badge-dot"></span>Inactive</span>`}</td>
                <td class="cell-muted">${u.last_login_at ? UI.formatDateTime(u.last_login_at) : 'Never'}</td>
                <td style="white-space:nowrap; text-align:right;">
                  <button class="btn btn-secondary btn-sm" title="Edit User & Permissions" onclick="openUserEdit('${u.id}')" style="padding:4px 8px; font-size:12px; display:inline-flex; align-items:center; gap:4px;">
                    ${Icons.render('edit')} Edit
                  </button>
                  ${u.username !== 'admin' ? `
                    <button class="btn btn-ghost btn-sm" title="Delete User" style="color:var(--color-danger); margin-left:4px; padding:4px 6px;" onclick="deleteUserDirect('${u.id}', '${UI.escapeHtml(u.username)}')">
                      ${Icons.render('trash')}
                    </button>
                  ` : ''}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// -------------------------------------------------------------
// Render Predefined System Roles Table
// -------------------------------------------------------------
function renderRolesTable() {
  const region = document.getElementById('roles-table-region');
  if (!region) return;

  region.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:200px;">Role Name</th>
            <th>Description</th>
            <th style="width:160px; text-align:center;">Default Permissions</th>
            <th style="width:140px; text-align:center;">Assigned Users</th>
            <th style="width:140px; text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rolesCache.map(r => {
            const perms = Array.isArray(r.default_permissions)
              ? r.default_permissions
              : (typeof r.default_permissions === 'string' ? JSON.parse(r.default_permissions || '[]') : []);

            const assignedCount = usersCache.filter(u => (u.roles || []).some(ur => ur.id === r.id || ur.name === r.name)).length;

            return `
              <tr>
                <td>
                  <div style="font-weight:700; color:var(--color-text-heading);">${UI.escapeHtml(r.display_name || r.name)}</div>
                  <div style="font-size:11px; color:var(--color-text-muted); font-family:monospace;">key: ${UI.escapeHtml(r.name)}</div>
                </td>
                <td class="text-muted" style="font-size:13px;">${UI.escapeHtml(r.description || 'Predefined system role.')}</td>
                <td style="text-align:center;">
                  <span class="badge badge-info" style="font-weight:700;">
                    ${perms.length} permission${perms.length === 1 ? '' : 's'}
                  </span>
                </td>
                <td style="text-align:center; font-weight:600;">
                  ${assignedCount} user${assignedCount === 1 ? '' : 's'}
                </td>
                <td style="text-align:right;">
                  <button type="button" class="btn btn-secondary btn-sm" onclick="openRoleEdit(${r.id})" style="display:inline-flex; align-items:center; gap:5px;">
                    ${Icons.render('edit')} Edit Defaults
                  </button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// -------------------------------------------------------------
// Modal 1: New User
// -------------------------------------------------------------
function openUserForm() {
  document.getElementById('user-form').reset();
  const photoContainer = document.getElementById('uf-photo-container');
  if (photoContainer && typeof CameraWidget !== 'undefined') {
    photoContainer.innerHTML = CameraWidget.renderPickerHtml({ hiddenInputId: 'uf-photo-url', previewImgId: 'uf-photo-preview' });
    CameraWidget.bindEvents({ hiddenInputId: 'uf-photo-url', previewImgId: 'uf-photo-preview' });
  }

  document.getElementById('uf-dept-wrap').style.display = 'none';
  renderRoleCheckboxes('uf-roles-list', 'uf-permissions-matrix', 'uf-dept-wrap', []);

  // Render initial matrix with empty selection
  Permissions.renderMatrixGrid('uf-permissions-matrix', {
    selectedRoleIds: [],
    customOverrides: {},
    dynamicRoles: rolesCache,
  });

  document.getElementById('user-modal-backdrop').classList.add('visible');
  document.getElementById('uf-username').focus();
}

function closeUserForm() {
  document.getElementById('user-modal-backdrop').classList.remove('visible');
}

document.getElementById('new-user-btn').addEventListener('click', openUserForm);
document.getElementById('user-modal-close').addEventListener('click', closeUserForm);
document.getElementById('user-form-cancel').addEventListener('click', closeUserForm);

document.getElementById('user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('uf-username').value.trim();
  const password = document.getElementById('uf-password').value;
  const fullName = document.getElementById('uf-full-name').value.trim();
  const physicianId = document.getElementById('uf-physician').value || null;
  const department = document.getElementById('uf-department').value || null;

  const roleCheckboxes = document.querySelectorAll('#uf-roles-list .role-checkbox:checked');
  const roleIds = Array.from(roleCheckboxes).map(cb => parseInt(cb.value, 10));

  if (!roleIds.length) {
    UI.toast('Please assign at least one role.', 'danger');
    return;
  }

  // Extract explicit fine-tune overrides from matrix
  const customPermissions = Permissions.extractCustomOverrides('uf-permissions-matrix');

  const btn = document.getElementById('user-form-submit');
  btn.disabled = true;
  btn.textContent = 'Creating User…';

  try {
    await Api.users.create({
      username,
      password,
      full_name: fullName,
      physician_id: physicianId ? parseInt(physicianId, 10) : null,
      department,
      role_ids: roleIds,
      custom_permissions: customPermissions,
    });

    UI.toast(`User '${username}' created successfully.`);
    closeUserForm();
    await loadUsers();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create User';
  }
});

// -------------------------------------------------------------
// Modal 2: Edit User
// -------------------------------------------------------------
async function openUserEdit(userId) {
  editingUserId = userId;
  const u = usersCache.find(x => String(x.id) === String(userId));
  if (!u) return;

  document.getElementById('ue-title').textContent = `Edit User: ${u.username}`;
  document.getElementById('ue-sub').textContent = u.full_name || 'Staff account';
  document.getElementById('ue-username').value = u.username;
  document.getElementById('ue-password').value = '';
  document.getElementById('ue-full-name').value = u.full_name || '';
  document.getElementById('ue-physician').value = u.physician_id || '';
  document.getElementById('ue-department').value = u.department || '';

  const selectedRoleIds = (u.roles || []).map(r => r.id);
  const deptHrRole = rolesCache.find(r => r.name === 'department_hr');
  document.getElementById('ue-dept-wrap').style.display = (deptHrRole && selectedRoleIds.includes(deptHrRole.id)) ? 'block' : 'none';

  renderRoleCheckboxes('ue-roles-list', 'ue-permissions-matrix', 'ue-dept-wrap', selectedRoleIds);

  // Render Matrix Table with existing overrides
  Permissions.renderMatrixGrid('ue-permissions-matrix', {
    selectedRoleIds,
    customOverrides: u.custom_permissions || {},
    dynamicRoles: rolesCache,
  });

  const toggleBtn = document.getElementById('ue-toggle-active-btn');
  toggleBtn.textContent = u.is_active ? 'Deactivate Account' : 'Activate Account';
  toggleBtn.onclick = () => toggleUserActive(u);

  const deleteBtn = document.getElementById('ue-delete-btn');
  deleteBtn.style.display = (u.username === 'admin') ? 'none' : 'inline-block';
  deleteBtn.onclick = () => deleteUserDirect(u.id, u.username);

  document.getElementById('user-edit-backdrop').classList.add('visible');
}

function closeUserEdit() {
  document.getElementById('user-edit-backdrop').classList.remove('visible');
  editingUserId = null;
}

document.getElementById('user-edit-close').addEventListener('click', closeUserEdit);
document.getElementById('user-edit-cancel').addEventListener('click', closeUserEdit);

document.getElementById('user-edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!editingUserId) return;

  const username = document.getElementById('ue-username').value.trim();
  const password = document.getElementById('ue-password').value;
  const fullName = document.getElementById('ue-full-name').value.trim();
  const physicianId = document.getElementById('ue-physician').value || null;
  const department = document.getElementById('ue-department').value || null;

  const roleCheckboxes = document.querySelectorAll('#ue-roles-list .role-checkbox:checked');
  const roleIds = Array.from(roleCheckboxes).map(cb => parseInt(cb.value, 10));

  if (!roleIds.length) {
    UI.toast('Assign at least one role.', 'danger');
    return;
  }

  // Extract overrides
  const customPermissions = Permissions.extractCustomOverrides('ue-permissions-matrix');

  const payload = {
    username,
    full_name: fullName,
    physician_id: physicianId ? parseInt(physicianId, 10) : null,
    department,
    role_ids: roleIds,
    custom_permissions: customPermissions,
  };
  if (password && password.trim()) payload.password = password;

  try {
    await Api.users.update(editingUserId, payload);
    UI.toast('User updated successfully.');
    closeUserEdit();
    await loadUsers();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  }
});

async function toggleUserActive(user) {
  const newStatus = !user.is_active;
  if (!confirm(`Are you sure you want to ${newStatus ? 'activate' : 'deactivate'} user '${user.username}'?`)) return;
  try {
    await Api.users.update(user.id, { is_active: newStatus });
    UI.toast(`User '${user.username}' is now ${newStatus ? 'active' : 'inactive'}.`);
    closeUserEdit();
    await loadUsers();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  }
}

async function deleteUserDirect(id, username) {
  if (!confirm(`Are you sure you want to permanently delete user account '${username}'? This action cannot be undone.`)) return;
  try {
    await Api.users.delete(id);
    UI.toast(`User account '${username}' deleted.`);
    closeUserEdit();
    await loadUsers();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  }
}

// -------------------------------------------------------------
// Modal 3: Edit Predefined Role Defaults
// -------------------------------------------------------------
function openRoleEdit(roleId) {
  const role = rolesCache.find(r => r.id === roleId);
  if (!role) return;

  document.getElementById('re-role-id').value = role.id;
  document.getElementById('re-display-name').value = role.display_name || role.name;
  document.getElementById('re-description').value = role.description || '';
  document.getElementById('re-title').textContent = `Edit Predefined Role: ${role.display_name || role.name}`;

  const currentPerms = Array.isArray(role.default_permissions)
    ? role.default_permissions
    : (typeof role.default_permissions === 'string' ? JSON.parse(role.default_permissions || '[]') : []);

  Permissions.renderMatrixGrid('role-edit-matrix', {
    isRoleEditMode: true,
    initialPermissions: currentPerms,
    dynamicRoles: rolesCache,
  });

  document.getElementById('role-edit-backdrop').classList.add('visible');
}

function closeRoleEdit() {
  document.getElementById('role-edit-backdrop').classList.remove('visible');
}

document.getElementById('role-edit-close').addEventListener('click', closeRoleEdit);
document.getElementById('role-edit-cancel').addEventListener('click', closeRoleEdit);

document.getElementById('role-edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const roleId = document.getElementById('re-role-id').value;
  const displayName = document.getElementById('re-display-name').value.trim();
  const description = document.getElementById('re-description').value.trim();

  // Extract all checked permissions from matrix
  const defaultPermissions = Permissions.extractAllCheckedPermissions('role-edit-matrix');

  const btn = document.getElementById('role-edit-submit');
  btn.disabled = true;
  btn.textContent = 'Saving Role Defaults…';

  try {
    await Api.roles.update(roleId, {
      display_name: displayName,
      description,
      default_permissions: defaultPermissions,
    });

    UI.toast(`Predefined role '${displayName}' defaults updated successfully. New users assigned this role will automatically receive these permissions.`);
    closeRoleEdit();
    await loadLookups();
    if (currentTab === 'roles') renderRolesTable();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Role Defaults';
  }
});

// Window click backdrop dismissal
window.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.classList.remove('visible');
  }
});

// Expose handlers globally
window.openUserForm = openUserForm;
window.openUserEdit = openUserEdit;
window.openRoleEdit = openRoleEdit;
window.deleteUserDirect = deleteUserDirect;
window.handleRoleCheckboxChange = handleRoleCheckboxChange;

// Search listener
document.getElementById('search-input').addEventListener('input', debounce(loadUsers, 250));
document.getElementById('status-filter').addEventListener('change', loadUsers);

// Initialize
async function init() {
  await loadLookups();
  await loadUsers();
}
init();
