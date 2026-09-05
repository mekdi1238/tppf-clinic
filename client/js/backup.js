/* ===========================================================
   Backup & Recovery Controller (backup.js)
   =========================================================== */

Auth.requireAuth();
if (RoleGuard.blockIfNotAllowed('backup')) { throw new Error('redirecting'); }
renderShell('backup');
setPageTitle('Database Backup');

const headerIcon = document.getElementById('header-info-icon');
if (headerIcon) headerIcon.innerHTML = Icons.render('info');
const plusIcon = document.getElementById('plus-icon-slot');
if (plusIcon) plusIcon.innerHTML = Icons.render('plus');
const scheduleIcon = document.getElementById('schedule-icon-slot');
if (scheduleIcon) scheduleIcon.innerHTML = Icons.render('clock');
const uploadIcon = document.getElementById('upload-icon-slot');
if (uploadIcon) uploadIcon.innerHTML = Icons.render('upload');
const dropIcon = document.getElementById('bi-drop-icon-slot');
if (dropIcon) dropIcon.innerHTML = Icons.render('upload');
const importCloseIcon = document.getElementById('backup-import-close');
if (importCloseIcon) importCloseIcon.innerHTML = Icons.render('close');

const newBackupBtn = document.getElementById('new-backup-btn');
if (newBackupBtn && typeof Permissions !== 'undefined') {
  newBackupBtn.style.display = Permissions.has('backup.create') ? 'inline-flex' : 'none';
}

const importBackupBtn = document.getElementById('import-backup-btn');
if (importBackupBtn && typeof Permissions !== 'undefined') {
  importBackupBtn.style.display = (Permissions.has('backup.restore') || Permissions.has('backup.create')) ? 'inline-flex' : 'none';
}

// Schedule DOM Elements
const schedForm = document.getElementById('backup-schedule-form');
const schedEnabled = document.getElementById('sched-enabled');
const schedFrequency = document.getElementById('sched-frequency');
const schedTime = document.getElementById('sched-time');
const schedDayOfWeek = document.getElementById('sched-day-of-week');
const schedRetention = document.getElementById('sched-retention');
const groupDayOfWeek = document.getElementById('group-day-of-week');
const groupTimeOfDay = document.getElementById('group-time-of-day');
const nextRunBadge = document.getElementById('next-run-badge');

