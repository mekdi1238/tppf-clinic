/* ===========================================================
   Department HR Portal Controller (dept-hr.js)
   =========================================================== */

if (!Auth.requireAuth()) {
  // auth handles redirect
}

RoleGuard.blockIfNotAllowed('dept-hr');
renderShell('dept-hr');
setPageTitle('Department HR Portal');

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

let currentUser = null;
let patientsCache = [];
let sickLeavesCache = [];
let selectedPatientForDispatch = null;

function isManagerUser(user) {
  if (!user) return false;
  if (!user.department || user.department.toLowerCase() === 'manager') return true;
  const roles = (user.roles || []).map(r => String(r).toLowerCase());
  return roles.some(r => r.includes('manager') || r.includes('admin') || r.includes('system'));
}

// Icons setup
document.getElementById('search-icon-slot').innerHTML = Icons.render('search');
document.getElementById('sick-search-icon-slot').innerHTML = Icons.render('search');
document.getElementById('renewals-search-icon-slot').innerHTML = Icons.render('search');
document.getElementById('dispatch-tab-icon').innerHTML = Icons.render('plus');
document.getElementById('sick-tab-icon').innerHTML = Icons.render('referrals');
document.getElementById('notice-icon-slot').innerHTML = Icons.render('info');
document.getElementById('dispatch-modal-close').innerHTML = Icons.render('close');
document.getElementById('sick-cert-modal-close').innerHTML = Icons.render('close');

// Tab toggling
const tabBtnDispatch = document.getElementById('tab-btn-dispatch');
const tabBtnRenewals = document.getElementById('tab-btn-renewals');
const tabBtnSickLeaves = document.getElementById('tab-btn-sick-leaves');

const sectionDispatch = document.getElementById('section-dispatch');
const sectionRenewals = document.getElementById('section-renewals');
const sectionSickLeaves = document.getElementById('section-sick-leaves');

if (document.getElementById('renewals-tab-icon')) {
  document.getElementById('renewals-tab-icon').innerHTML = Icons.render('filecheck');
}

function activateTab(activeBtn, activeSection) {
  [tabBtnDispatch, tabBtnRenewals, tabBtnSickLeaves].forEach(btn => {
    if (!btn) return;
    const isActive = btn === activeBtn;
    btn.style.fontWeight = isActive ? '700' : '600';
    btn.style.color = isActive ? 'var(--color-text)' : 'var(--color-text-muted)';
    btn.style.borderBottom = isActive ? '2px solid var(--color-primary)' : 'none';
  });
  [sectionDispatch, sectionRenewals, sectionSickLeaves].forEach(sec => {
    if (!sec) return;
    sec.style.display = sec === activeSection ? 'block' : 'none';
  });
}

tabBtnDispatch.addEventListener('click', () => {
  activateTab(tabBtnDispatch, sectionDispatch);
  loadStaff();
});

if (tabBtnRenewals) {
  tabBtnRenewals.addEventListener('click', () => {
    activateTab(tabBtnRenewals, sectionRenewals);
    loadRenewals();
  });
}

// Renewals search + dept filter + status filter listeners
const renewalsSearchInput = document.getElementById('renewals-search-input');
const renewalsDeptFilter  = document.getElementById('renewals-dept-filter-select');
const renewalsStatusFilter = document.getElementById('renewals-status-filter-select');
const renewalsResetBtn     = document.getElementById('renewals-reset-btn');

if (renewalsSearchInput) renewalsSearchInput.addEventListener('input', debounce(loadRenewals, 250));
if (renewalsDeptFilter)  renewalsDeptFilter.addEventListener('change', loadRenewals);
if (renewalsStatusFilter) renewalsStatusFilter.addEventListener('change', loadRenewals);
if (renewalsResetBtn) {
  renewalsResetBtn.addEventListener('click', () => {
    if (renewalsSearchInput) renewalsSearchInput.value = '';
    if (renewalsDeptFilter) renewalsDeptFilter.value = 'all';
    if (renewalsStatusFilter) renewalsStatusFilter.value = 'all';
    loadRenewals();
  });
}

tabBtnSickLeaves.addEventListener('click', () => {
  activateTab(tabBtnSickLeaves, sectionSickLeaves);
  loadSickLeaves();
});

