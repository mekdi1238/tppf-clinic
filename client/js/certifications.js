/* ===========================================================
   Certifications page logic
   =========================================================== */

Auth.requireAuth();
if (RoleGuard.blockIfNotAllowed('certifications')) { throw new Error('redirecting'); }
renderShell('certifications');
setPageTitle('Certifications');

document.getElementById('search-icon-slot').innerHTML = Icons.render('search');
document.getElementById('plus-icon-slot').innerHTML = Icons.render('plus');
document.getElementById('cert-modal-close').innerHTML = Icons.render('close');
document.getElementById('cert-detail-close').innerHTML = Icons.render('close');

const CERTIFIABLE = ['pending', 'certified_fit', 'certified_unfit'];
let physiciansCache = [];
let certifiableRegs = [];
let currentCerts = [];

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function loadLookups() {
  const [physicians, registrations] = await Promise.all([
    Api.physicians.list(),
    Api.registrations.list({ status: 'all' }),
  ]);
  physiciansCache = physicians;
  certifiableRegs = registrations.filter(r => CERTIFIABLE.includes(r.status));

  document.getElementById('cf-physician').innerHTML = `<option value="">Select…</option>` +
    physiciansCache.map(p => `<option value="${p.id}">${UI.escapeHtml(p.full_name)}</option>`).join('');

  const regSelect = document.getElementById('cf-registration');
  if (!certifiableRegs.length) {
    regSelect.innerHTML = `<option value="">No certifiable candidates</option>`;
  } else {
    regSelect.innerHTML = `<option value="">Select a candidate…</option>` +
      certifiableRegs.map(r => `<option value="${r.id}" data-status="${r.status}">${UI.escapeHtml(r.full_name)} — ${r.registration_code}</option>`).join('');
  }
}

document.getElementById('cf-registration').addEventListener('change', (e) => {
  const opt = e.target.selectedOptions[0];
  const hint = document.getElementById('cf-registration-hint');
  if (!opt || !opt.value) { hint.textContent = ''; return; }
  const status = opt.dataset.status;
  hint.textContent = status === 'pending'
    ? 'First exam for this candidate.'
    : `Re-examination — current status is "${UI.escapeHtml(status.replace('_', ' '))}".`;
});