function formatBytes(bytes) {
  const num = Number(bytes);
  if (!num || isNaN(num)) return '—';
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(2)} MB`;
}

function updateScheduleFieldsVisibility() {
  const isWeekly = schedFrequency.value === 'weekly';
  const isHourly = schedFrequency.value === 'hourly';

  groupDayOfWeek.style.display = isWeekly ? 'flex' : 'none';
  groupTimeOfDay.style.display = isHourly ? 'none' : 'flex';
}

async function loadSchedule() {
  try {
    const s = await Api.backups.getSchedule();
    if (!s) return;

    schedEnabled.checked = Boolean(s.enabled);
    schedFrequency.value = s.frequency || 'daily';
    schedTime.value = s.time_of_day || '02:00';
    schedDayOfWeek.value = s.day_of_week !== undefined ? String(s.day_of_week) : '0';
    schedRetention.value = s.retention_count || 14;

    updateScheduleFieldsVisibility();

    if (s.enabled && s.next_run_at) {
      nextRunBadge.innerHTML = `
        <span class="badge badge-success" style="font-size: 12px; padding: 5px 10px;">
          <span class="badge-dot"></span> Next Run: <strong>${UI.formatDateTime(s.next_run_at)}</strong>
        </span>
      `;
    } else if (s.enabled) {
      nextRunBadge.innerHTML = `
        <span class="badge badge-warning" style="font-size: 12px; padding: 5px 10px;">
          <span class="badge-dot"></span> Active (${s.frequency})
        </span>
      `;
    } else {
      nextRunBadge.innerHTML = `
        <span class="badge badge-neutral" style="font-size: 12px; padding: 5px 10px;">
          <span class="badge-dot"></span> Schedule Disabled
        </span>
      `;
    }
  } catch (err) {
    console.warn('Could not load backup schedule:', err);
  }
}

schedFrequency.addEventListener('change', updateScheduleFieldsVisibility);

schedForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-save-schedule');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';

  try {
    const data = {
      enabled: schedEnabled.checked,
      frequency: schedFrequency.value,
      time_of_day: schedTime.value,
      day_of_week: parseInt(schedDayOfWeek.value, 10) || 0,
      retention_count: parseInt(schedRetention.value, 10) || 14,
    };

    const updated = await Api.backups.updateSchedule(data);
    UI.toast('Backup schedule settings saved successfully!', 'success');
    loadSchedule();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Save Schedule';
  }
});

async function loadBackups() {
  const region = document.getElementById('backups-table-region');
  region.innerHTML = '<div class="empty-state"><span class="spinner"></span><p>Loading database backups…</p></div>';

  try {
    const list = await Api.backups.list();
    renderTable(list);
  } catch (e) {
    region.innerHTML = `<div class="notice notice-danger">${UI.escapeHtml(UI.errorMessage(e))}</div>`;
  }
}

function renderTable(list) {
  const region = document.getElementById('backups-table-region');
  if (!list.length) {
    region.innerHTML = `
      <div class="table-wrap">
        <div class="empty-state">
          <div class="empty-icon">${Icons.render('backup')}</div>
          <h3>No database backups recorded yet</h3>
          <p>Create your first system backup or enable the automatic schedule above.</p>
          <button class="btn btn-primary" onclick="createBackup()">${Icons.render('plus')} Create Backup Now</button>
        </div>
      </div>`;
    return;
  }

  region.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 32%;">Backup / Label</th>
            <th style="width: 20%;">Filename</th>
            <th style="width: 14%;">Size</th>
            <th style="width: 18%;">Created At</th>
            <th style="width: 16%; text-align: right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(b => {
            const isAuto = (b.notes || '').startsWith('Auto Backup');
            const typeBadge = isAuto 
              ? '<span class="badge badge-info" style="font-size:10px; margin-left:6px;">Auto Scheduled</span>'
              : '<span class="badge badge-neutral" style="font-size:10px; margin-left:6px;">Manual</span>';

            return `
              <tr>
                <td class="cell-primary">
                  <div style="font-weight: 700; font-size: 0.92rem; display:flex; align-items:center;">
                    ${UI.escapeHtml(b.notes || 'Manual Backup')} ${typeBadge}
                  </div>
                  <div style="font-size: 0.75rem; color: var(--color-text-muted); margin-top:2px;">
                    Created by: ${UI.escapeHtml(b.created_by_name || b.created_by_username || (isAuto ? 'System Scheduler' : 'Admin'))}
                  </div>
                </td>
                <td>
                  <code style="font-size: 0.8rem; background: var(--color-bg-secondary, #f1f5f9); padding: 2px 6px; border-radius: 4px;">${UI.escapeHtml(b.filename)}</code>
                </td>
                <td style="font-weight: 600;">${formatBytes(b.file_size)}</td>
                <td class="cell-muted">${UI.formatDateTime(b.created_at)}</td>
                <td style="text-align: right;">
                  <div style="display: flex; gap: 6px; justify-content: flex-end;">
                    <button class="btn btn-secondary btn-sm" onclick="downloadBackup('${b.id}', '${UI.escapeHtml(b.filename)}')" title="Download SQL snapshot file to PC" style="padding: 4px 8px;">
                      ${Icons.render('download')} Download
                    </button>
                    ${Permissions.has('backup.restore') ? `
                      <button class="btn btn-warning btn-sm" onclick="restoreBackup('${b.id}', '${UI.escapeHtml(b.filename)}')" title="Restore database from this backup" style="padding: 4px 8px;">
                        ${Icons.render('activity')} Restore
                      </button>
                    ` : ''}
                    ${Permissions.has('backup.delete') ? `
                      <button class="icon-btn" onclick="deleteBackup('${b.id}', '${UI.escapeHtml(b.filename)}')" title="Delete backup" style="color: var(--color-danger, #ef4444);">
                        ${Icons.render('trash')}
                      </button>
                    ` : ''}
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

