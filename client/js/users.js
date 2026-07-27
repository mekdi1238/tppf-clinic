/* ===========================================================
   Users & Roles page logic
   =========================================================== */

Auth.requireAuth();
if (RoleGuard.blockIfNotAllowed('users')) { throw new Error('redirecting'); }
renderShell('users');
setPageTitle('Users & Roles');

document.getElementById('search-icon-slot').innerHTML = Icons.render('search');
document.getElementById('plus-icon-slot').innerHTML = Icons.render('plus');
document.getElementById('user-modal-close').innerHTML = Icons.render('close');
document.getElementById('user-edit-close').innerHTML = Icons.render('close');

let physiciansCache = [];
let rolesCache = [];
let usersCache = [];
let editingUserId = null;

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function loadLookups() {
  [physiciansCache, rolesCache] = await Promise.all([Api.physicians.list(), Api.roles.list()]);

  const physOptions = `<option value="">None</option>` +
    physiciansCache.map(p => `<option value="${p.id}">${UI.escapeHtml(p.full_name)}</option>`).join('');
  document.getElementById('uf-physician').innerHTML = physOptions;
  document.getElementById('ue-physician').innerHTML = physOptions;

  const rolesHtml = (checkedIds) => rolesCache.map(r => `
    <label style="display:flex; align-items:center; gap:8px; font-size:13px; padding:4px 0; cursor:pointer;">
      <input type="checkbox" class="role-checkbox" value="${r.id}" ${checkedIds && checkedIds.includes(r.id) ? 'checked' : ''} />
      <span>${UI.escapeHtml(r.display_name)}</span>
    </label>
  `).join('');
  document.getElementById('uf-roles-list').innerHTML = rolesHtml();
}

