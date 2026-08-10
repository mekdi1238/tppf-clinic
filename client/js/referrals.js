/* ===========================================================
   Referrals & Certificates page logic
   -----------------------------------------------------------
   Referrals/sick leaves are mock-only until the real backend
   routes exist (see BACKEND_HANDOFF.md). Visits/physicians
   come from the real API.
   =========================================================== */

Auth.requireAuth();
if (RoleGuard.blockIfNotAllowed('referrals')) { throw new Error('redirecting'); }
renderShell('referrals');
setPageTitle('Referrals & Certificates');

document.getElementById('search-icon-slot').innerHTML = Icons.render('search');
document.getElementById('plus-icon-slot').innerHTML = Icons.render('plus');
document.getElementById('sl-search-icon-slot').innerHTML = Icons.render('search');
document.getElementById('sl-plus-icon-slot').innerHTML = Icons.render('plus');
document.getElementById('referral-modal-close').innerHTML = Icons.render('close');
document.getElementById('referral-detail-close').innerHTML = Icons.render('close');
document.getElementById('sl-modal-close').innerHTML = Icons.render('close');
document.getElementById('sl-detail-close').innerHTML = Icons.render('close');

let physiciansCache = [];
let visitsCache = [];
let eligibleVisits = [];

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
function physicianName(id) {
  const p = physiciansCache.find(x => String(x.id) === String(id));
  return p ? p.full_name : '—';
}
function daysInclusive(start, end) {
  const ms = new Date(end) - new Date(start);
  return Math.round(ms / (1000 * 60 * 60 * 24)) + 1;
}

// ---------- Tabs ----------
function switchTab(tab) {
  document.getElementById('tab-referrals').style.display = tab === 'referrals' ? '' : 'none';
  document.getElementById('tab-sickleaves').style.display = tab === 'sickleaves' ? '' : 'none';
  document.getElementById('tab-btn-referrals').classList.toggle('active', tab === 'referrals');
  document.getElementById('tab-btn-sickleaves').classList.toggle('active', tab === 'sickleaves');
}
document.getElementById('tab-btn-referrals').addEventListener('click', () => switchTab('referrals'));
document.getElementById('tab-btn-sickleaves').addEventListener('click', () => switchTab('sickleaves'));

// ---------- Lookups ----------
async function loadLookups() {
  [physiciansCache, visitsCache] = await Promise.all([Api.physicians.list(), Api.visits.list()]);
  eligibleVisits = visitsCache.filter(v => v.status !== 'closed');

  const visitOptionsHtml = !eligibleVisits.length
    ? `<option value="">No open visits</option>`
    : `<option value="">Select a visit…</option>` + eligibleVisits.map(v =>
        `<option value="${v.id}" data-physician="${v.physician_id}" data-diagnosis="${UI.escapeHtml(v.diagnosis || '')}">${UI.escapeHtml(v.patient.full_name)} — ${v.patient.patient_code} · ${UI.formatDate(v.visit_date)}</option>`
      ).join('');

  document.getElementById('rf-visit').innerHTML = visitOptionsHtml;
  document.getElementById('sf-visit').innerHTML = visitOptionsHtml;

  if (eligibleVisits.length) {
    const visitOptions = eligibleVisits.map(v => ({
      value: v.id,
      label: `${v.patient ? v.patient.full_name : 'Patient'} (${v.patient ? v.patient.patient_code : ''})`,
      sublabel: `${UI.escapeHtml(v.chief_complaint || 'Visit')} · ${UI.formatDate(v.visit_date)}`
    }));
    UI.makeSearchableSelect(document.getElementById('rf-visit'), visitOptions, 'Search patient by name or code…');
    UI.makeSearchableSelect(document.getElementById('sf-visit'), visitOptions, 'Search patient by name or code…');
  }

  const physOptionsHtml = `<option value="">Select…</option>` +
    physiciansCache.map(p => `<option value="${p.id}">${UI.escapeHtml(p.full_name)}</option>`).join('');
  document.getElementById('rf-physician').innerHTML = physOptionsHtml;
  document.getElementById('sf-physician').innerHTML = physOptionsHtml;
}