async function createBackup() {
  const label = prompt('Enter a label or note for this backup (e.g. "Pre-update Snapshot"):', `Manual Backup (${new Date().toLocaleDateString('en-GB')})`);
  if (label === null) return;

  const btn = document.getElementById('new-backup-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating Backup…';

  try {
    const backup = await Api.backups.create(label.trim() || 'Manual Backup');
    UI.toast(`Backup '${backup.filename}' created successfully (${formatBytes(backup.file_size)}).`, 'success');
    loadBackups();
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${Icons.render('plus')} Create Backup Now`;
  }
}

document.getElementById('new-backup-btn').addEventListener('click', createBackup);

async function downloadBackup(id, filename) {
  try {
    UI.toast(`Preparing download for ${filename}…`);
    const session = Auth.getSession();
    const token = session ? session.token : null;

    const response = await fetch(`/api/v1/backups/${id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename || `tppf_backup_${id}.sql`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    UI.toast(`Download complete: ${filename}`, 'success');
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  }
}

async function restoreBackup(id, filename) {
  const confirmed = confirm(
    `⚠️ WARNING: RESTORE DATABASE\n\nAre you sure you want to restore the database from:\n"${filename}"?\n\nThis will OVERWRITE the current clinic database with the data contained in this snapshot. Make sure no other active consultations are in progress.`
  );
  if (!confirmed) return;

  const doubleConfirmed = prompt(`Type "RESTORE" to confirm database recovery:`);
  if (doubleConfirmed !== 'RESTORE') {
    UI.toast('Restore cancelled.', 'neutral');
    return;
  }

  const region = document.getElementById('backups-table-region');
  region.innerHTML = '<div class="empty-state"><span class="spinner"></span><p>Restoring database from backup snapshot… Please wait.</p></div>';

  try {
    const res = await Api.backups.restore(id);
    UI.toast(res.message || 'Database restored successfully!', 'success');
    loadBackups();
  } catch (e) {
    UI.toast(`Restore failed: ${UI.errorMessage(e)}`, 'danger');
    loadBackups();
  }
}

async function deleteBackup(id, filename) {
  if (!confirm(`Permanently delete backup file "${filename}"?`)) return;
  try {
    await Api.backups.remove(id);
    UI.toast(`Backup ${filename} deleted.`, 'success');
    loadBackups();
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

// ==========================================
// Manual Import & Restore Modal Controller
// ==========================================

let currentImportSource = 'upload'; // 'upload' | 'path' | 'existing'
let selectedFile = null;

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file from disk.'));
    reader.readAsText(file);
  });
}

function handleSelectedFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.sql')) {
    UI.toast('Please select a valid PostgreSQL .sql backup file.', 'warning');
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    UI.toast('File exceeds 50MB browser limit. Please switch to "Server File Path" tab for large files.', 'warning');
    return;
  }
  selectedFile = file;
  document.getElementById('bi-file-name').textContent = file.name;
  document.getElementById('bi-file-size').textContent = formatBytes(file.size);
  document.getElementById('bi-file-selected-info').style.display = 'block';
  document.getElementById('bi-drop-zone').style.display = 'none';

  const labelInput = document.getElementById('bi-label');
  if (labelInput && !labelInput.value) {
    labelInput.value = file.name.replace(/\.[^/.]+$/, '');
  }
}

function clearSelectedFile() {
  selectedFile = null;
  const fileInput = document.getElementById('bi-file-input');
  if (fileInput) fileInput.value = '';
  const selectedInfo = document.getElementById('bi-file-selected-info');
  if (selectedInfo) selectedInfo.style.display = 'none';
  const dropZone = document.getElementById('bi-drop-zone');
  if (dropZone) dropZone.style.display = 'block';
}

function updateSubmitButtonText() {
  const submitBtn = document.getElementById('bi-submit-btn');
  if (!submitBtn) return;
  if (currentImportSource === 'existing') {
    submitBtn.innerHTML = `${Icons.render('activity')} Restore Selected Backup`;
    return;
  }
  const isRestore = document.getElementById('bi-restore-immediately')?.checked;
  if (isRestore) {
    submitBtn.innerHTML = `${Icons.render('activity')} Import &amp; Restore`;
  } else {
    submitBtn.innerHTML = `${Icons.render('fileImport')} Import Backup File`;
  }
}

function switchImportTab(mode) {
  currentImportSource = mode;
  const tabUpload = document.getElementById('tab-src-upload');
  const tabPath = document.getElementById('tab-src-path');
  const tabExisting = document.getElementById('tab-src-existing');
  const secUpload = document.getElementById('bi-section-upload');
  const secPath = document.getElementById('bi-section-path');
  const secExisting = document.getElementById('bi-section-existing');
  const labelField = document.getElementById('bi-label-field');
  const restoreToggleWrap = document.getElementById('bi-restore-toggle-wrap');
  const statusMsg = document.getElementById('bi-status-msg');
  if (statusMsg) statusMsg.innerHTML = '';

  const setActiveTab = (btn) => {
    btn.style.fontWeight = '700';
    btn.style.color = 'var(--color-primary, #0A4F49)';
    btn.style.borderBottom = '2px solid var(--color-primary, #0A4F49)';
  };
  const setInactiveTab = (btn) => {
    btn.style.fontWeight = '600';
    btn.style.color = 'var(--color-text-muted, #64748b)';
    btn.style.borderBottom = '2px solid transparent';
  };

  [tabUpload, tabPath, tabExisting].forEach(btn => btn && setInactiveTab(btn));
  if (secUpload) secUpload.style.display = 'none';
  if (secPath) secPath.style.display = 'none';
  if (secExisting) secExisting.style.display = 'none';

  if (mode === 'upload') {
    if (tabUpload) setActiveTab(tabUpload);
    if (secUpload) secUpload.style.display = 'block';
    if (labelField) labelField.style.display = 'block';
    if (restoreToggleWrap) restoreToggleWrap.style.display = 'flex';
  } else if (mode === 'path') {
    if (tabPath) setActiveTab(tabPath);
    if (secPath) secPath.style.display = 'block';
    if (labelField) labelField.style.display = 'block';
    if (restoreToggleWrap) restoreToggleWrap.style.display = 'flex';
  } else if (mode === 'existing') {
    if (tabExisting) setActiveTab(tabExisting);
    if (secExisting) secExisting.style.display = 'block';
    if (labelField) labelField.style.display = 'none';
    if (restoreToggleWrap) restoreToggleWrap.style.display = 'none';
  }

  updateSubmitButtonText();
}

