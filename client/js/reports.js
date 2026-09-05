/* ===========================================================
   Reports page logic
   -----------------------------------------------------------
   Interactive analytics, chart segment drilldown lists, and
   customizable report exporter.
   =========================================================== */

Auth.requireAuth();
if (RoleGuard.blockIfNotAllowed('reports')) { throw new Error('redirecting'); }
renderShell('reports');
setPageTitle('Reports');

const exportIconEl = document.getElementById('export-btn-icon');
if (exportIconEl) {
  exportIconEl.innerHTML = Icons.render('download');
}

const drilldownCloseIconEl = document.getElementById('drilldown-close-icon-slot');
if (drilldownCloseIconEl) {
  drilldownCloseIconEl.innerHTML = Icons.render('close');
}

let globalDataCache = {};

function donut(counts, colors, centerLabel, onSliceClickName = null) {
  const order = Object.keys(counts);
  const total = order.reduce((s, k) => s + counts[k], 0) || 0;
  const safeTotal = total || 1;
  const r = 62, cx = 90, cy = 90, strokeW = 26;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const segments = order.map(key => {
    const val = counts[key];
    const frac = val / safeTotal;
    const dash = frac * circumference;
    const seg = { key, val, dash, offset, color: colors[key] || '#93A19E' };
    offset += dash;
    return seg;
  });

  return `
    <div style="display:flex; align-items:center; gap:22px; flex-wrap:wrap;">
      <svg viewBox="0 0 180 180" width="150" height="150">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#EEF1F0" stroke-width="${strokeW}" />
        ${segments.map(s => {
          const clickAttr = onSliceClickName ? `onclick="${onSliceClickName}('${UI.escapeHtml(s.key)}')" style="cursor:pointer; transition: opacity 0.2s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1"` : '';
          return `
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${strokeW}"
              stroke-dasharray="${s.dash.toFixed(1)} ${(circumference - s.dash).toFixed(1)}"
              stroke-dashoffset="${(-s.offset).toFixed(1)}"
              transform="rotate(-90 ${cx} ${cy})" stroke-linecap="butt" ${clickAttr}>
              <title>${s.key.replace(/_/g, ' ')}: ${s.val}</title>
            </circle>
          `;
        }).join('')}
        <text x="${cx}" y="${cy - 3}" text-anchor="middle" font-size="22" font-weight="800" fill="#0A4F49" font-family="Manrope, sans-serif">${total}</text>
        <text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="10" fill="#93A19E" font-family="Inter, sans-serif">${centerLabel}</text>
      </svg>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${segments.map(s => {
          const clickAttr = onSliceClickName ? `onclick="${onSliceClickName}('${UI.escapeHtml(s.key)}')" style="cursor:pointer; padding:2px 6px; border-radius:4px; transition: background 0.15s;" onmouseover="this.style.background='#F4F6F6'" onmouseout="this.style.background='transparent'"` : '';
          return `
            <div style="display:flex; align-items:center; gap:8px; font-size:12.5px;" ${clickAttr}>
              <span style="width:9px; height:9px; border-radius:50%; background:${s.color}; display:inline-block;"></span>
              <span style="text-transform:capitalize; color:#647572;">${UI.escapeHtml(s.key.replace(/_/g, ' '))}</span>
              <span style="font-weight:700; color:#1B2624; margin-left:4px;">${s.val}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function emptyNote(text) {
  return `<p class="text-muted" style="font-size:12.5px;">${text}</p>`;
}

// ---------- Drilldown Modal Handlers ----------
function openDrilldownModal(title, subtitle, list, type) {
  document.getElementById('drilldown-title').textContent = title;
  document.getElementById('drilldown-sub').textContent = `${subtitle} (${list.length} item${list.length === 1 ? '' : 's'})`;

  const container = document.getElementById('drilldown-content-region');
  if (!list.length) {
    container.innerHTML = `<p class="text-muted" style="padding:20px; text-align:center;">No matching records found.</p>`;
  } else {
    let tableHtml = '';
    if (type === 'patient') {
      tableHtml = `
        <div class="table-wrap" style="box-shadow:none;">
          <table class="data-table">
            <thead>
              <tr><th>Code</th><th>Full Name</th><th>Gender</th><th>Department</th><th>Age</th><th>Phone</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              ${list.map(p => `
                <tr>
                  <td><span class="cell-code">${p.patient_code}</span></td>
                  <td class="cell-primary">
                    <div style="display:flex; align-items:center; gap:8px;">
                      ${UI.avatar(p.full_name, p.photo_url, 'width:28px; height:28px; font-size:10px;')}
                      <span>${UI.escapeHtml(p.full_name)}</span>
                    </div>
                  </td>
                  <td class="cell-muted" style="text-transform:capitalize;">${p.gender || '—'}</td>
                  <td class="cell-muted">${p.department ? UI.escapeHtml(p.department) : '—'}</td>
                  <td class="cell-muted">${UI.age(p.date_of_birth)}</td>
                  <td class="cell-muted">${UI.escapeHtml(p.phone) || '—'}</td>
                  <td>${UI.patientStatusBadge(p.is_active)}</td>
                  <td>
                    <a href="patients.html?open=${p.id}" class="btn btn-secondary btn-sm" style="padding:4px 8px; font-size:11.5px;">View</a>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (type === 'registration') {
      tableHtml = `
        <div class="table-wrap" style="box-shadow:none;">
          <table class="data-table">
            <thead>
              <tr><th>Code</th><th>Candidate Name</th><th>Gender</th><th>Department</th><th>Occupation</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              ${list.map(r => `
                <tr>
                  <td><span class="cell-code">${r.registration_code}</span></td>
                  <td class="cell-primary">${UI.escapeHtml(r.full_name)}</td>
                  <td class="cell-muted" style="text-transform:capitalize;">${r.gender || '—'}</td>
                  <td class="cell-muted">${r.department ? UI.escapeHtml(r.department) : '—'}</td>
                  <td class="cell-muted">${UI.escapeHtml(r.occupation || '')}</td>
                  <td>${UI.registrationStatusBadge(r.status)}</td>
                  <td>
                    <a href="registrations.html?open=${r.id}" class="btn btn-secondary btn-sm" style="padding:4px 8px; font-size:11.5px;">View</a>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (type === 'certification') {
      tableHtml = `
        <div class="table-wrap" style="box-shadow:none;">
          <table class="data-table">
            <thead>
              <tr><th>Exam Date</th><th>Candidate Name</th><th>Physician</th><th>Result</th><th>Physical</th></tr>
            </thead>
            <tbody>
              ${list.map(c => `
                <tr>
                  <td class="cell-muted">${UI.formatDate(c.examination_date)}</td>
                  <td class="cell-primary">${c.registration ? UI.escapeHtml(c.registration.full_name) : '—'}</td>
                  <td class="cell-muted">${c.physician ? UI.escapeHtml(c.physician.full_name) : '—'}</td>
                  <td><span class="badge ${c.result === 'fit' ? 'badge-success' : 'badge-danger'}">${c.result.toUpperCase()}</span></td>
                  <td class="cell-muted" style="text-transform:capitalize;">${c.physical_examination || '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (type === 'visit') {
      tableHtml = `
        <div class="table-wrap" style="box-shadow:none;">
          <table class="data-table">
            <thead>
              <tr><th>Visit Date</th><th>Patient</th><th>Chief Complaint</th><th>Disposition</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${list.map(v => `
                <tr>
                  <td class="cell-muted">${UI.formatDateTime(v.visit_date)}</td>
                  <td class="cell-primary">${v.patient ? UI.escapeHtml(v.patient.full_name) : '—'}</td>
                  <td class="cell-muted">${UI.escapeHtml(v.chief_complaint)}</td>
                  <td class="cell-muted" style="text-transform:capitalize;">${v.disposition || '—'}</td>
                  <td>${UI.visitStatusBadge(v.status)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (type === 'labOrder') {
      tableHtml = `
        <div class="table-wrap" style="box-shadow:none;">
          <table class="data-table">
            <thead>
              <tr><th>Order Date</th><th>Patient</th><th>Tests Requested</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${list.map(o => `
                <tr>
                  <td class="cell-muted">${UI.formatDateTime(o.order_date)}</td>
                  <td class="cell-primary">${o.patient ? UI.escapeHtml(o.patient.full_name) : '—'}</td>
                  <td class="cell-muted">${o.items ? o.items.map(i => i.test ? UI.escapeHtml(i.test.code) : '?').join(', ') : '—'}</td>
                  <td>${UI.labOrderStatusBadge(o.status)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (type === 'drug') {
      tableHtml = `
        <div class="table-wrap" style="box-shadow:none;">
          <table class="data-table">
            <thead>
              <tr><th>Code</th><th>Drug Name</th><th>Category</th><th>Unit</th><th>Batch No</th><th>Quantity</th><th>Threshold</th><th>Expiry</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${list.map(d => {
                const stock = d.stock || { quantity_on_hand: 0, reorder_threshold: 0, max_threshold: null };
                return `
                  <tr>
                    <td><span class="cell-code" style="font-weight:700; color:var(--color-primary);">${UI.escapeHtml(d.drug_code || '—')}</span></td>
                    <td class="cell-primary">
                      <div style="font-weight:600;">${UI.escapeHtml(d.name)}</div>
                      ${d.description ? `<div style="font-size:11px; color:var(--color-text-muted);">${UI.escapeHtml(d.description)}</div>` : ''}
                    </td>
                    <td><span class="badge badge-neutral" style="font-size:11px;">${UI.escapeHtml(d.category || '—')}</span></td>
                    <td class="cell-muted" style="font-size:12px;">${UI.escapeHtml(d.unit || '—')}</td>
                    <td class="cell-muted" style="font-family:monospace; font-size:11.5px;">${UI.escapeHtml(d.batch_no || '—')}</td>
                    <td style="font-weight:700;">${stock.quantity_on_hand}</td>
                    <td class="cell-muted">${stock.reorder_threshold}</td>
                    <td class="cell-muted">${d.expiry_date ? UI.formatDate(d.expiry_date) : '<span class="text-muted">—</span>'}</td>
                    <td>${UI.stockBadge(stock)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
    container.innerHTML = tableHtml;
  }

  document.getElementById('drilldown-modal-backdrop').classList.add('visible');
}

function closeDrilldownModal() {
  document.getElementById('drilldown-modal-backdrop').classList.remove('visible');
}

document.getElementById('drilldown-modal-close').addEventListener('click', closeDrilldownModal);
document.getElementById('drilldown-modal-cancel').addEventListener('click', closeDrilldownModal);
document.getElementById('drilldown-modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'drilldown-modal-backdrop') closeDrilldownModal();
});

// Window callback hooks for SVG chart clicks
window.drilldownPatientDept = (deptKey) => {
  const filtered = globalDataCache.patients.filter(p => (p.department || 'Unassigned') === deptKey);
  openDrilldownModal(`Patients in ${deptKey}`, 'Filtered by department', filtered, 'patient');
};

window.drilldownPatientGender = (genderKey) => {
  const filtered = globalDataCache.patients.filter(p => (p.gender || 'unspecified').toLowerCase() === genderKey.toLowerCase());
  openDrilldownModal(`Patients (${genderKey})`, 'Filtered by gender', filtered, 'patient');
};

window.drilldownRegStatus = (statusKey) => {
  const filtered = globalDataCache.registrations.filter(r => r.status === statusKey);
  openDrilldownModal(`Registrations (${statusKey.replace(/_/g, ' ')})`, 'Filtered by registration status', filtered, 'registration');
};

window.drilldownCertResult = (resultKey) => {
  const filtered = globalDataCache.certifications.filter(c => c.result === resultKey);
  openDrilldownModal(`Certifications (${resultKey.toUpperCase()})`, 'Filtered by exam result', filtered, 'certification');
};

window.drilldownVisitDisp = (dispKey) => {
  const closedVisits = globalDataCache.visits.filter(v => v.status === 'closed');
  const filtered = closedVisits.filter(v => (v.disposition || 'unspecified') === dispKey);
  openDrilldownModal(`Closed Visits (${dispKey})`, 'Filtered by disposition', filtered, 'visit');
};

window.drilldownLabStatus = (statusKey) => {
  const filtered = globalDataCache.labOrders.filter(o => o.status === statusKey);
  openDrilldownModal(`Lab Orders (${statusKey.replace(/_/g, ' ')})`, 'Filtered by status', filtered, 'labOrder');
};

window.drilldownDrugCategory = (categoryKey) => {
  const filtered = globalDataCache.drugs.filter(d => (d.category || 'Uncategorized') === categoryKey);
  openDrilldownModal(`Drugs in ${categoryKey}`, 'Filtered by clinical category', filtered, 'drug');
};

window.drilldownDrugStockStatus = (statusKey) => {
  const now = new Date();
  const sixMo = new Date();
  sixMo.setMonth(sixMo.getMonth() + 6);

  const filtered = globalDataCache.drugs.filter(d => {
    const s = d.stock || {};
    const q = Number(s.quantity_on_hand) || 0;
    const t = Number(s.reorder_threshold) || 0;
    const m = s.max_threshold !== null && s.max_threshold !== undefined ? Number(s.max_threshold) : null;

    if (statusKey === 'expired') {
      if (!d.expiry_date) return false;
      return new Date(d.expiry_date) < now;
    }
    if (statusKey === 'expiring_soon') {
      if (!d.expiry_date) return false;
      const exp = new Date(d.expiry_date);
      return exp >= now && exp <= sixMo;
    }
    if (statusKey === 'out_of_stock') return q === 0;
    if (statusKey === 'low_stock') return q > 0 && q <= t;
    if (statusKey === 'overstocked') return m !== null && q > m;
    if (statusKey === 'in_stock') return q > t && (m === null || q <= m);
    return true;
  });
  openDrilldownModal(`Drugs (${statusKey.replace(/_/g, ' ')})`, 'Filtered by stock condition', filtered, 'drug');
};


function filterListByDateRange(list, dateField, start, end) {
  if (!start && !end) return list;
  return list.filter(item => {
    const raw = item[dateField];
    if (!raw) return false;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return false;
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });
}

function renderReportsData() {
  const periodSelect = document.getElementById('report-period-select');
  const customContainer = document.getElementById('custom-date-container');
  const activeLabel = document.getElementById('period-active-label');
  const startInput = document.getElementById('report-start-date');
  const endInput = document.getElementById('report-end-date');

  const preset = periodSelect ? periodSelect.value : 'all';
  if (customContainer) {
    customContainer.style.display = preset === 'custom' ? 'flex' : 'none';
  }

  const { start, end, label } = UI.getDateRangeFromPreset(
    preset,
    startInput ? startInput.value : null,
    endInput ? endInput.value : null
  );

  if (activeLabel) {
    activeLabel.textContent = `Showing: ${label}`;
  }

  const { patients = [], visits = [], registrations = [], certifications = [], admissions = [], labOrders = [], drugs = [] } = globalDataCache;

  // Filter datasets by selected time range
  const filteredVisits = filterListByDateRange(visits, 'visit_date', start, end);
  const filteredRegs = filterListByDateRange(registrations, 'registration_date', start, end);
  const filteredCerts = filterListByDateRange(certifications, 'examination_date', start, end);
  const filteredLabs = filterListByDateRange(labOrders, 'order_date', start, end);
  const filteredPatients = filterListByDateRange(patients, 'registered_date', start, end);
  const filteredAdmissions = filterListByDateRange(admissions, 'admission_date', start, end);

  // Overview stats (Total Patients, Open Visits, Admissions, Pending Labs)
  const totalPatients = filteredPatients.length;
  const activePatients = filteredPatients.filter(p => p.is_active).length;
  const openVisits = filteredVisits.filter(v => v.status !== 'closed').length;
  const activeAdmissions = filteredAdmissions.filter(a => a.status === 'admitted').length;
  const pendingLab = filteredLabs.filter(o => o.status !== 'completed').length;

  document.getElementById('overview-stats').innerHTML = `
    <div class="stat-card" style="cursor:pointer;" onclick="window.drilldownPatientDept('all')">
      <div><div class="label">Clinic Patients</div><div class="value">${totalPatients} <span style="font-size:12px; font-weight:400; color:#647572;">(${activePatients} active)</span></div></div>
      <div class="stat-icon">${Icons.render('patients')}</div>
    </div>
    <div class="stat-card">
      <div><div class="label">Open Visits</div><div class="value">${openVisits}</div></div>
      <div class="stat-icon info">${Icons.render('activity')}</div>
    </div>
    <div class="stat-card">
      <div><div class="label">Admitted Patients</div><div class="value">${activeAdmissions}</div></div>
      <div class="stat-icon amber">${Icons.render('admissions')}</div>
    </div>
    <div class="stat-card">
      <div><div class="label">Lab Orders Pending</div><div class="value">${pendingLab}</div></div>
      <div class="stat-icon success">${Icons.render('flask')}</div>
    </div>
  `;

  // 1. Patient Analytics — Breakdown by Department
  const patientDeptCounts = {};
  filteredPatients.forEach(p => {
    const dept = p.department || 'Unassigned';
    patientDeptCounts[dept] = (patientDeptCounts[dept] || 0) + 1;
  });

  const deptPalette = {
    'Manager': '#12817A',
    'Finance': '#3C7FB0',
    'Human Resource Management': '#D98B3F',
    'Planning and Budget Service': '#8E44AD',
    'Production Quality Control Service': '#27AE60',
    'Product Quality Control Service': '#27AE60',
    'Production': '#E67E22',
    'Technic': '#D35400',
    'Technique': '#D35400',
    'Production and Technique': '#E67E22',
    'Production and Technic': '#E67E22',
    'Property Management': '#2C3E50',
    'Unassigned': '#93A19E',
  };


  document.getElementById('patient-dept-breakdown').innerHTML = Object.keys(patientDeptCounts).length
    ? donut(patientDeptCounts, deptPalette, 'patients', 'window.drilldownPatientDept')
    : emptyNote('No patients found for this period.');

  // 2. Patient Analytics — Breakdown by Gender
  const patientGenderCounts = {};
  filteredPatients.forEach(p => {
    const gen = (p.gender || 'unspecified').toLowerCase();
    patientGenderCounts[gen] = (patientGenderCounts[gen] || 0) + 1;
  });

  document.getElementById('patient-gender-breakdown').innerHTML = Object.keys(patientGenderCounts).length
    ? donut(patientGenderCounts, { male: '#3C7FB0', female: '#D9534F', unspecified: '#93A19E' }, 'patients', 'window.drilldownPatientGender')
    : emptyNote('No patient demographics found.');

  // 3. Registration status breakdown
  const regCounts = {};
  filteredRegs.forEach(r => { regCounts[r.status] = (regCounts[r.status] || 0) + 1; });
  document.getElementById('registration-breakdown').innerHTML = Object.keys(regCounts).length
    ? donut(regCounts, {
        pending: '#3C7FB0', certified_fit: '#2E9E6F', certified_unfit: '#C0483C',
        hired: '#12817A', withdrawn: '#93A19E', accepted_as_staff: '#8E44AD',
      }, 'candidates', 'window.drilldownRegStatus')
    : emptyNote('No registrations found for this period.');

  // 4. Certification results
  const certCounts = { fit: 0, unfit: 0 };
  filteredCerts.forEach(c => { certCounts[c.result] = (certCounts[c.result] || 0) + 1; });
  document.getElementById('certification-breakdown').innerHTML = filteredCerts.length
    ? donut(certCounts, { fit: '#2E9E6F', unfit: '#C0483C' }, 'exams', 'window.drilldownCertResult')
    : emptyNote('No certification exams found for this period.');

  // 5. Visit disposition breakdown (closed visits only)
  const closedVisits = filteredVisits.filter(v => v.status === 'closed');
  const dispCounts = {};
  closedVisits.forEach(v => { const key = v.disposition || 'unspecified'; dispCounts[key] = (dispCounts[key] || 0) + 1; });
  document.getElementById('disposition-breakdown').innerHTML = closedVisits.length
    ? donut(dispCounts, { discharged: '#2E9E6F', admitted: '#3C7FB0', referred: '#D98B3F', unspecified: '#93A19E' }, 'closed visits', 'window.drilldownVisitDisp')
    : emptyNote('No closed visits found for this period.');

  // 6. Lab order status breakdown
  const labCounts = { pending: 0, in_progress: 0, completed: 0 };
  filteredLabs.forEach(o => { labCounts[o.status] = (labCounts[o.status] || 0) + 1; });
  document.getElementById('lab-breakdown').innerHTML = filteredLabs.length
    ? donut(labCounts, { pending: '#93A19E', in_progress: '#D98B3F', completed: '#2E9E6F' }, 'lab orders', 'window.drilldownLabStatus')
    : emptyNote('No lab orders found for this period.');

  // 7. Drug Stock Breakdown by Category (Pie / Donut Chart)
  const drugCategoryCounts = {};
  drugs.forEach(d => {
    const cat = d.category || 'Uncategorized';
    drugCategoryCounts[cat] = (drugCategoryCounts[cat] || 0) + 1;
  });

  const drugCategoryPalette = {
    'Anti Acid drugs': '#12817A',
    'Eye ointment': '#3C7FB0',
    'Skin ointment': '#D98B3F',
    'Iv Fluid': '#8E44AD',
    'Syringe': '#27AE60',
    'Anti Pain': '#E74C3C',
    'Dressing materials': '#E67E22',
    'Disinfectant solution': '#16A085',
    'Adhesive Plaster': '#2980B9',
    'Anti bacterial Drug': '#C0392B',
    'Cardiovascular Drug (CVS)': '#884EA0',
    'Anti diabetic': '#2471A3',
    'minerals': '#17A589',
    'Anti protocol': '#D35400',
    'Anti Inflammatory Drugs': '#B03A2E',
    'Uncategorized': '#93A19E',
    'Other': '#7F8C8D',
  };

  const drugCatEl = document.getElementById('drug-category-breakdown');
  if (drugCatEl) {
    drugCatEl.innerHTML = Object.keys(drugCategoryCounts).length
      ? donut(drugCategoryCounts, drugCategoryPalette, 'drugs', 'window.drilldownDrugCategory')
      : emptyNote('No drugs found in formulary.');
  }

  // 8. Drug Stock Breakdown by Condition & Expiry
  const drugStockStatusCounts = {
    in_stock: 0,
    low_stock: 0,
    out_of_stock: 0,
    overstocked: 0,
    expiring_soon: 0,
    expired: 0,
  };

  const now = new Date();
  const sixMo = new Date();
  sixMo.setMonth(sixMo.getMonth() + 6);

  drugs.forEach(d => {
    const s = d.stock || {};
    const q = Number(s.quantity_on_hand) || 0;
    const t = Number(s.reorder_threshold) || 0;
    const m = s.max_threshold !== null && s.max_threshold !== undefined ? Number(s.max_threshold) : null;

    if (d.expiry_date) {
      const exp = new Date(d.expiry_date);
      if (exp < now) drugStockStatusCounts.expired++;
      else if (exp <= sixMo) drugStockStatusCounts.expiring_soon++;
    }

    if (q === 0) drugStockStatusCounts.out_of_stock++;
    else if (q <= t) drugStockStatusCounts.low_stock++;
    else if (m !== null && q > m) drugStockStatusCounts.overstocked++;
    else drugStockStatusCounts.in_stock++;
  });

  const activeDrugStockStatus = {};
  Object.keys(drugStockStatusCounts).forEach(k => {
    if (drugStockStatusCounts[k] > 0) activeDrugStockStatus[k] = drugStockStatusCounts[k];
  });

  const drugStatusPalette = {
    in_stock: '#2E9E6F',
    low_stock: '#D98B3F',
    out_of_stock: '#C0483C',
    overstocked: '#3C7FB0',
    expiring_soon: '#E67E22',
    expired: '#8E44AD',
  };

  const drugStockEl = document.getElementById('drug-stock-status-breakdown');
  if (drugStockEl) {
    drugStockEl.innerHTML = Object.keys(activeDrugStockStatus).length
      ? donut(activeDrugStockStatus, drugStatusPalette, 'items', 'window.drilldownDrugStockStatus')
      : emptyNote('No stock records available.');
  }

  // 9. Low stock drugs
  const lowStock = drugs.filter(d => d.stock && d.stock.quantity_on_hand <= d.stock.reorder_threshold);
  document.getElementById('low-stock-count').textContent = `${lowStock.length} drug(s)`;
  document.getElementById('low-stock-region').innerHTML = lowStock.length ? `
    <div class="table-wrap" style="box-shadow:none;">
      <table class="data-table">
        <thead><tr><th>Drug</th><th>Category</th><th>On hand</th><th>Reorder threshold</th></tr></thead>
        <tbody>
          ${lowStock.map(d => `
            <tr>
              <td class="cell-primary">${UI.escapeHtml(d.name)}</td>
              <td><span class="badge badge-neutral" style="font-size:11.5px;">${UI.escapeHtml(d.category || '—')}</span></td>
              <td class="cell-muted" style="font-weight:700;">${d.stock.quantity_on_hand} ${UI.escapeHtml(d.unit || '')}</td>
              <td class="cell-muted">${d.stock.reorder_threshold}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : emptyNote('All drugs are above their reorder threshold.');
}

async function init() {
  try {
    const [patients, visits, registrations, certifications, admissions, labOrders, drugs] = await Promise.all([
      Api.patients.list(),
      Api.visits.list(),
      Api.registrations.list({ status: 'all' }),
      Api.certifications.list({ result: 'all' }),
      Api.admissions.list({ status: 'all' }),
      Api.labOrders.list({ status: 'all' }),
      Api.drugs.list(),
    ]);

    globalDataCache = { patients, visits, registrations, certifications, admissions, labOrders, drugs };

    const exportBtn = document.getElementById('open-export-modal-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const periodSelect = document.getElementById('report-period-select');
        const startDate = document.getElementById('report-start-date');
        const endDate = document.getElementById('report-end-date');
        const currentPeriod = periodSelect ? periodSelect.value : 'all';
        const currentStart = startDate ? startDate.value : null;
        const currentEnd = endDate ? endDate.value : null;
        ExportModal.open('patients', currentPeriod, currentStart, currentEnd);
      });
    }

    const periodSelect = document.getElementById('report-period-select');
    if (periodSelect) {
      periodSelect.addEventListener('change', renderReportsData);
    }
    const startDate = document.getElementById('report-start-date');
    const endDate = document.getElementById('report-end-date');
    if (startDate) startDate.addEventListener('change', renderReportsData);
    if (endDate) endDate.addEventListener('change', renderReportsData);

    renderReportsData();

  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}
init();