async function loadRenewals() {
  const region = document.getElementById('renewals-table-region');
  if (!region) return;
  region.innerHTML = '<div class="empty-state"><span class="spinner"></span><p>Loading 6-month checkup renewal statuses…</p></div>';

  try {
    const isMgr = isManagerUser(currentUser);
    const renSelect = document.getElementById('renewals-dept-filter-select');
    const renStatusSelect = document.getElementById('renewals-status-filter-select');
    const statusFilter = renStatusSelect ? renStatusSelect.value : 'all';

    let dept = 'all';
    if (isMgr) {
      dept = renSelect ? renSelect.value : 'all';
    } else if (currentUser && currentUser.department) {
      dept = currentUser.department;
    }

    const params = {};
    if (dept && dept !== 'all') params.department = dept;
    if (statusFilter && statusFilter !== 'all') params.status = statusFilter;

    let list = await Api.checkups.all(params);

    // Client-side search & status filtering
    const searchRaw = (document.getElementById('renewals-search-input') || {}).value || '';
    const searchTerm = searchRaw.trim().toLowerCase();
    if (searchTerm) {
      list = list.filter(p =>
        (p.full_name   || '').toLowerCase().includes(searchTerm) ||
        (p.patient_code|| '').toLowerCase().includes(searchTerm) ||
        (p.position    || '').toLowerCase().includes(searchTerm) ||
        (p.department  || '').toLowerCase().includes(searchTerm)
      );
    }

    if (statusFilter && statusFilter !== 'all') {
      list = list.filter(p => {
        const hasCert = p.has_certificate !== false && (p.latest_certificate_id || p.last_fitness_exam_date);
        const daysLeft = hasCert && p.days_remaining !== null && p.days_remaining !== undefined ? Number(p.days_remaining) : null;
        if (statusFilter === 'active_fit') return (p.checkup_status === 'active_fit' || (hasCert && daysLeft > 7));
        if (statusFilter === 'due_soon') return p.checkup_status === 'due_soon' || (hasCert && daysLeft >= 0 && daysLeft <= 7);
        if (statusFilter === 'overdue') return p.checkup_status === 'overdue' || (hasCert && daysLeft < 0);
        if (statusFilter === 'no_certificate') return !hasCert || p.checkup_status === 'no_certificate';
        return true;
      });
    }

    if (!list.length) {
      const emptyMsg = searchTerm || (statusFilter !== 'all')
        ? `No employees match your search/filter criteria. Try adjusting the status or search terms.`
        : '6-month fitness check-up renewal schedules for your department will appear here.';
      region.innerHTML = `
        <div class="table-wrap">
          <div class="empty-state">
            <div class="empty-icon">${Icons.render('filecheck')}</div>
            <h3>No employees found</h3>
            <p>${emptyMsg}</p>
          </div>
        </div>`;
      return;
    }

    const dueCount = list.filter(item => item.checkup_status === 'due_soon' || item.checkup_status === 'overdue').length;

    region.innerHTML = `
      ${dueCount > 0 ? `
        <div class="notice notice-warning" style="margin-bottom:16px; display:flex; align-items:center; gap:10px;">
          <span style="display:inline-flex; width:20px; height:20px;">${Icons.render('alert')}</span>
          <div>
            <strong>1-Week Renewal Alert:</strong> ${dueCount} employee(s) in your department have 6-month medical fit cards expiring within 7 days or overdue.
          </div>
        </div>
      ` : ''}
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Employee Code</th>
              <th>Full Name</th>
              <th>Department</th>
              <th>Position</th>
              <th>Last Exam Date</th>
              <th>Card Expiry Date</th>
              <th>Days Left</th>
              <th>Status</th>
              <th style="text-align:right;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(p => {
              const hasCert = p.has_certificate !== false && (p.latest_certificate_id || p.last_fitness_exam_date);
              const lastExam = p.last_fitness_exam_date ? UI.formatDate(p.last_fitness_exam_date) : (hasCert ? 'Recorded' : '<span class="text-muted">Not recorded</span>');
              const nextDue = p.next_checkup_due_date ? UI.formatDate(p.next_checkup_due_date) : (hasCert ? '—' : '<span class="text-muted">Pending initial cert</span>');
              const daysLeft = hasCert && p.days_remaining !== null && p.days_remaining !== undefined ? Number(p.days_remaining) : null;

              let statusBadge = '<span class="badge badge-success"><span class="badge-dot"></span>Active Fit</span>';
              if (!hasCert || p.checkup_status === 'no_certificate') {
                statusBadge = '<span class="badge badge-neutral" style="background:#FEF3C7; color:#92400E; border:1px solid #FCD34D; font-weight:700;"><span class="badge-dot" style="background:#D97706;"></span>No Certificate</span>';
              } else if (p.checkup_status === 'overdue') {
                statusBadge = '<span class="badge badge-danger"><span class="badge-dot"></span>Expired (Overdue)</span>';
              } else if (p.checkup_status === 'due_soon') {
                statusBadge = '<span class="badge badge-warning"><span class="badge-dot"></span>Due Soon</span>';
              }

              return `
                <tr>
                  <td class="cell-primary" style="font-weight:700;">${UI.escapeHtml(p.patient_code || '—')}</td>
                  <td style="font-weight:600;">${UI.escapeHtml(p.full_name || '—')}</td>
                  <td><span class="badge badge-info">${UI.escapeHtml(p.department || 'General')}</span></td>
                  <td class="cell-muted">${UI.escapeHtml(p.position || 'Staff')}</td>
                  <td>${lastExam}</td>
                  <td style="font-weight:600;">${nextDue}</td>
                  <td>${daysLeft !== null ? (daysLeft < 0 ? `<span class="badge badge-danger" style="font-weight:800;">Overdue ${Math.abs(daysLeft)}d</span>` : `<span class="badge ${daysLeft <= 7 ? 'badge-warning' : 'badge-neutral'}" style="font-weight:700;">${daysLeft}d</span>`) : '—'}</td>
                  <td>${statusBadge}</td>
                  <td style="text-align:right;">
                    <button class="btn btn-primary btn-sm" onclick="dispatchRenewalCheckupFromDept('${p.id}', '${UI.escapeHtml(p.full_name)}')">
                      ${Icons.render('plus')} ${hasCert ? 'Renewal Check up' : 'Send for Exam'}
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    region.innerHTML = `<div class="notice notice-danger">${UI.escapeHtml(UI.errorMessage(err))}</div>`;
  }
}