document.getElementById('rf-visit').addEventListener('change', (e) => {
  const opt = e.target.selectedOptions[0];
  if (!opt) return;
  if (opt.dataset.physician) document.getElementById('rf-physician').value = opt.dataset.physician;
  if (opt.dataset.diagnosis) document.getElementById('rf-diagnosis').value = opt.dataset.diagnosis;
});
document.getElementById('sf-visit').addEventListener('change', (e) => {
  const opt = e.target.selectedOptions[0];
  if (!opt) return;
  if (opt.dataset.physician) document.getElementById('sf-physician').value = opt.dataset.physician;
  if (opt.dataset.diagnosis) document.getElementById('sf-diagnosis').value = opt.dataset.diagnosis;
});

// ================= Referrals =================
async function loadReferrals() {
  const search = document.getElementById('search-input').value.trim();
  try {
    const list = await Api.referrals.list({ search });
    renderReferralsTable(list);
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

function renderReferralsTable(list) {
  const region = document.getElementById('referrals-table-region');
  if (!list.length) {
    region.innerHTML = `
      <div class="table-wrap">
        <div class="empty-state">
          <div class="empty-icon">${Icons.render('referrals')}</div>
          <h3>No referrals found</h3>
          <p>Try a different search, or create a new referral.</p>
          <button class="btn btn-primary" onclick="openReferralForm()">${Icons.render('plus')} New Referral</button>
        </div>
      </div>`;
    return;
  }
  region.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Patient</th><th>Physician</th><th>Referred to</th><th>Date</th><th></th></tr></thead>
        <tbody>
          ${list.map(r => `
            <tr>
              <td class="cell-primary" style="cursor:pointer;" onclick="openReferralDetail('${r.id}')">
                ${UI.escapeHtml(r.patient_name)} <span class="cell-code">${UI.escapeHtml(r.patient_code)}</span>
              </td>
              <td class="cell-muted">${UI.escapeHtml(physicianName(r.physician_id))}</td>
              <td class="cell-muted">${UI.escapeHtml(r.referred_to)}</td>
              <td class="cell-muted">${UI.formatDateTime(r.referral_date)}</td>
              <td><button class="icon-btn" title="View" onclick="openReferralDetail('${r.id}')">${Icons.render('eye')}</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function openReferralForm(visitId = null) {
  if (!eligibleVisits.length) { UI.toast('No open visits are eligible for a referral.', 'danger'); return; }
  document.getElementById('referral-form').reset();
  if (visitId) {
    document.getElementById('rf-visit').value = visitId;
    document.getElementById('rf-visit').dispatchEvent(new Event('change'));
  }
  document.getElementById('referral-modal-backdrop').classList.add('visible');
}
function closeReferralForm() { document.getElementById('referral-modal-backdrop').classList.remove('visible'); }
document.getElementById('new-referral-btn').addEventListener('click', () => openReferralForm());
document.getElementById('referral-modal-close').addEventListener('click', closeReferralForm);
document.getElementById('referral-form-cancel').addEventListener('click', closeReferralForm);
document.getElementById('referral-modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'referral-modal-backdrop') closeReferralForm(); });

document.getElementById('referral-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const visitId = document.getElementById('rf-visit').value;
  const visit = eligibleVisits.find(v => String(v.id) === String(visitId));
  if (!visit) { UI.toast('Select a valid visit.', 'danger'); return; }

  const payload = {
    visit_id: visit.id,
    patient_name: visit.patient.full_name,
    patient_code: visit.patient.patient_code,
    physician_id: document.getElementById('rf-physician').value,
    diagnosis: document.getElementById('rf-diagnosis').value.trim(),
    referred_to: document.getElementById('rf-referred-to').value.trim(),
    reason: document.getElementById('rf-reason').value.trim(),
    note: document.getElementById('rf-note').value.trim(),
  };
  if (!payload.physician_id || !payload.referred_to) {
    UI.toast('Select the physician and enter where the patient is being referred to.', 'danger');
    return;
  }

  const btn = document.getElementById('referral-form-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';
  try {
    await Api.referrals.create(payload);
    UI.toast('Referral saved.');
    closeReferralForm();
    loadReferrals();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Referral';
  }
});

async function openReferralDetail(id) {
  try {
    const r = await Api.referrals.get(id);
    document.getElementById('rfd-name').textContent = r.patient_name;
    document.getElementById('rfd-sub').textContent = `${r.patient_code} · ${UI.formatDateTime(r.referral_date)}`;
    document.getElementById('referral-detail-body').innerHTML = `
      <div class="detail-grid">
        <div class="detail-item"><div class="k">Referring physician</div><div class="v">${UI.escapeHtml(physicianName(r.physician_id))}</div></div>
        <div class="detail-item"><div class="k">Referred to</div><div class="v">${UI.escapeHtml(r.referred_to)}</div></div>
        <div class="detail-item" style="grid-column:1/-1;"><div class="k">Diagnosis</div><div class="v">${UI.escapeHtml(r.diagnosis) || '—'}</div></div>
        <div class="detail-item" style="grid-column:1/-1;"><div class="k">Reason</div><div class="v" style="font-weight:500;">${UI.escapeHtml(r.reason) || '—'}</div></div>
        ${r.note ? `<div class="detail-item" style="grid-column:1/-1;"><div class="k">Note</div><div class="v" style="font-weight:500;">${UI.escapeHtml(r.note)}</div></div>` : ''}
      </div>
    `;
    document.getElementById('referral-detail-backdrop').classList.add('visible');
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}
function closeReferralDetail() { document.getElementById('referral-detail-backdrop').classList.remove('visible'); }
document.getElementById('referral-detail-close').addEventListener('click', closeReferralDetail);
document.getElementById('referral-detail-close-btn').addEventListener('click', closeReferralDetail);
document.getElementById('referral-detail-backdrop').addEventListener('click', (e) => { if (e.target.id === 'referral-detail-backdrop') closeReferralDetail(); });

document.getElementById('search-input').addEventListener('input', debounce(loadReferrals, 250));

// ================= Sick leaves =================
async function loadSickLeaves() {
  const search = document.getElementById('sl-search-input').value.trim();
  try {
    const list = await Api.sickLeaves.list({ search });
    renderSickLeavesTable(list);
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

function renderSickLeavesTable(list) {
  const region = document.getElementById('sickleaves-table-region');
  if (!list.length) {
    region.innerHTML = `
      <div class="table-wrap">
        <div class="empty-state">
          <div class="empty-icon">${Icons.render('filecheck')}</div>
          <h3>No sick leave certificates found</h3>
          <p>Try a different search, or issue a new certificate.</p>
          <button class="btn btn-primary" onclick="openSickLeaveForm()">${Icons.render('plus')} New Sick Leave</button>
        </div>
      </div>`;
    return;
  }
  region.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Patient</th><th>Physician</th><th>Leave period</th><th>Days</th><th></th></tr></thead>
        <tbody>
          ${list.map(s => `
            <tr>
              <td class="cell-primary" style="cursor:pointer;" onclick="openSickLeaveDetail('${s.id}')">
                ${UI.escapeHtml(s.patient_name)} <span class="cell-code">${UI.escapeHtml(s.patient_code)}</span>
              </td>
              <td class="cell-muted">${UI.escapeHtml(physicianName(s.physician_id))}</td>
              <td class="cell-muted">${UI.formatDate(s.leave_start)} — ${UI.formatDate(s.leave_end)}</td>
              <td class="cell-muted">${daysInclusive(s.leave_start, s.leave_end)}</td>
              <td><button class="icon-btn" title="View" onclick="openSickLeaveDetail('${s.id}')">${Icons.render('eye')}</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function openSickLeaveForm(visitId = null) {
  if (!eligibleVisits.length) { UI.toast('No open visits are eligible for a sick leave certificate.', 'danger'); return; }
  document.getElementById('sl-form').reset();
  if (visitId) {
    document.getElementById('sf-visit').value = visitId;
    document.getElementById('sf-visit').dispatchEvent(new Event('change'));
  }
  document.getElementById('sl-modal-backdrop').classList.add('visible');
}
function closeSickLeaveForm() { document.getElementById('sl-modal-backdrop').classList.remove('visible'); }
document.getElementById('new-sickleave-btn').addEventListener('click', () => openSickLeaveForm());
document.getElementById('sl-modal-close').addEventListener('click', closeSickLeaveForm);
document.getElementById('sl-form-cancel').addEventListener('click', closeSickLeaveForm);
document.getElementById('sl-modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'sl-modal-backdrop') closeSickLeaveForm(); });

document.getElementById('sl-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const visitId = document.getElementById('sf-visit').value;
  const visit = eligibleVisits.find(v => String(v.id) === String(visitId));
  if (!visit) { UI.toast('Select a valid visit.', 'danger'); return; }

  const leaveStart = document.getElementById('sf-start').value;
  const leaveEnd = document.getElementById('sf-end').value;
  if (leaveEnd < leaveStart) {
    UI.toast('The end date cannot be before the start date.', 'danger');
    return;
  }

  const payload = {
    visit_id: visit.id,
    patient_name: visit.patient.full_name,
    patient_code: visit.patient.patient_code,
    physician_id: document.getElementById('sf-physician').value,
    diagnosis: document.getElementById('sf-diagnosis').value.trim(),
    leave_start: leaveStart,
    leave_end: leaveEnd,
  };
  if (!payload.physician_id) { UI.toast('Select the certifying physician.', 'danger'); return; }

  const btn = document.getElementById('sl-form-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';
  try {
    await Api.sickLeaves.create(payload);
    UI.toast('Sick leave certificate saved.');
    closeSickLeaveForm();
    loadSickLeaves();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Certificate';
  }
});

async function openSickLeaveDetail(id) {
  try {
    const s = await Api.sickLeaves.get(id);
    document.getElementById('sld-name').textContent = s.patient_name;
    document.getElementById('sld-sub').textContent = `${s.patient_code} · ${daysInclusive(s.leave_start, s.leave_end)} day(s)`;
    document.getElementById('sl-detail-body').innerHTML = `
      <div class="detail-grid">
        <div class="detail-item"><div class="k">Certifying physician</div><div class="v">${UI.escapeHtml(physicianName(s.physician_id))}</div></div>
        <div class="detail-item"><div class="k">Exam date</div><div class="v">${UI.formatDate(s.exam_date)}</div></div>
        <div class="detail-item"><div class="k">Leave start</div><div class="v">${UI.formatDate(s.leave_start)}</div></div>
        <div class="detail-item"><div class="k">Leave end</div><div class="v">${UI.formatDate(s.leave_end)}</div></div>
        <div class="detail-item" style="grid-column:1/-1;"><div class="k">Diagnosis</div><div class="v" style="font-weight:500;">${UI.escapeHtml(s.diagnosis) || '—'}</div></div>
      </div>
    `;
    document.getElementById('sl-detail-backdrop').classList.add('visible');
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}
function closeSickLeaveDetail() { document.getElementById('sl-detail-backdrop').classList.remove('visible'); }
document.getElementById('sl-detail-close').addEventListener('click', closeSickLeaveDetail);
document.getElementById('sl-detail-close-btn').addEventListener('click', closeSickLeaveDetail);
document.getElementById('sl-detail-backdrop').addEventListener('click', (e) => { if (e.target.id === 'sl-detail-backdrop') closeSickLeaveDetail(); });

document.getElementById('sl-search-input').addEventListener('input', debounce(loadSickLeaves, 250));

// ---------- Init ----------
async function init() {
  await loadLookups();
  await loadReferrals();
  await loadSickLeaves();
  const params = new URLSearchParams(window.location.search);
  if (params.get('newFor')) {
    if (params.get('type') === 'sickleave') {
      switchTab('sickleaves');
      openSickLeaveForm(params.get('newFor'));
    } else {
      openReferralForm(params.get('newFor'));
    }
  }
}
init();