async function openImportModal() {
  clearSelectedFile();
  const filePathInput = document.getElementById('bi-file-path');
  if (filePathInput) filePathInput.value = '';
  const labelInput = document.getElementById('bi-label');
  if (labelInput) labelInput.value = '';
  const restoreCheck = document.getElementById('bi-restore-immediately');
  if (restoreCheck) restoreCheck.checked = true;
  const statusMsg = document.getElementById('bi-status-msg');
  if (statusMsg) statusMsg.innerHTML = '';

  switchImportTab('upload');

  // Populate existing backups select
  const existingSelect = document.getElementById('bi-existing-select');
  if (existingSelect) {
    existingSelect.innerHTML = '<option value="">Loading backups list…</option>';
    try {
      const list = await Api.backups.list();
      if (!list || list.length === 0) {
        existingSelect.innerHTML = '<option value="">No stored backups found</option>';
      } else {
        existingSelect.innerHTML = '<option value="">-- Choose a stored backup snapshot --</option>' +
          list.map(b => `<option value="${b.id}">${UI.escapeHtml(b.filename)} (${formatBytes(b.file_size)}) — ${UI.escapeHtml(b.notes || 'Manual')} [${UI.formatDateTime(b.created_at)}]</option>`).join('');
      }
    } catch (e) {
      existingSelect.innerHTML = '<option value="">Failed to load existing backups</option>';
    }
  }

  document.getElementById('backup-import-backdrop').classList.add('visible');
}

function closeImportModal() {
  document.getElementById('backup-import-backdrop').classList.remove('visible');
}

// Wire Tab Switching
const tabUploadBtn = document.getElementById('tab-src-upload');
if (tabUploadBtn) tabUploadBtn.addEventListener('click', () => switchImportTab('upload'));
const tabPathBtn = document.getElementById('tab-src-path');
if (tabPathBtn) tabPathBtn.addEventListener('click', () => switchImportTab('path'));
const tabExistingBtn = document.getElementById('tab-src-existing');
if (tabExistingBtn) tabExistingBtn.addEventListener('click', () => switchImportTab('existing'));

// Wire Restore Checkbox Change
const restoreImmCheck = document.getElementById('bi-restore-immediately');
if (restoreImmCheck) restoreImmCheck.addEventListener('change', updateSubmitButtonText);

// Wire Drag & Drop and File Input
const dropZone = document.getElementById('bi-drop-zone');
const fileInput = document.getElementById('bi-file-input');
if (dropZone && fileInput) {
  dropZone.addEventListener('click', () => fileInput.click());

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.borderColor = 'var(--color-primary, #0A4F49)';
      dropZone.style.background = '#e6f4ea';
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.style.borderColor = 'var(--color-border, #cbd5e1)';
      dropZone.style.background = 'var(--color-bg-secondary, #f8fafc)';
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt ? dt.files : null;
    if (files && files.length > 0) {
      handleSelectedFile(files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleSelectedFile(e.target.files[0]);
    }
  });
}

// Wire Clear File Button
const clearFileBtn = document.getElementById('bi-file-clear-btn');
if (clearFileBtn) {
  clearFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearSelectedFile();
  });
}

// Wire Open / Close Triggers
if (importBackupBtn) {
  importBackupBtn.addEventListener('click', openImportModal);
}

const importCloseBtn = document.getElementById('backup-import-close');
if (importCloseBtn) importCloseBtn.addEventListener('click', closeImportModal);

const biCancelBtn = document.getElementById('bi-cancel-btn');
if (biCancelBtn) biCancelBtn.addEventListener('click', closeImportModal);