async function loadCerts() {
  const search = document.getElementById('search-input').value.trim();
  const result = document.getElementById('result-filter').value;
  try {
    currentCerts = await Api.certifications.list({ search, result });
    renderTable(currentCerts);
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

function renderTable(list) {
  const region = document.getElementById('certs-table-region');
  if (!list.length) {
    region.innerHTML = `
      <div class="table-wrap">
        <div class="empty-state">
          <div class="empty-icon">${Icons.render('filecheck')}</div>
          <h3>No certification exams recorded</h3>
          <p>Try a different search or filter, or record a new exam.</p>
          <button class="btn btn-primary" onclick="openCertForm()">${Icons.render('plus')} Record Certification</button>
        </div>
      </div>`;
    return;
  }
  region.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr><th>Candidate</th><th>Physician</th><th>Exam date</th><th>Result</th><th></th></tr>
        </thead>
        <tbody>
          ${list.map(c => `
            <tr>
              <td class="cell-primary" style="cursor:pointer;" onclick="openCertDetail('${c.id}')">
                ${UI.escapeHtml(c.registration ? c.registration.full_name : '—')}
                <span class="cell-code">${c.registration ? c.registration.registration_code : ''}</span>
              </td>
              <td class="cell-muted">${UI.escapeHtml(c.physician ? c.physician.full_name : '—')}</td>
              <td class="cell-muted">${UI.formatDateTime(c.examination_date)}</td>
              <td>${UI.certResultBadge(c.result)}</td>
              <td><button class="icon-btn" title="View" onclick="openCertDetail('${c.id}')">${Icons.render('eye')}</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ---------- New certification ----------
function openCertForm() {
  if (!certifiableRegs.length) {
    UI.toast('No candidates are currently eligible for an exam. Register one first.', 'danger');
    return;
  }
  document.getElementById('cert-form').reset();
  document.getElementById('cf-registration-hint').textContent = '';
  document.getElementById('cert-modal-backdrop').classList.add('visible');
}
function closeCertForm() {
  document.getElementById('cert-modal-backdrop').classList.remove('visible');
}
document.getElementById('new-cert-btn').addEventListener('click', openCertForm);
document.getElementById('cert-modal-close').addEventListener('click', closeCertForm);
document.getElementById('cert-form-cancel').addEventListener('click', closeCertForm);
document.getElementById('cert-modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'cert-modal-backdrop') closeCertForm();
});

document.getElementById('cert-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    employee_registration_id: document.getElementById('cf-registration').value,
    physician_id: document.getElementById('cf-physician').value,
    physical_examination: document.getElementById('cf-physical').value,
    personal_hygiene: document.getElementById('cf-hygiene').value,
    skin_disease: document.getElementById('cf-skin').value,
    stool_exam_direct: document.getElementById('cf-stool').value,
    syphilis: document.getElementById('cf-syphilis').value,
    gonorrhea: document.getElementById('cf-gonorrhea').value,
    other_findings: document.getElementById('cf-other').value.trim(),
    result: document.getElementById('cf-result').value,
    treatment_note: document.getElementById('cf-treatment').value.trim(),
  };
  if (!payload.employee_registration_id || !payload.physician_id || !payload.result) {
    UI.toast('Select a candidate, physician, and result.', 'danger');
    return;
  }
  const btn = document.getElementById('cert-form-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';
  try {
    await Api.certifications.create(payload);
    UI.toast(`Exam result recorded: ${payload.result === 'fit' ? 'Fit' : 'Unfit'}.`);
    closeCertForm();
    await loadLookups();
    await loadCerts();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Exam Result';
  }
});

// ---------- Certification detail ----------
async function openCertDetail(id) {
  try {
    const c = await Api.certifications.get(id);
    document.getElementById('cd-name').textContent = c.registration ? c.registration.full_name : 'Certification';
    document.getElementById('cd-sub').textContent = `${c.registration ? c.registration.registration_code : ''} · ${UI.formatDateTime(c.examination_date)}`;
    document.getElementById('cert-detail-body').innerHTML = `
      <div style="margin-bottom:14px;">${UI.certResultBadge(c.result)}</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="k">Physician</div><div class="v">${UI.escapeHtml(c.physician ? c.physician.full_name : '—')}</div></div>
        <div class="detail-item"><div class="k">Physical examination</div><div class="v" style="text-transform:capitalize;">${c.physical_examination || '—'}</div></div>
        <div class="detail-item"><div class="k">Personal hygiene</div><div class="v" style="text-transform:capitalize;">${c.personal_hygiene || '—'}</div></div>
        <div class="detail-item"><div class="k">Skin disease</div><div class="v" style="text-transform:capitalize;">${c.skin_disease || '—'}</div></div>
        <div class="detail-item"><div class="k">Stool exam (direct)</div><div class="v" style="text-transform:capitalize;">${c.stool_exam_direct || '—'}</div></div>
        <div class="detail-item"><div class="k">Syphilis</div><div class="v" style="text-transform:capitalize;">${c.syphilis || '—'}</div></div>
        <div class="detail-item"><div class="k">Gonorrhea</div><div class="v" style="text-transform:capitalize;">${c.gonorrhea || '—'}</div></div>
      </div>
      ${c.other_findings ? `<div class="detail-item" style="margin-top:12px;"><div class="k">Other findings</div><div class="v" style="font-weight:500;">${UI.escapeHtml(c.other_findings)}</div></div>` : ''}
      ${c.treatment_note ? `<div class="detail-item" style="margin-top:12px;"><div class="k">Treatment note</div><div class="v" style="font-weight:500;">${UI.escapeHtml(c.treatment_note)}</div></div>` : ''}
    `;
    document.getElementById('cd-view-candidate').onclick = () => { window.location.href = `registrations.html?open=${c.employee_registration_id}`; };
    document.getElementById('cert-detail-backdrop').classList.add('visible');
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}
function closeCertDetail() {
  document.getElementById('cert-detail-backdrop').classList.remove('visible');
}
document.getElementById('cert-detail-close').addEventListener('click', closeCertDetail);
document.getElementById('cert-detail-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'cert-detail-backdrop') closeCertDetail();
});

document.getElementById('search-input').addEventListener('input', debounce(loadCerts, 250));
document.getElementById('result-filter').addEventListener('change', loadCerts);

async function init() {
  await loadLookups();
  await loadCerts();
}
init();
