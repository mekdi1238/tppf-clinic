/* ===========================================================
   Periodic 6-Month Medical Check-ups Controller (checkups.js)
   =========================================================== */

Auth.requireAuth();
if (RoleGuard.blockIfNotAllowed('checkups')) { throw new Error('redirecting'); }
renderShell('checkups');
setPageTitle('Periodic Check-ups');

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

document.getElementById('search-icon-slot').innerHTML = Icons.render('search');

async function loadCheckups() {
  const region = document.getElementById('checkups-table-region');
  region.innerHTML = '<div class="empty-state"><span class="spinner"></span><p>Loading employee checkup status…</p></div>';

  const search = document.getElementById('checkup-search-input').value.trim();
  const department = document.getElementById('dept-filter-select').value;
  const status = (document.getElementById('status-filter-select') || {}).value || 'all';

  try {
    let list = await Api.checkups.all({ search, department, status });

    if (status && status !== 'all') {
      list = list.filter(p => {
        const hasCert = p.has_certificate !== false && (p.latest_certificate_id || p.last_fitness_exam_date);
        if (status === 'active_fit') return (p.checkup_status === 'active_fit' || (hasCert && p.days_remaining > 7)) && p.fitness_status !== 'renewal_visit_created';
        if (status === 'due_soon') return p.checkup_status === 'due_soon';
        if (status === 'overdue') return p.checkup_status === 'overdue';
        if (status === 'no_certificate') return !hasCert || p.checkup_status === 'no_certificate';
        if (status === 'renewal_visit_created') return p.fitness_status === 'renewal_visit_created';
        return true;
      });
    }

    if (!list.length) {
      region.innerHTML = `
        <div class="table-wrap">
          <div class="empty-state">
            <div class="empty-icon">${Icons.render('filecheck')}</div>
            <h3>No employees found</h3>
            <p>Try adjusting your search query, department filter, or status filter.</p>
          </div>
        </div>`;
      return;
    }

    const dueSoonCount = list.filter(item => item.checkup_status === 'due_soon' || item.checkup_status === 'overdue').length;

    let bannerHtml = '';
    if (dueSoonCount > 0) {
      bannerHtml = `
        <div class="notice notice-warning" style="margin-bottom:16px; display:flex; align-items:center; gap:10px;">
          <span style="display:inline-flex; width:20px; height:20px;">${Icons.render('alert')}</span>
          <div>
            <strong>1-Week Check-up Renewal Alert:</strong>
            ${dueSoonCount} active employee(s) have 6-month medical fitness cards due for renewal or overdue.
          </div>
        </div>`;
    }

    region.innerHTML = `
      ${bannerHtml}
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:1%; white-space:nowrap; padding:10px 12px;">Employee Code</th>
              <th style="padding:10px 12px;">Full Name</th>
              <th style="padding:10px 12px;">Department</th>
              <th style="padding:10px 12px;">Position</th>
              <th style="width:1%; white-space:nowrap; padding:10px 12px;">Last Exam Date</th>
              <th style="width:1%; white-space:nowrap; padding:10px 12px;">Card Expiry Date</th>
              <th style="width:1%; white-space:nowrap; padding:10px 12px;">Days Left</th>
              <th style="width:1%; white-space:nowrap; padding:10px 12px;">Fit Card Status</th>
              <th style="width:1%; white-space:nowrap; text-align:right; padding:10px 12px;">Actions</th>
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
                statusBadge = '<span class="badge badge-neutral" style="background:#FEF3C7; color:#92400E; border:1px solid #FCD34D; font-weight:700;"><span class="badge-dot" style="background:#D97706;"></span>No Certificate Recorded</span>';
              } else if (p.checkup_status === 'overdue') {
                statusBadge = '<span class="badge badge-danger"><span class="badge-dot"></span>Expired (Overdue)</span>';
              } else if (p.checkup_status === 'due_soon') {
                statusBadge = '<span class="badge badge-warning"><span class="badge-dot"></span>Notice: Renewal Due Soon</span>';
              }

              if (p.fitness_status === 'renewal_visit_created') {
                statusBadge = '<span class="badge badge-info"><span class="badge-dot"></span>Renewal Visit Created</span>';
              }

              return `
                <tr>
                  <td class="cell-primary" style="font-weight:700; white-space:nowrap; padding:10px 12px;">${UI.escapeHtml(p.patient_code || '—')}</td>
                  <td style="font-weight:600; padding:10px 12px;">${UI.escapeHtml(p.full_name || '—')}</td>
                  <td style="white-space:nowrap; padding:10px 12px;"><span class="badge badge-info">${UI.escapeHtml(p.department || 'General')}</span></td>
                  <td class="cell-muted" style="white-space:nowrap; padding:10px 12px;">${UI.escapeHtml(p.position || 'Staff')}</td>
                  <td style="white-space:nowrap; padding:10px 12px;">${lastExam}</td>
                  <td style="font-weight:600; white-space:nowrap; padding:10px 12px;">${nextDue}</td>
                  <td style="white-space:nowrap; padding:10px 12px;">
                    ${daysLeft !== null ? (daysLeft < 0 ? `<span class="badge badge-danger" style="font-weight:800;">Overdue ${Math.abs(daysLeft)}d</span>` : `<span class="badge ${daysLeft <= 7 ? 'badge-warning' : 'badge-neutral'}" style="font-weight:700;">${daysLeft} Day${daysLeft === 1 ? '' : 's'}</span>`) : '—'}
                  </td>
                  <td style="white-space:nowrap; padding:10px 12px;">${statusBadge}</td>
                  <td style="text-align:right; white-space:nowrap; padding:10px 12px;">
                    <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-end;">
                      ${!hasCert ? `
                        <a href="certifications.html?patientId=${p.id}" class="btn btn-primary btn-sm" style="width: 145px; padding:4px 8px; font-size:12px; justify-content:center; text-decoration:none;">
                          ${Icons.render('plus')} Record Certificate
                        </a>
                        <button class="btn btn-ghost btn-sm" style="width: 145px; padding:3px 8px; font-size:11px; justify-content:center;" onclick="dispatchRenewalCheckup('${p.id}', '${UI.escapeHtml(p.full_name)}')">
                          ${Icons.render('plus')} Start Exam Visit
                        </button>
                      ` : `
                        <button class="btn btn-secondary btn-sm" style="width: 130px; padding:3px 8px; font-size:12px; justify-content:center;" title="Edit exam date (paper records)" onclick="openEditExamDate('${p.id}', '${UI.escapeHtml(p.full_name)}', '${p.last_fitness_exam_date || ''}')">
                          ${Icons.render('edit')} Edit Date
                        </button>
                        ${p.checkup_status === 'due_soon' || p.checkup_status === 'overdue' ? `
                          <button class="btn btn-primary btn-sm" style="width: 130px; padding:3px 8px; font-size:12px; justify-content:center;" onclick="dispatchRenewalCheckup('${p.id}', '${UI.escapeHtml(p.full_name)}')">
                            ${Icons.render('plus')} Dispatch Renewal
                          </button>
                        ` : `
                          <button class="btn btn-ghost btn-sm" style="width: 130px; padding:3px 8px; font-size:12px; justify-content:center;" onclick="dispatchRenewalCheckup('${p.id}', '${UI.escapeHtml(p.full_name)}')">
                            ${Icons.render('plus')} Schedule Renewal
                          </button>
                        `}
                      `}
                    </div>
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

async function dispatchRenewalCheckup(patientId, patientName) {
  if (!confirm(`Create a 6-Month Fitness Renewal Visit for ${patientName}?`)) return;
  try {
    const visit = await Api.checkups.dispatchRenewal({
      patient_id: patientId,
      reason: 'Periodic 6-Month Medical Fitness Renewal Checkup'
    });
    UI.toast(`Renewal visit created for ${patientName}. Opening clinical visit window…`);
    window.location.href = `visits.html?open=${visit.id}`;
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  }
}

// ---------- Edit Exam Date Modal (Change A) ----------
function ensureEditExamModal() {
  if (document.getElementById('edit-exam-date-backdrop')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-backdrop" id="edit-exam-date-backdrop">
      <div class="modal" style="max-width:460px;">
        <div class="modal-header">
          <div>
            <h3 id="eed-title" style="margin:0; font-size:16px; font-weight:700;">Edit Fitness Exam Date</h3>
            <p id="eed-subtitle" class="text-muted" style="margin:4px 0 0; font-size:13px;"></p>
          </div>
          <button class="icon-btn" id="eed-close">${Icons.render('close')}</button>
        </div>
        <form id="eed-form" class="modal-body" style="padding:20px;">
          <p style="font-size:13px; color:var(--color-text-muted); margin:0 0 16px 0;">
            Set the actual date when the physical exam was conducted. The system will automatically calculate the 6-month card expiry from this date.
          </p>
          <input type="hidden" id="eed-patient-id" />
          <div class="field">
            <label for="eed-exam-date">Last Fitness Examination Date</label>
            <input type="date" id="eed-exam-date" required />
          </div>
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
            <button type="button" class="btn btn-secondary" id="eed-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary" id="eed-submit">${Icons.render('filecheck')} Save Exam Date</button>
          </div>
        </form>
      </div>
    </div>
  `);

  document.getElementById('eed-close').addEventListener('click', closeEditExamDate);
  document.getElementById('eed-cancel').addEventListener('click', closeEditExamDate);
  document.getElementById('edit-exam-date-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'edit-exam-date-backdrop') closeEditExamDate();
  });

  document.getElementById('eed-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const patientId = document.getElementById('eed-patient-id').value;
    const examDate = document.getElementById('eed-exam-date').value;
    if (!examDate) { UI.toast('Please select a date.', 'danger'); return; }

    const btn = document.getElementById('eed-submit');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving…';

    try {
      await Api.checkups.editExamDate({ patient_id: patientId, last_fitness_exam_date: examDate });
      UI.toast('Fitness exam date updated. 6-month expiry recalculated.');
      closeEditExamDate();
      loadCheckups();
    } catch (err) {
      UI.toast(UI.errorMessage(err), 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `${Icons.render('filecheck')} Save Exam Date`;
    }
  });
}

function openEditExamDate(patientId, patientName, currentDate) {
  ensureEditExamModal();
  document.getElementById('eed-patient-id').value = patientId;
  document.getElementById('eed-subtitle').textContent = patientName;
  document.getElementById('eed-exam-date').value = currentDate ? currentDate.slice(0, 10) : '';
  document.getElementById('edit-exam-date-backdrop').classList.add('visible');
}

function closeEditExamDate() {
  const el = document.getElementById('edit-exam-date-backdrop');
  if (el) el.classList.remove('visible');
}

document.getElementById('checkup-search-input').addEventListener('input', debounce(loadCheckups, 250));
document.getElementById('dept-filter-select').addEventListener('change', loadCheckups);

const statusFilterSelect = document.getElementById('status-filter-select');
if (statusFilterSelect) statusFilterSelect.addEventListener('change', loadCheckups);

async function loadDepartmentOptions() {
  try {
    const depts = await Api.departments.list();
    const deptSelect = document.getElementById('dept-filter-select');
    if (deptSelect) {
      const currentVal = deptSelect.value;
      deptSelect.innerHTML = `<option value="all">All departments</option>` +
        depts.map(d => `<option value="${UI.escapeHtml(d.name)}">${UI.escapeHtml(d.name)}</option>`).join('');
      if (currentVal && (currentVal === 'all' || depts.some(d => d.name === currentVal))) {
        deptSelect.value = currentVal;
      }
    }
  } catch (err) {
    console.error('Failed to load departments in checkups', err);
  }
}

async function init() {
  await loadDepartmentOptions();
  await loadCheckups();
}

init();