const importBackdrop = document.getElementById('backup-import-backdrop');
if (importBackdrop) {
  importBackdrop.addEventListener('click', (e) => {
    if (e.target.id === 'backup-import-backdrop') closeImportModal();
  });
}

// Wire Form Submission
const importForm = document.getElementById('backup-import-form');
if (importForm) {
  importForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusMsg = document.getElementById('bi-status-msg');
    if (statusMsg) statusMsg.innerHTML = '';
    const submitBtn = document.getElementById('bi-submit-btn');
    const restoreImmediately = document.getElementById('bi-restore-immediately')?.checked;
    const label = document.getElementById('bi-label')?.value.trim() || '';

    try {
      if (currentImportSource === 'upload') {
        if (!selectedFile) {
          throw new Error('Please select or drop a .sql backup file to import.');
        }

        if (restoreImmediately) {
          const confirmed = confirm(
            `⚠️ WARNING: RESTORE DATABASE\n\nAre you sure you want to restore the database from:\n"${selectedFile.name}"?\n\nThis will OVERWRITE the current clinic database with the data contained in this backup. Existing backup snapshots will remain safe.`
          );
          if (!confirmed) return;

          const doubleConfirmed = prompt(`Type "RESTORE" to confirm database recovery:`);
          if (doubleConfirmed !== 'RESTORE') {
            UI.toast('Restore cancelled.', 'neutral');
            return;
          }
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="spinner"></span> ${restoreImmediately ? 'Importing & Restoring…' : 'Uploading Backup…'}`;

        const sql = await readFileAsText(selectedFile);
        const res = await Api.backups.import({
          filename: selectedFile.name,
          sql,
          label: label || `Imported: ${selectedFile.name}`,
          restoreImmediately,
        });

        UI.toast(res.message || 'Backup imported successfully!', 'success');
        closeImportModal();
        loadBackups();

      } else if (currentImportSource === 'path') {
        const filePath = document.getElementById('bi-file-path')?.value.trim();
        if (!filePath) {
          throw new Error('Please specify a valid server/local file path to the .sql file.');
        }

        if (restoreImmediately) {
          const confirmed = confirm(
            `⚠️ WARNING: RESTORE DATABASE\n\nAre you sure you want to restore the database from:\n"${filePath}"?\n\nThis will OVERWRITE the current clinic database with the data in this file.`
          );
          if (!confirmed) return;

          const doubleConfirmed = prompt(`Type "RESTORE" to confirm database recovery:`);
          if (doubleConfirmed !== 'RESTORE') {
            UI.toast('Restore cancelled.', 'neutral');
            return;
          }
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="spinner"></span> ${restoreImmediately ? 'Importing & Restoring…' : 'Reading File…'}`;

        const res = await Api.backups.import({
          filePath,
          label: label || `Imported from path`,
          restoreImmediately,
        });

        UI.toast(res.message || 'Backup imported successfully!', 'success');
        closeImportModal();
        loadBackups();

      } else if (currentImportSource === 'existing') {
        const backupId = document.getElementById('bi-existing-select')?.value;
        if (!backupId) {
          throw new Error('Please choose an existing system backup snapshot to restore.');
        }

        const selectEl = document.getElementById('bi-existing-select');
        const selectedOptionText = selectEl.options[selectEl.selectedIndex]?.text || `Backup #${backupId}`;

        const confirmed = confirm(
          `⚠️ WARNING: RESTORE DATABASE\n\nAre you sure you want to restore the database from:\n${selectedOptionText}?\n\nThis will OVERWRITE the current clinic database with the data contained in this snapshot.`
        );
        if (!confirmed) return;

        const doubleConfirmed = prompt(`Type "RESTORE" to confirm database recovery:`);
        if (doubleConfirmed !== 'RESTORE') {
          UI.toast('Restore cancelled.', 'neutral');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="spinner"></span> Restoring database…`;

        const res = await Api.backups.restore(backupId);
        UI.toast(res.message || 'Database restored successfully!', 'success');
        closeImportModal();
        loadBackups();
      }
    } catch (err) {
      console.error('Import/Restore error:', err);
      if (statusMsg) {
        statusMsg.innerHTML = `<div class="notice notice-danger" style="font-size: 13px; margin-top: 8px;">${UI.escapeHtml(UI.errorMessage(err))}</div>`;
      }
      UI.toast(UI.errorMessage(err), 'danger');
    } finally {
      submitBtn.disabled = false;
      updateSubmitButtonText();
    }
  });
}

loadSchedule();
loadBackups();