async function dispatchRenewalCheckupFromDept(patientId, patientName) {
  if (!confirm(`Create a 6-Month Fitness Renewal Visit for ${patientName}?`)) return;
  try {
    await Api.checkups.dispatchRenewal({
      patient_id: patientId,
      reason: 'Periodic 6-Month Medical Fitness Renewal Checkup'
    });
    UI.toast(`Renewal visit created for ${patientName}. Employee can now report to clinic for examination.`);
    loadRenewals();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  }
}

// Load Current User Info & Department
async function loadUserInfo() {
  try {
    const [user, depts] = await Promise.all([
      Api.profile.get(),
      Api.departments.list().catch(() => []),
    ]);
    currentUser = user;
    const deptBadge = document.getElementById('dept-badge-container');
    const isMgr = isManagerUser(currentUser);

    const deptOptions = `<option value="all">All departments</option>` +
      depts.map(d => `<option value="${UI.escapeHtml(d.name)}">${UI.escapeHtml(d.name)}</option>`).join('');

    const filter = document.getElementById('dept-filter-select');
    if (filter) filter.innerHTML = deptOptions;
    const renFilter = document.getElementById('renewals-dept-filter-select');
    if (renFilter) renFilter.innerHTML = deptOptions;
    const sickFilter = document.getElementById('sick-dept-filter-select');
    if (sickFilter) sickFilter.innerHTML = deptOptions;

    if (isMgr) {
      deptBadge.innerHTML = `<span class="badge badge-primary" style="font-size:13px; padding:6px 12px; background:linear-gradient(135deg, var(--color-primary), #4f46e5); color:#fff; font-weight:700;">Assigned: <strong>Manager (All Departments Access)</strong></span>`;
      if (filter) { filter.disabled = false; filter.value = 'all'; }
      if (renFilter) { renFilter.disabled = false; renFilter.value = 'all'; }
      if (sickFilter) { sickFilter.disabled = false; sickFilter.value = 'all'; }
    } else if (currentUser.department) {
      deptBadge.innerHTML = `<span class="badge badge-primary" style="font-size:13px; padding:6px 12px;">Assigned Department: <strong>${UI.escapeHtml(currentUser.department)}</strong></span>`;
      if (filter) filter.value = currentUser.department;
      if (renFilter) renFilter.value = currentUser.department;
      if (sickFilter) sickFilter.value = currentUser.department;
    } else {
      deptBadge.innerHTML = `<span class="badge badge-neutral" style="font-size:13px; padding:6px 12px;">Assigned Department: <strong>All Departments</strong></span>`;
    }
  } catch (err) {
    console.error('Failed to fetch user profile:', err);
  }
}

