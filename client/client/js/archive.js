/* ===========================================================
   Archive page — view and restore archived patients & registrations
   =========================================================== */

Auth.requireAuth();
if (RoleGuard.blockIfNotAllowed('archive')) throw '';
renderShell('archive');
document.getElementById('search-icon-slot').innerHTML = Icons.render('search');

let archivedPatients = [];
let archivedRegistrations = [];

async function loadArchive() {
  try {
    const [patients, registrations] = await Promise.all([
      Api.patients.list({ status: 'inactive' }),
      Api.registrations.list({ status: 'withdrawn' }),
    ]);
    archivedPatients = patients;
    archivedRegistrations = registrations;
    renderArchive();
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

function renderArchive() {
  const filter = document.getElementById('type-filter').value;
  const search = document.getElementById('search-input').value.toLowerCase().trim();

  let patients = archivedPatients;
  let registrations = archivedRegistrations;

  if (search) {
    patients = patients.filter(p =>
      p.full_name.toLowerCase().includes(search) ||
      p.patient_code.toLowerCase().includes(search) ||
      (p.phone || '').toLowerCase().includes(search)
    );
    registrations = registrations.filter(r =>
      r.full_name.toLowerCase().includes(search) ||
      r.registration_code.toLowerCase().includes(search) ||
      (r.occupation || '').toLowerCase().includes(search)
    );
  }

  const showPatients = filter === 'all' || filter === 'patients';
  const showRegistrations = filter === 'all' || filter === 'registrations';

  const region = document.getElementById('archive-table-region');

  const totalCount = (showPatients ? patients.length : 0) + (showRegistrations ? registrations.length : 0);

  if (totalCount === 0) {
    region.innerHTML = `
      <div class="table-wrap">
        <div class="empty-state">
          <div class="empty-icon">${Icons.render('check')}</div>
          <h3>No archived records</h3>
          <p>There are no archived patients or registrations matching your search.</p>
        </div>
      </div>`;
    return;
  }

  let html = '';

  // -- Archived Patients --
  if (showPatients && patients.length) {
    html += `
      <h3 style="margin: 0 0 10px 0; font-size: 15px; font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
        <span style="width:18px; height:18px; display:inline-flex;">${Icons.render('patients')}</span> Archived Patients (${patients.length})
      </h3>
      <div class="table-wrap" style="margin-bottom: 28px;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Code</th><th>Full name</th><th>Gender</th><th>Age</th><th>Phone</th><th>Registered</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${patients.map(p => `
              <tr>
                <td><span class="cell-code">${p.patient_code}</span></td>
                <td class="cell-primary">
                  <div style="display:flex; align-items:center; gap:10px;">
                    ${UI.avatar(p.full_name, p.photo_url, 'width:32px; height:32px; font-size:11px;')}
                    <span>${UI.escapeHtml(p.full_name)}</span>
                  </div>
                </td>
                <td class="cell-muted" style="text-transform:capitalize;">${p.gender || '—'}</td>
                <td class="cell-muted">${UI.age(p.date_of_birth)}</td>
                <td class="cell-muted">${UI.escapeHtml(p.phone) || '—'}</td>
                <td class="cell-muted">${UI.formatDate(p.registered_date)}</td>
                <td>
                  <div class="row-actions">
                    <button class="btn btn-secondary" style="font-size: 12px; padding: 4px 12px;" onclick="restorePatient('${p.id}', this)">Restore</button>
                    <button class="icon-btn text-danger" style="color: #dc3545;" title="Delete permanently" onclick="deletePatientArchive(event, '${p.id}', this)">${Icons.render('trash')}</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // -- Archived Registrations --
  if (showRegistrations && registrations.length) {
    html += `
      <h3 style="margin: 0 0 10px 0; font-size: 15px; font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
        <span style="width:18px; height:18px; display:inline-flex;">${Icons.render('employees')}</span> Archived Registrations (${registrations.length})
      </h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Code</th><th>Full name</th><th>Gender</th><th>Age</th><th>Occupation</th><th>Registered</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${registrations.map(r => `
              <tr>
                <td><span class="cell-code">${r.registration_code}</span></td>
                <td class="cell-primary">
                  <div style="display:flex; align-items:center; gap:10px;">
                    ${UI.avatar(r.full_name, r.photo_url, 'width:32px; height:32px; font-size:11px;')}
                    <span>${UI.escapeHtml(r.full_name)}</span>
                  </div>
                </td>
                <td class="cell-muted" style="text-transform:capitalize;">${r.gender || '—'}</td>
                <td class="cell-muted">${UI.age(r.date_of_birth)}</td>
                <td class="cell-muted">${UI.escapeHtml(r.occupation)}</td>
                <td class="cell-muted">${UI.formatDate(r.registration_date)}</td>
                <td>
                  <div class="row-actions">
                    <button class="btn btn-secondary" style="font-size: 12px; padding: 4px 12px;" onclick="restoreRegistration('${r.id}', this)">Restore</button>
                    <button class="icon-btn text-danger" style="color: #dc3545;" title="Delete permanently" onclick="deleteRegistrationArchive(event, '${r.id}', this)">${Icons.render('trash')}</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  }

  region.innerHTML = html;
}

// ---------- Restore actions ----------

async function restorePatient(id, btn) {
  if (!confirm('Restore this patient? They will reappear in the active patients list.')) return;
  btn.disabled = true;
  btn.textContent = 'Restoring…';
  try {
    await Api.patients.update(id, { is_active: true });
    UI.toast('Patient restored.');
    loadArchive();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
    btn.disabled = false;
    btn.textContent = 'Restore';
  }
}

async function restoreRegistration(id, btn) {
  if (!confirm('Restore this registration? It will reappear in the active registrations list with "pending" status.')) return;
  btn.disabled = true;
  btn.textContent = 'Restoring…';
  try {
    await Api.registrations.update(id, { status: 'pending' });
    UI.toast('Registration restored.');
    loadArchive();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
    btn.disabled = false;
    btn.textContent = 'Restore';
  }
}

// ---------- Hard delete actions ----------

async function deletePatientArchive(e, id, btn) {
  e.stopPropagation();
  if (!confirm('PERMANENTLY DELETE this patient? All their medical history will be erased. This cannot be undone!')) return;
  btn.disabled = true;
  try {
    await Api.patients.delete(id);
    UI.toast('Patient permanently deleted.');
    loadArchive();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
    btn.disabled = false;
  }
}

async function deleteRegistrationArchive(e, id, btn) {
  e.stopPropagation();
  if (!confirm('PERMANENTLY DELETE this registration? All linked exams and staff accounts will be erased. This cannot be undone!')) return;
  btn.disabled = true;
  try {
    await Api.registrations.delete(id);
    UI.toast('Registration permanently deleted.');
    loadArchive();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
    btn.disabled = false;
  }
}

// ---------- Event listeners ----------

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

document.getElementById('search-input').addEventListener('input', debounce(renderArchive, 250));
document.getElementById('type-filter').addEventListener('change', renderArchive);

loadArchive();
