/* ===========================================================
   Dashboard page logic
   =========================================================== */

Auth.requireAuth();
renderShell('dashboard');
setPageTitle('Clinic Management System');

function renderStatCards(stats) {
  const cards = [
    { label: 'Active Patients', value: stats.active_patients, sub: `+${stats.new_patients_week} this week`, icon: 'patients', tone: '' },
    { label: 'Visits Today', value: stats.visits_today, sub: 'Recorded so far today', icon: 'visits', tone: 'info' },
    { label: 'Open Visits', value: stats.open_visits, sub: 'Not yet closed', icon: 'activity', tone: 'amber' },
    { label: 'New Registrations', value: stats.new_patients_week, sub: 'Last 7 days', icon: 'employees', tone: 'success' },
  ];
  document.getElementById('stat-grid').innerHTML = cards.map(c => `
    <div class="stat-card">
      <div>
        <div class="label">${c.label}</div>
        <div class="value">${c.value}</div>
        <div class="sub">${c.sub}</div>
      </div>
      <div class="stat-icon ${c.tone}">${Icons.render(c.icon)}</div>
    </div>
  `).join('');
}

function renderLineChart(days) {
  const w = 480, h = 190, padX = 24, padY = 20;
  const max = Math.max(...days.map(d => d.count), 4);
  const stepX = (w - padX * 2) / (days.length - 1);
  const points = days.map((d, i) => {
    const x = padX + i * stepX;
    const y = h - padY - (d.count / max) * (h - padY * 2);
    return { x, y, ...d };
  });
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${h - padY} L${points[0].x.toFixed(1)},${h - padY} Z`;

  const total = days.reduce((s, d) => s + d.count, 0);
  document.getElementById('visits-week-total').textContent = `${total} total`;

  document.getElementById('visits-line-chart').innerHTML = `
    <svg viewBox="0 0 ${w} ${h + 24}" style="width:100%; height:auto;">
      <defs>
        <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#12817A" stop-opacity="0.22"/>
          <stop offset="1" stop-color="#12817A" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#lineFill)" />
      <path d="${linePath}" fill="none" stroke="#12817A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      ${points.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="#fff" stroke="#12817A" stroke-width="2" />`).join('')}
      ${points.map(p => `<text x="${p.x.toFixed(1)}" y="${h + 16}" text-anchor="middle" font-size="10.5" fill="#93A19E" font-family="Inter, sans-serif">${p.label}</text>`).join('')}
    </svg>
  `;
}

function renderDonutChart(statusCounts) {
  const order = ['open', 'examined', 'diagnosed', 'closed'];
  const colors = { open: '#3C7FB0', examined: '#D98B3F', diagnosed: '#12817A', closed: '#2E9E6F' };
  const total = order.reduce((s, k) => s + (statusCounts[k] || 0), 0) || 1;
  const r = 62, cx = 90, cy = 90, strokeW = 26;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  const segments = order.map(key => {
    const val = statusCounts[key] || 0;
    const frac = val / total;
    const dash = frac * circumference;
    const seg = { key, val, dash, offset, color: colors[key] };
    offset += dash;
    return seg;
  });

  document.getElementById('visits-donut-chart').innerHTML = `
    <div style="display:flex; align-items:center; gap:22px; flex-wrap:wrap;">
      <svg viewBox="0 0 180 180" width="150" height="150">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#EEF1F0" stroke-width="${strokeW}" />
        ${segments.map(s => `
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${strokeW}"
            stroke-dasharray="${s.dash.toFixed(1)} ${(circumference - s.dash).toFixed(1)}"
            stroke-dashoffset="${(-s.offset).toFixed(1)}"
            transform="rotate(-90 ${cx} ${cy})" stroke-linecap="butt" />
        `).join('')}
        <text x="${cx}" y="${cy - 3}" text-anchor="middle" font-size="22" font-weight="800" fill="#0A4F49" font-family="Manrope, sans-serif">${total}</text>
        <text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="10" fill="#93A19E" font-family="Inter, sans-serif">visits</text>
      </svg>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${segments.map(s => `
          <div style="display:flex; align-items:center; gap:8px; font-size:12.5px;">
            <span style="width:9px; height:9px; border-radius:50%; background:${s.color}; display:inline-block;"></span>
            <span style="text-transform:capitalize; color:#647572;">${s.key}</span>
            <span style="font-weight:700; color:#1B2624; margin-left:4px;">${s.val}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderRecentVisits(visits) {
  const rows = visits.slice(0, 6);
  if (!rows.length) {
    document.getElementById('recent-visits-table').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${Icons.render('visits')}</div>
        <h3>No visits yet</h3>
        <p>Visits recorded at the clinic will show up here.</p>
      </div>`;
    return;
  }
  document.getElementById('recent-visits-table').innerHTML = `
    <div class="table-wrap" style="box-shadow:none; border:none;">
      <table class="data-table">
        <thead><tr><th>Patient</th><th>Physician</th><th>Chief complaint</th><th>Date</th><th>Status</th></tr></thead>
        <tbody>
          ${rows.map(v => `
            <tr onclick="window.location.href='visits.html?open=${v.id}'" style="cursor:pointer;">
              <td class="cell-primary">${UI.escapeHtml(v.patient ? v.patient.full_name : '—')} <span class="cell-code">${v.patient ? v.patient.patient_code : ''}</span></td>
              <td class="cell-muted">${UI.escapeHtml(v.physician ? v.physician.full_name : '—')}</td>
              <td class="cell-muted">${UI.escapeHtml(v.chief_complaint)}</td>
              <td class="cell-muted">${UI.formatDateTime(v.visit_date)}</td>
              <td>${UI.visitStatusBadge(v.status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function renderLabTechDashboard() {
  const orders = await Api.labOrders.list();
  const pending = orders.filter(o => o.status === 'pending').length;
  const inProgress = orders.filter(o => o.status === 'in_progress').length;
  const todayStr = new Date().toDateString();
  const completedToday = orders.filter(o => o.status === 'completed' && new Date(o.order_date).toDateString() === todayStr).length;
  const queue = orders.filter(o => o.status !== 'completed').slice(0, 8);

  document.getElementById('page-content').innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div><div class="label">Pending Orders</div><div class="value">${pending}</div></div><div class="stat-icon">${Icons.render('flask')}</div></div>
      <div class="stat-card"><div><div class="label">In Progress</div><div class="value">${inProgress}</div></div><div class="stat-icon amber">${Icons.render('activity')}</div></div>
      <div class="stat-card"><div><div class="label">Completed Today</div><div class="value">${completedToday}</div></div><div class="stat-icon success">${Icons.render('check')}</div></div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <h3>My queue</h3>
        <a href="laboratory.html" class="btn btn-ghost btn-sm">Open Laboratory &rarr;</a>
      </div>
      ${queue.length ? `
        <div class="table-wrap" style="box-shadow:none; border:none;">
          <table class="data-table">
            <thead><tr><th>Patient</th><th>Tests</th><th>Ordered</th><th>Status</th></tr></thead>
            <tbody>
              ${queue.map(o => `
                <tr onclick="window.location.href='laboratory.html?open=${o.id}'" style="cursor:pointer;">
                  <td class="cell-primary">${UI.escapeHtml(o.patient_name)} <span class="cell-code">${UI.escapeHtml(o.patient_code)}</span></td>
                  <td class="cell-muted">${o.items.map(i => i.test ? UI.escapeHtml(i.test.code) : '?').join(', ')}</td>
                  <td class="cell-muted">${UI.formatDateTime(o.order_date)}</td>
                  <td>${UI.labOrderStatusBadge(o.status)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : `<div class="empty-state"><div class="empty-icon">${Icons.render('flask')}</div><h3>Queue is empty</h3><p>No pending or in-progress lab orders right now.</p></div>`}
    </div>
  `;
}

async function renderPharmacistDashboard() {
  const [prescriptions, drugs] = await Promise.all([Api.prescriptions.list({ status: 'active' }), Api.drugs.list()]);
  const lowStock = drugs.filter(d => d.stock && d.stock.quantity_on_hand <= d.stock.reorder_threshold);
  const queue = prescriptions.slice(0, 8);

  document.getElementById('page-content').innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div><div class="label">Active Prescriptions</div><div class="value">${prescriptions.length}</div></div><div class="stat-icon">${Icons.render('pill')}</div></div>
      <div class="stat-card"><div><div class="label">Drugs Below Reorder Threshold</div><div class="value">${lowStock.length}</div></div><div class="stat-icon amber">${Icons.render('alert')}</div></div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <h3>Prescriptions to dispense</h3>
        <a href="pharmacy.html" class="btn btn-ghost btn-sm">Open Pharmacy &rarr;</a>
      </div>
      ${queue.length ? `
        <div class="table-wrap" style="box-shadow:none; border:none;">
          <table class="data-table">
            <thead><tr><th>Patient</th><th>Drugs</th><th>Prescribed</th><th>Status</th></tr></thead>
            <tbody>
              ${queue.map(rx => `
                <tr onclick="window.location.href='pharmacy.html?open=${rx.id}'" style="cursor:pointer;">
                  <td class="cell-primary">${UI.escapeHtml(rx.patient_name)} <span class="cell-code">${UI.escapeHtml(rx.patient_code)}</span></td>
                  <td class="cell-muted">${rx.items.map(i => i.drug ? UI.escapeHtml(i.drug.name) : '?').join(', ')}</td>
                  <td class="cell-muted">${UI.formatDateTime(rx.prescribed_date)}</td>
                  <td>${UI.prescriptionStatusBadge(rx.status)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : `<div class="empty-state"><div class="empty-icon">${Icons.render('pill')}</div><h3>Queue is empty</h3><p>No active prescriptions waiting on dispensing right now.</p></div>`}
    </div>
  `;
}

async function renderReceptionistDashboard() {
  const [patients, visits, registrations] = await Promise.all([
    Api.patients.list(),
    Api.visits.list(),
    Api.registrations.list({ status: 'all' }),
  ]);
  const todayStr = new Date().toDateString();
  const patientsToday = patients.filter(p => new Date(p.registered_date).toDateString() === todayStr).length;
  const visitsToday = visits.filter(v => new Date(v.visit_date).toDateString() === todayStr).length;
  const registrationsToday = registrations.filter(r => new Date(r.registration_date).toDateString() === todayStr).length;
  const recentVisits = visits.slice(0, 8);

  document.getElementById('page-content').innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div><div class="label">Patients Registered Today</div><div class="value">${patientsToday}</div></div><div class="stat-icon">${Icons.render('patients')}</div></div>
      <div class="stat-card"><div><div class="label">Visits Checked In Today</div><div class="value">${visitsToday}</div></div><div class="stat-icon info">${Icons.render('visits')}</div></div>
      <div class="stat-card"><div><div class="label">Candidates Registered Today</div><div class="value">${registrationsToday}</div></div><div class="stat-icon success">${Icons.render('employees')}</div></div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <h3>Recent check-ins</h3>
        <a href="visits.html" class="btn btn-ghost btn-sm">Open Visits &rarr;</a>
      </div>
      ${recentVisits.length ? `
        <div class="table-wrap" style="box-shadow:none; border:none;">
          <table class="data-table">
            <thead><tr><th>Patient</th><th>Checked in</th><th>Status</th></tr></thead>
            <tbody>
              ${recentVisits.map(v => `
                <tr onclick="window.location.href='visits.html?open=${v.id}'" style="cursor:pointer;">
                  <td class="cell-primary">${UI.escapeHtml(v.patient ? v.patient.full_name : '—')} <span class="cell-code">${v.patient ? v.patient.patient_code : ''}</span></td>
                  <td class="cell-muted">${UI.formatDateTime(v.visit_date)}</td>
                  <td>${UI.visitStatusBadge(v.status)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : `<div class="empty-state"><div class="empty-icon">${Icons.render('visits')}</div><h3>No visits yet</h3><p>Check a patient in from the Patients or Visits page.</p></div>`}
    </div>
  `;
}

async function renderPhysicianDashboard() {
  const session = Auth.getSession();
  const myPhysicianId = session.user.physician_id;
  const allVisits = await Api.visits.list();
  const scoped = myPhysicianId ? allVisits.filter(v => v.physician_id === myPhysicianId) : allVisits;
  const openCount = scoped.filter(v => v.status === 'open').length;
  const examinedCount = scoped.filter(v => v.status === 'examined').length;
  const diagnosedCount = scoped.filter(v => v.status === 'diagnosed').length;
  const queue = scoped.filter(v => v.status !== 'closed').slice(0, 8);

  document.getElementById('page-content').innerHTML = `
    ${!myPhysicianId ? `
      <div class="notice notice-info">
        ${Icons.render('info')}
        <span>Your account isn't linked to a physician record, so this shows all open visits clinic-wide rather than just your own.</span>
      </div>
    ` : ''}
    <div class="stat-grid">
      <div class="stat-card"><div><div class="label">Awaiting Exam</div><div class="value">${openCount}</div></div><div class="stat-icon">${Icons.render('visits')}</div></div>
      <div class="stat-card"><div><div class="label">Examined, Awaiting Diagnosis</div><div class="value">${examinedCount}</div></div><div class="stat-icon amber">${Icons.render('stethoscope')}</div></div>
      <div class="stat-card"><div><div class="label">Diagnosed, Awaiting Close</div><div class="value">${diagnosedCount}</div></div><div class="stat-icon info">${Icons.render('activity')}</div></div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <h3>${myPhysicianId ? 'My open visits' : 'Open visits'}</h3>
        <a href="visits.html" class="btn btn-ghost btn-sm">Open Visits &rarr;</a>
      </div>
      ${queue.length ? `
        <div class="table-wrap" style="box-shadow:none; border:none;">
          <table class="data-table">
            <thead><tr><th>Patient</th><th>Chief complaint</th><th>Date</th><th>Status</th></tr></thead>
            <tbody>
              ${queue.map(v => `
                <tr onclick="window.location.href='visits.html?open=${v.id}'" style="cursor:pointer;">
                  <td class="cell-primary">${UI.escapeHtml(v.patient ? v.patient.full_name : '—')} <span class="cell-code">${v.patient ? v.patient.patient_code : ''}</span></td>
                  <td class="cell-muted">${UI.escapeHtml(v.chief_complaint)}</td>
                  <td class="cell-muted">${UI.formatDateTime(v.visit_date)}</td>
                  <td>${UI.visitStatusBadge(v.status)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : `<div class="empty-state"><div class="empty-icon">${Icons.render('visits')}</div><h3>Queue is empty</h3><p>No open visits right now.</p></div>`}
    </div>
  `;
}

async function init() {
  const role = RoleGuard.restrictedRole();
  try {
    if (role === 'lab_technician') { await renderLabTechDashboard(); return; }
    if (role === 'pharmacist') { await renderPharmacistDashboard(); return; }
    if (role === 'receptionist') { await renderReceptionistDashboard(); return; }
    if (role === 'physician') { await renderPhysicianDashboard(); return; }

    const [stats, visits] = await Promise.all([Api.dashboardStats(), Api.visits.list()]);
    renderStatCards(stats);
    renderLineChart(stats.visits_by_day);
    renderDonutChart(stats.visits_by_status);
    renderRecentVisits(visits);
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

init();