// Load Staff List for Checkup Dispatch
async function loadStaff() {
  const region = document.getElementById('staff-table-region');
  region.innerHTML = '<div class="empty-state"><span class="spinner"></span><p>Loading staff records…</p></div>';

  const search = document.getElementById('staff-search-input').value.trim();
  const isMgr = isManagerUser(currentUser);
  const filterEl = document.getElementById('dept-filter-select');
  let department = 'all';
  if (isMgr) {
    department = filterEl ? filterEl.value : 'all';
  } else if (currentUser && currentUser.department) {
    department = currentUser.department;
  }

  try {
    const params = {};
    if (search) params.search = search;
    if (department && department !== 'all') params.department = department;

    patientsCache = await Api.patients.list(params);

    const fitnessFilterEl = document.getElementById('staff-fitness-filter-select');
    const fitnessFilter = fitnessFilterEl ? fitnessFilterEl.value : 'all';
    if (fitnessFilter && fitnessFilter !== 'all') {
      if (fitnessFilter === 'fit') {
        patientsCache = patientsCache.filter(p => p.fitness_status === 'fit');
      } else if (fitnessFilter === 'unfit') {
        patientsCache = patientsCache.filter(p => p.fitness_status === 'unfit');
      } else if (fitnessFilter === 'unknown') {
        patientsCache = patientsCache.filter(p => !p.fitness_status || (p.fitness_status !== 'fit' && p.fitness_status !== 'unfit'));
      }
    }

    if (!patientsCache.length) {
      region.innerHTML = `
        <div class="table-wrap">
          <div class="empty-state">
            <div class="empty-icon">${Icons.render('users')}</div>
            <h3>No department staff found</h3>
            <p>Try refining your search or select a different department/fitness filter.</p>
          </div>
        </div>`;
      return;
    }

    region.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Employee Code</th>
              <th>Full Name</th>
              <th>Department</th>
              <th>Medical Certificate</th>
              <th>Position</th>
              <th>Phone</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${patientsCache.map(p => `
              <tr>
                <td class="cell-primary" style="font-weight:700;">${UI.escapeHtml(p.patient_code)}</td>
                <td>
                  <div style="display:flex; align-items:center; gap:8px;">
                    ${UI.avatar(p.full_name, p.photo_url, 'width:28px; height:28px; font-size:10px;')}
                    <span style="font-weight:600;">${UI.escapeHtml(p.full_name)}</span>
                  </div>
                </td>
                <td><span class="badge badge-info">${UI.escapeHtml(p.department || 'General')}</span></td>
                <td>${UI.medicalCertificateBadge(p)}</td>
                <td class="cell-muted">${UI.escapeHtml(p.position || 'Staff')}</td>
                <td class="cell-muted">${UI.escapeHtml(p.phone || '—')}</td>
                <td style="text-align:right;">
                  <button class="btn btn-secondary btn-sm" onclick="openStaffRecord('${p.id}')">
                    ${Icons.render('eye')} View Record
                  </button>
                  <button class="btn btn-primary btn-sm" onclick="openDispatchModal('${p.id}')">
                    ${Icons.render('plus')} Send for Checkup
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    region.innerHTML = `<div class="notice notice-danger">${UI.escapeHtml(UI.errorMessage(err))}</div>`;
  }
}

// Dispatch Checkup Modal
function openDispatchModal(patientId) {
  const patient = patientsCache.find(p => String(p.id) === String(patientId));
  if (!patient) return;
  selectedPatientForDispatch = patient;

  document.getElementById('df-patient-id').value = patient.id;
  document.getElementById('df-staff-name').value = patient.full_name;
  document.getElementById('df-staff-dept').value = patient.department || 'General';
  document.getElementById('df-staff-pos').value = patient.position || 'Staff';
  document.getElementById('df-reason').value = '';
  document.getElementById('dispatch-modal-backdrop').classList.add('visible');
}

async function openStaffRecord(patientId) {
  try {
    const data = await Api.staff.getMedicalRecord(patientId);
    renderStaffRecordModal(data);
    document.getElementById('staff-record-modal-backdrop').classList.add('visible');
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  }
}

function closeStaffRecord() {
  document.getElementById('staff-record-modal-backdrop').classList.remove('visible');
}
document.getElementById('staff-record-modal-close').addEventListener('click', closeStaffRecord);
document.getElementById('staff-record-modal-cancel').addEventListener('click', closeStaffRecord);
document.getElementById('staff-record-modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'staff-record-modal-backdrop') closeStaffRecord();
});

function renderStaffRecordModal(data) {
  const { patient, sick_leaves, hr_notes } = data;
  const container = document.getElementById('staff-record-modal-body');

  const daysLeft = patient.days_remaining !== null && patient.days_remaining !== undefined ? Number(patient.days_remaining) : null;
  let statusBadge = '<span class="badge badge-neutral">Unknown</span>';
  if (patient.fitness_status === 'fit') {
    statusBadge = '<span class="badge badge-success"><span class="badge-dot"></span>Medical Fit</span>';
  } else if (patient.fitness_status === 'unfit') {
    statusBadge = '<span class="badge badge-danger"><span class="badge-dot"></span>Medical Unfit</span>';
  }

  container.innerHTML = `
    <div style="display:flex; gap:16px; margin-bottom:20px; flex-wrap:wrap;">
      <div style="flex:1; min-width:250px; background:var(--color-bg-secondary); padding:16px; border-radius:8px;">
        <h4 style="margin-top:0; margin-bottom:12px;">Employee Information</h4>
        <div style="display:grid; grid-template-columns:120px 1fr; gap:8px; font-size:13.5px;">
          <div class="text-muted">Full Name:</div><div style="font-weight:600;">${UI.escapeHtml(patient.full_name)}</div>
          <div class="text-muted">Code:</div><div>${UI.escapeHtml(patient.patient_code)}</div>
          <div class="text-muted">Department:</div><div>${UI.escapeHtml(patient.department || '—')}</div>
          <div class="text-muted">Position:</div><div>${UI.escapeHtml(patient.position || '—')}</div>
        </div>
      </div>
      
      <div style="flex:1; min-width:250px; background:var(--color-bg-secondary); padding:16px; border-radius:8px;">
        <h4 style="margin-top:0; margin-bottom:12px;">Checkup Status</h4>
        <div style="display:grid; grid-template-columns:120px 1fr; gap:8px; font-size:13.5px;">
          <div class="text-muted">Last Exam:</div><div>${patient.last_fitness_exam_date ? UI.formatDate(patient.last_fitness_exam_date) : '—'}</div>
          <div class="text-muted">Next Due:</div><div style="font-weight:600;">${patient.next_checkup_due_date ? UI.formatDate(patient.next_checkup_due_date) : '—'}</div>
          <div class="text-muted">Days Left:</div><div>${daysLeft !== null ? (daysLeft < 0 ? `<span class="text-danger">Overdue by ${Math.abs(daysLeft)}d</span>` : `${daysLeft} days`) : '—'}</div>
          <div class="text-muted">Fitness:</div><div>${statusBadge}</div>
        </div>
      </div>
    </div>
    
    <div style="margin-bottom:20px;">
      <h4 style="margin-bottom:10px;">Physician Advice Notes (Last 50)</h4>
      ${hr_notes && hr_notes.length ? `
        <div style="display:flex; flex-direction:column; gap:12px;">
          ${hr_notes.map(note => `
            <div style="border:1px solid var(--color-border); border-radius:6px; padding:12px; background:#fff;">
              <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:12px;" class="text-muted">
                <span><strong>Visit Date:</strong> ${UI.formatDate(note.visit_date)}</span>
                <span><strong>Physician:</strong> ${UI.escapeHtml(note.physician_name || '—')}</span>
              </div>
              <div style="margin-bottom:8px; font-size:13px;"><strong class="text-muted">Complaint:</strong> ${UI.escapeHtml(note.chief_complaint || '')}</div>
              <div style="padding:10px; background:var(--color-bg-secondary); border-radius:4px; font-size:14px; font-weight:500; color:var(--color-text); border-left:3px solid var(--color-primary);">
                ${UI.escapeHtml(note.hr_note).replace(/\n/g, '<br>')}
              </div>
            </div>
          `).join('')}
        </div>
      ` : `<p class="text-muted" style="font-size:13px; font-style:italic;">No advice notes from physicians for this employee.</p>`}
    </div>
    
    <div>
      <h4 style="margin-bottom:10px;">Recent Sick Leaves (Last 12 Months)</h4>
      ${sick_leaves && sick_leaves.length ? `
        <div class="table-wrap" style="box-shadow:none; border:1px solid var(--color-border); padding:0;">
          <table class="data-table" style="font-size:13px;">
            <thead>
              <tr>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Duration</th>
                <th>Physician</th>
                <th style="text-align:right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${sick_leaves.map(sl => {
    const start = new Date(sl.leave_start);
    const end = new Date(sl.leave_end);
    const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    return `
                <tr>
                  <td>${UI.formatDate(sl.leave_start)}</td>
                  <td>${UI.formatDate(sl.leave_end)}</td>
                  <td style="font-weight:600;">${days} days</td>
                  <td class="text-muted">${UI.escapeHtml(sl.physician_name || '—')}</td>
                  <td style="text-align:right;">
                    <button class="btn btn-ghost btn-sm" style="color:var(--color-primary); padding:2px 6px; font-size:11px; display:inline-flex; align-items:center; gap:3px;" title="Print Sick Leave Certificate" onclick="printSickLeave('${sl.id}', event)">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Print
                    </button>
                    <button class="btn btn-ghost btn-sm" style="color:var(--color-danger); padding:2px 6px; font-size:11px; display:inline-flex; align-items:center; gap:3px;" title="Delete Sick Leave" onclick="deleteSickLeaveFromStaffRecord('${sl.id}', '${patient.id}')">
                      ${Icons.render('trash')} Delete
                    </button>
                  </td>
                </tr>
                `;
  }).join('')}
            </tbody>
          </table>
        </div>
      ` : `<p class="text-muted" style="font-size:13px; font-style:italic;">No recent sick leaves.</p>`}
    </div>
  `;
}


function closeDispatchModal() {
  document.getElementById('dispatch-modal-backdrop').classList.remove('visible');
  selectedPatientForDispatch = null;
}

document.getElementById('dispatch-modal-close').addEventListener('click', closeDispatchModal);
document.getElementById('dispatch-form-cancel').addEventListener('click', closeDispatchModal);
document.getElementById('dispatch-modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'dispatch-modal-backdrop') closeDispatchModal();
});

document.getElementById('dispatch-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedPatientForDispatch) return;

  const btn = document.getElementById('dispatch-form-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Creating Visit…';

  try {
    const payload = {
      patient_id: selectedPatientForDispatch.id,
      chief_complaint: document.getElementById('df-reason').value.trim() || 'Periodic Medical Check-up / Health Assessment',
    };

    await Api.visits.create(payload);
    UI.toast(`Checkup visit created for ${selectedPatientForDispatch.full_name}. Staff can now report to clinic for physician examination.`);
    closeDispatchModal();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Checkup Visit';
  }
});

// Load Department Sick Leaves
async function loadSickLeaves() {
  const region = document.getElementById('sick-leaves-table-region');
  region.innerHTML = '<div class="empty-state"><span class="spinner"></span><p>Loading sick leaves…</p></div>';

  const search = document.getElementById('sick-search-input').value.trim();
  const isMgr = isManagerUser(currentUser);
  const filterEl = document.getElementById('sick-dept-filter-select');
  let department = 'all';
  if (isMgr) {
    department = filterEl ? filterEl.value : 'all';
  } else if (currentUser && currentUser.department) {
    department = currentUser.department;
  }

  try {
    const params = {};
    if (search) params.search = search;
    if (department && department !== 'all') params.department = department;

    sickLeavesCache = await Api.sickLeaves.list(params);

    if (!sickLeavesCache.length) {
      region.innerHTML = `
        <div class="table-wrap">
          <div class="empty-state">
            <div class="empty-icon">${Icons.render('referrals')}</div>
            <h3>No sick leave certificates found</h3>
            <p>Sick leave certificates issued by physicians for your department staff will appear here.</p>
          </div>
        </div>`;
      return;
    }

    const autoVisitLeaves = sickLeavesCache.filter(s => s.auto_visit_id);
    let notificationBannerHtml = `
      <div class="notice notice-info" style="margin-bottom:16px; display:flex; align-items:center; gap:10px;">
        <span style="display:inline-flex; width:20px; height:20px;">${Icons.render('info')}</span>
        <div>
          <strong>Automatic Sick Leave Follow-up System Active:</strong>
          ${autoVisitLeaves.length ? ` ${autoVisitLeaves.length} employee sick leave(s) completed and automatically scheduled for clinic follow-up checkup examination.` : ' When an employee\'s sick leave period ends, a follow-up checkup visit is automatically created for clinic examination.'}
        </div>
      </div>`;

    region.innerHTML = `
      ${notificationBannerHtml}
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Employee Code</th>
              <th>Full Name</th>
              <th>Department</th>
              <th>Leave Start</th>
              <th>Leave End</th>
              <th>Duration</th>
              <th>Follow-up Status</th>
              <th style="text-align:right;">Certificate</th>
            </tr>
          </thead>
          <tbody>
            ${sickLeavesCache.map(s => {
      const startDate = UI.formatDate(s.leave_start);
      const endDate = UI.formatDate(s.leave_end);
      const daysCount = (function (item) {
        if (item.days !== undefined && item.days !== null && !isNaN(Number(item.days))) return Number(item.days);
        if (!item.leave_start || !item.leave_end) return 1;
        const st = new Date(item.leave_start);
        const en = new Date(item.leave_end);
        return Math.max(1, Math.ceil(Math.abs(en - st) / (1000 * 60 * 60 * 24)) + 1);
      })(s);
      const isAutoCreated = Boolean(s.auto_visit_id);
      return `
                <tr>
                  <td class="cell-primary" style="font-weight:700;">${UI.escapeHtml(s.patient_code || '—')}</td>
                  <td style="font-weight:600;">${UI.escapeHtml(s.patient_name || '—')}</td>
                  <td><span class="badge badge-info">${UI.escapeHtml(s.department || 'General')}</span></td>
                  <td>${startDate}</td>
                  <td>${endDate}</td>
                  <td><span class="badge badge-warning" style="font-weight:700;">${daysCount} Day${daysCount > 1 ? 's' : ''}</span></td>
                  <td>
                    ${isAutoCreated ? `<span class="badge badge-success" title="Follow-up checkup visit auto-created for clinic examination"><span class="badge-dot"></span>Checkup Auto-Scheduled</span>` : `<span class="badge badge-neutral">Active Leave</span>`}
                  </td>
                  <td style="text-align:right;">
                    <button class="btn btn-secondary btn-sm" onclick="openSickCertModal('${s.id}')">
                      ${Icons.render('filecheck')} View Certificate
                    </button>
                    <button class="btn btn-ghost btn-sm" style="color:var(--color-danger); margin-left:4px; padding:4px 8px;" title="Delete Certificate" onclick="deleteSickLeaveFromDept('${s.id}')">
                      ${Icons.render('trash')}
                    </button>
                  </td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    region.innerHTML = `<div class="notice notice-danger">${UI.escapeHtml(UI.errorMessage(err))}</div>`;
  }
}

// View Sick Leave Certificate Modal
function openSickCertModal(id) {
  const item = sickLeavesCache.find(s => String(s.id) === String(id));
  if (!item) return;

  const delBtn = document.getElementById('sick-cert-modal-delete');
  if (delBtn) delBtn.onclick = () => deleteSickLeaveFromDept(item.id);

  const modalBody = document.getElementById('sick-cert-modal-body');
  modalBody.innerHTML = `
    <div style="border:2px solid var(--color-primary-light, #E0F2F1); border-radius:12px; padding:24px; background:#fff; font-family:var(--font-sans);">
      
      <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid var(--color-primary, #00897B); padding-bottom:16px; margin-bottom:20px;">
        <div>
          <div style="font-size:20px; font-weight:800; color:var(--color-primary-dark, #004D40); letter-spacing:0.5px;">TPPF CLINIC MEDICAL SERVICES</div>
          <div style="font-size:12px; color:var(--color-text-muted, #555); margin-top:2px;">OFFICIAL EMPLOYEE SICK LEAVE CERTIFICATE</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px; text-transform:uppercase; color:#888;">Certificate Ref</div>
          <div style="font-size:14px; font-weight:700; color:var(--color-primary);">SLC-${String(item.id).padStart(5, '0')}</div>
        </div>
      </div>

      <div class="detail-grid" style="grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:20px;">
        <div class="detail-item"><div class="k">Employee Name</div><div class="v" style="font-size:16px;">${UI.escapeHtml(item.patient_name)}</div></div>
        <div class="detail-item"><div class="k">Employee Code</div><div class="v" style="font-size:16px;">${UI.escapeHtml(item.patient_code)}</div></div>
        <div class="detail-item"><div class="k">Department</div><div class="v">${UI.escapeHtml(item.department || 'General')}</div></div>
      </div>

      <div style="background:var(--color-bg-secondary, #F4F6F6); border-radius:8px; padding:16px; margin-bottom:20px;">
        <div style="font-size:12px; font-weight:700; text-transform:uppercase; color:var(--color-text-muted); margin-bottom:8px;">Authorized Leave Period</div>
        <div style="display:flex; align-items:center; gap:20px; flex-wrap:wrap;">
          <div><span style="font-size:12px; color:#666;">From:</span> <strong style="font-size:14px;">${UI.formatDate(item.leave_start)}</strong></div>
          <div><span style="font-size:12px; color:#666;">To:</span> <strong style="font-size:14px;">${UI.formatDate(item.leave_end)}</strong></div>
          <div><span style="font-size:12px; color:#666;">Total Duration:</span> <span class="badge badge-warning" style="font-size:13px; font-weight:800;">${(function (it) { if (it.days !== undefined && it.days !== null && !isNaN(Number(it.days))) return Number(it.days); if (!it.leave_start || !it.leave_end) return 1; return Math.max(1, Math.ceil(Math.abs(new Date(it.leave_end) - new Date(it.leave_start)) / (1000 * 60 * 60 * 24)) + 1); })(item)} Day${((function (it) { if (it.days !== undefined && it.days !== null && !isNaN(Number(it.days))) return Number(it.days); if (!it.leave_start || !it.leave_end) return 1; return Math.max(1, Math.ceil(Math.abs(new Date(it.leave_end) - new Date(it.leave_start)) / (1000 * 60 * 60 * 24)) + 1); })(item)) > 1 ? 's' : ''}</span></div>
        </div>
      </div>

      ${item.note ? `
        <div style="margin-bottom:20px;">
          <div style="font-size:12px; font-weight:700; text-transform:uppercase; color:var(--color-text-muted); margin-bottom:4px;">Medical Leave Justification Note</div>
          <div style="font-size:13.5px; background:#FAFAFA; border:1px solid #E0E0E0; border-radius:6px; padding:10px 12px; color:#333;">${UI.escapeHtml(item.note)}</div>
        </div>
      ` : ''}

      <div style="display:flex; justify-content:flex-end; align-items:flex-end; border-top:1px dashed var(--color-border, #CCC); padding-top:16px; margin-top:24px;">
        <div style="text-align:right;">
          <div style="font-size:11px; color:#888;">Issue Date</div>
          <div style="font-size:13px; font-weight:600;">${UI.formatDate(item.created_at || item.leave_start)}</div>
        </div>
      </div>

    </div>
  `;

  document.getElementById('sick-cert-modal-backdrop').classList.add('visible');
}

window.deleteSickLeaveFromDept = async function(id) {
  if (!confirm('Are you sure you want to delete this sick leave certificate? It will also be removed from the patient visit record and staff medical file.')) return;
  try {
    await Api.sickLeaves.delete(id);
    UI.toast('Sick leave certificate deleted.');
    closeSickCertModal();
    loadSickLeaves();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  }
};

window.deleteSickLeaveFromStaffRecord = async function(slId, patientId) {
  if (!confirm('Are you sure you want to delete this sick leave certificate? It will be removed from this staff record and their clinic visit history.')) return;
  try {
    await Api.sickLeaves.delete(slId);
    UI.toast('Sick leave certificate deleted.');
    await openStaffRecord(patientId);
    loadSickLeaves();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  }
};


function closeSickCertModal() {
  document.getElementById('sick-cert-modal-backdrop').classList.remove('visible');
}

document.getElementById('sick-cert-modal-close').addEventListener('click', closeSickCertModal);
document.getElementById('sick-cert-modal-cancel').addEventListener('click', closeSickCertModal);
document.getElementById('sick-cert-modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'sick-cert-modal-backdrop') closeSickCertModal();
});

// Search and Filter Listeners
document.getElementById('staff-search-input').addEventListener('input', debounce(loadStaff, 250));
document.getElementById('dept-filter-select').addEventListener('change', loadStaff);
const staffFitnessFilter = document.getElementById('staff-fitness-filter-select');
if (staffFitnessFilter) staffFitnessFilter.addEventListener('change', loadStaff);
const staffResetBtn = document.getElementById('staff-reset-btn');
if (staffResetBtn) {
  staffResetBtn.addEventListener('click', () => {
    document.getElementById('staff-search-input').value = '';
    document.getElementById('dept-filter-select').value = 'all';
    if (staffFitnessFilter) staffFitnessFilter.value = 'all';
    loadStaff();
  });
}

if (document.getElementById('renewals-dept-filter-select')) {
  document.getElementById('renewals-dept-filter-select').addEventListener('change', loadRenewals);
}
document.getElementById('sick-search-input').addEventListener('input', debounce(loadSickLeaves, 250));
window.printSickLeave = async function(id, event) {
  if (event) event.stopPropagation();
  try {
    const s = await Api.sickLeaves.get(id);
    if (typeof PrintDoc !== 'undefined') {
      PrintDoc.sickLeave(s);
    } else {
      window.print();
    }
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
};

async function init() {
  await loadUserInfo();
  await loadStaff();
}
init();