async function loadUsers() {
  const search = document.getElementById('search-input').value.trim();
  const status = document.getElementById('status-filter').value;
  try {
    usersCache = await Api.users.list({ search, status });
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
          <p>Try a different search or filter, or create a new user.</p>
          <button class="btn btn-primary" onclick="openUserForm()">${Icons.render('plus')} New User</button>
        </div>
      </div>`;
    return;
  }
  region.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Username</th><th>Full name</th><th>Roles</th><th>Linked physician</th><th>Status</th><th>Last login</th><th></th></tr></thead>
        <tbody>
          ${list.map(u => `
            <tr>
              <td class="cell-primary" style="cursor:pointer;" onclick="openUserEdit('${u.id}')">
                <div style="display:flex; align-items:center; gap:8px;">
                  ${UI.avatar(u.full_name || u.username, u.photo_url, 'width:28px; height:28px; font-size:10px;')}
                  <span>${UI.escapeHtml(u.username)}</span>
                </div>
              </td>
              <td class="cell-muted">${UI.escapeHtml(u.full_name) || '—'}</td>
              <td>${u.roles.map(r => `<span class="badge badge-primary" style="margin-right:4px;">${UI.escapeHtml(r.display_name)}</span>`).join('')}</td>
              <td class="cell-muted">${u.physician_id ? UI.escapeHtml((physiciansCache.find(p => p.id === u.physician_id) || {}).full_name || '—') : '—'}</td>
              <td>${u.is_active ? `<span class="badge badge-success"><span class="badge-dot"></span>Active</span>` : `<span class="badge badge-neutral"><span class="badge-dot"></span>Inactive</span>`}</td>
              <td class="cell-muted">${u.last_login_at ? UI.formatDateTime(u.last_login_at) : 'Never'}</td>
              <td><button class="icon-btn" title="Edit" onclick="openUserEdit('${u.id}')">${Icons.render('edit')}</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ---------- New user ----------
function openUserForm() {
  document.getElementById('user-form').reset();
  document.querySelectorAll('#uf-roles-list .role-checkbox').forEach(cb => { cb.checked = false; });

  const photoContainer = document.getElementById('uf-photo-container');
  if (photoContainer && typeof CameraWidget !== 'undefined') {
    photoContainer.innerHTML = CameraWidget.renderPickerHtml({
      hiddenInputId: 'uf-photo-url',
      previewImgId: 'uf-photo-preview',
      initialUrl: '',
    });
    CameraWidget.bindEvents({
      hiddenInputId: 'uf-photo-url',
      previewImgId: 'uf-photo-preview',
    });
  }

  document.getElementById('user-modal-backdrop').classList.add('visible');
}
function closeUserForm() { document.getElementById('user-modal-backdrop').classList.remove('visible'); }
document.getElementById('new-user-btn').addEventListener('click', openUserForm);
document.getElementById('user-modal-close').addEventListener('click', closeUserForm);
document.getElementById('user-form-cancel').addEventListener('click', closeUserForm);
document.getElementById('user-modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'user-modal-backdrop') closeUserForm(); });

document.getElementById('user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const roleIds = Array.from(document.querySelectorAll('#uf-roles-list .role-checkbox:checked')).map(cb => cb.value);
  const photoInput = document.getElementById('uf-photo-url');
  const payload = {
    username: document.getElementById('uf-username').value.trim(),
    password: document.getElementById('uf-password').value,
    full_name: document.getElementById('uf-full-name').value.trim(),
    physician_id: document.getElementById('uf-physician').value || null,
    role_ids: roleIds,
    photo_url: photoInput ? photoInput.value : null,
  };
  if (!roleIds.length) { UI.toast('Assign at least one role.', 'danger'); return; }

  const btn = document.getElementById('user-form-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Creating…';
  try {
    await Api.users.create(payload);
    UI.toast('User created.');
    closeUserForm();
    loadUsers();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create User';
  }
});

// ---------- Edit user ----------
function openUserEdit(id) {
  const u = usersCache.find(x => x.id === id);
  if (!u) return;
  editingUserId = id;
  document.getElementById('ue-title').textContent = u.username;
  document.getElementById('ue-sub').textContent = u.full_name || 'No full name on file';
  document.getElementById('ue-full-name').value = u.full_name || '';
  document.getElementById('ue-physician').value = u.physician_id || '';
  document.getElementById('user-edit-notice').innerHTML = '';

  const roleIds = u.roles.map(r => r.id);
  document.getElementById('ue-roles-list').innerHTML = rolesCache.map(r => `
    <label style="display:flex; align-items:center; gap:8px; font-size:13px; padding:4px 0; cursor:pointer;">
      <input type="checkbox" class="ue-role-checkbox" value="${r.id}" ${roleIds.includes(r.id) ? 'checked' : ''} />
      <span>${UI.escapeHtml(r.display_name)}</span>
    </label>
  `).join('');

  const isBuiltInAdmin = u.username === 'admin';
  const toggleBtn = document.getElementById('ue-toggle-active-btn');
  toggleBtn.textContent = u.is_active ? 'Deactivate' : 'Activate';
  toggleBtn.style.display = isBuiltInAdmin && u.is_active ? 'none' : 'inline-flex';
  document.getElementById('ue-footer-note').textContent = isBuiltInAdmin ? 'Built-in admin account' : '';

  document.getElementById('user-edit-backdrop').classList.add('visible');
}
function closeUserEdit() { document.getElementById('user-edit-backdrop').classList.remove('visible'); editingUserId = null; }
document.getElementById('user-edit-close').addEventListener('click', closeUserEdit);
document.getElementById('user-edit-backdrop').addEventListener('click', (e) => { if (e.target.id === 'user-edit-backdrop') closeUserEdit(); });

document.getElementById('user-edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const roleIds = Array.from(document.querySelectorAll('#ue-roles-list .ue-role-checkbox:checked')).map(cb => cb.value);
  if (!roleIds.length) { UI.toast('Assign at least one role.', 'danger'); return; }
  try {
    await Api.users.update(editingUserId, {
      full_name: document.getElementById('ue-full-name').value.trim(),
      physician_id: document.getElementById('ue-physician').value || null,
      role_ids: roleIds,
    });
    UI.toast('User updated.');
    closeUserEdit();
    loadUsers();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  }
});

document.getElementById('ue-reset-password-btn').addEventListener('click', async () => {
  const newPassword = prompt('Enter a new temporary password (at least 6 characters):');
  if (!newPassword) return;
  if (newPassword.length < 6) { UI.toast('Password must be at least 6 characters.', 'danger'); return; }
  try {
    await Api.users.resetPassword(editingUserId, newPassword);
    UI.toast('Password reset.');
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
});

document.getElementById('ue-toggle-active-btn').addEventListener('click', async (e) => {
  const u = usersCache.find(x => x.id === editingUserId);
  if (!u) return;
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    await Api.users.update(editingUserId, { is_active: !u.is_active });
    UI.toast(u.is_active ? 'User deactivated.' : 'User activated.');
    closeUserEdit();
    loadUsers();
  } catch (err) {
    document.getElementById('user-edit-notice').innerHTML = `
      <div class="notice notice-warning">${Icons.render('alert')}<span>${UI.escapeHtml(UI.errorMessage(err))}</span></div>
    `;
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('search-input').addEventListener('input', debounce(loadUsers, 250));
document.getElementById('status-filter').addEventListener('change', loadUsers);

async function init() {
  await loadLookups();
  await loadUsers();
}
init();
