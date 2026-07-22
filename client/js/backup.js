/* ===========================================================
   Backup page logic
   -----------------------------------------------------------
   Mock-only shell — real backup generation is server-side
   work, not something a frontend can do. See BACKEND_HANDOFF.md.
   =========================================================== */

Auth.requireAuth();
if (RoleGuard.blockIfNotAllowed('backup')) { throw new Error('redirecting'); }
renderShell('backup');
setPageTitle('Backup');

document.getElementById('header-info-icon').innerHTML = Icons.render('info');
document.getElementById('plus-icon-slot').innerHTML = Icons.render('plus');

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function loadBackups() {
  try {
    const list = await Api.backups.list();
    renderTable(list);
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

function renderTable(list) {
  const region = document.getElementById('backups-table-region');
  if (!list.length) {
    region.innerHTML = `
      <div class="table-wrap">
        <div class="empty-state">
          <div class="empty-icon">${Icons.render('backup')}</div>
          <h3>No backups yet</h3>
          <p>Create a backup to see it listed here.</p>
          <button class="btn btn-primary" onclick="createBackup()">${Icons.render('plus')} Create Backup Now</button>
        </div>
      </div>`;
    return;
  }
  region.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Label</th><th>Created</th><th>Size</th><th></th></tr></thead>
        <tbody>
          ${list.map(b => `
            <tr>
              <td class="cell-primary">${UI.escapeHtml(b.label)}</td>
              <td class="cell-muted">${UI.formatDateTime(b.created_at)}</td>
              <td class="cell-muted">${formatBytes(b.size_bytes)}</td>
              <td>
                <div class="row-actions">
                  <button class="icon-btn" title="Download" disabled>${Icons.render('arrowRight')}</button>
                  <button class="icon-btn" title="Delete" onclick="deleteBackup('${b.id}')">${Icons.render('trash')}</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function createBackup() {
  const btn = document.getElementById('new-backup-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Creating…';
  try {
    await Api.backups.create('Manual backup');
    UI.toast('Backup created.');
    loadBackups();
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${Icons.render('plus')} Create Backup Now`;
  }
}
document.getElementById('new-backup-btn').addEventListener('click', createBackup);

async function deleteBackup(id) {
  if (!confirm('Delete this backup record?')) return;
  try {
    await Api.backups.remove(id);
    UI.toast('Backup deleted.');
    loadBackups();
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

loadBackups();
