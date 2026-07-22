/* ===========================================================
   Reports page logic
   -----------------------------------------------------------
   Read-only. Aggregates data already available through the
   existing Api.* calls — no new backend surface needed.
   =========================================================== */

Auth.requireAuth();
if (RoleGuard.blockIfNotAllowed('reports')) { throw new Error('redirecting'); }
renderShell('reports');
setPageTitle('Reports');

function donut(counts, colors, centerLabel) {
  const order = Object.keys(counts);
  const total = order.reduce((s, k) => s + counts[k], 0) || 1;
  const r = 62, cx = 90, cy = 90, strokeW = 26;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const segments = order.map(key => {
    const val = counts[key];
    const frac = val / total;
    const dash = frac * circumference;
    const seg = { key, val, dash, offset, color: colors[key] || '#93A19E' };
    offset += dash;
    return seg;
  });
  return `
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
        <text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="10" fill="#93A19E" font-family="Inter, sans-serif">${centerLabel}</text>
      </svg>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${segments.map(s => `
          <div style="display:flex; align-items:center; gap:8px; font-size:12.5px;">
            <span style="width:9px; height:9px; border-radius:50%; background:${s.color}; display:inline-block;"></span>
            <span style="text-transform:capitalize; color:#647572;">${s.key.replace(/_/g, ' ')}</span>
            <span style="font-weight:700; color:#1B2624; margin-left:4px;">${s.val}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function emptyNote(text) {
  return `<p class="text-muted" style="font-size:12.5px;">${text}</p>`;
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

    // Overview stats
    const activePatients = patients.filter(p => p.is_active).length;
    const openVisits = visits.filter(v => v.status !== 'closed').length;
    const activeAdmissions = admissions.filter(a => a.status === 'admitted').length;
    const pendingLab = labOrders.filter(o => o.status !== 'completed').length;

    document.getElementById('overview-stats').innerHTML = `
      <div class="stat-card">
        <div><div class="label">Active Patients</div><div class="value">${activePatients}</div></div>
        <div class="stat-icon">${Icons.render('patients')}</div>
      </div>
      <div class="stat-card">
        <div><div class="label">Open Visits</div><div class="value">${openVisits}</div></div>
        <div class="stat-icon info">${Icons.render('activity')}</div>
      </div>
      <div class="stat-card">
        <div><div class="label">Currently Admitted</div><div class="value">${activeAdmissions}</div></div>
        <div class="stat-icon amber">${Icons.render('admissions')}</div>
      </div>
      <div class="stat-card">
        <div><div class="label">Lab Orders Pending</div><div class="value">${pendingLab}</div></div>
        <div class="stat-icon success">${Icons.render('flask')}</div>
      </div>
    `;

    // Registration status breakdown
    const regCounts = {};
    registrations.forEach(r => { regCounts[r.status] = (regCounts[r.status] || 0) + 1; });
    document.getElementById('registration-breakdown').innerHTML = Object.keys(regCounts).length
      ? donut(regCounts, {
          pending: '#3C7FB0', certified_fit: '#2E9E6F', certified_unfit: '#C0483C',
          hired: '#12817A', withdrawn: '#93A19E',
        }, 'candidates')
      : emptyNote('No registrations recorded yet.');

    // Certification results
    const certCounts = { fit: 0, unfit: 0 };
    certifications.forEach(c => { certCounts[c.result] = (certCounts[c.result] || 0) + 1; });
    document.getElementById('certification-breakdown').innerHTML = certifications.length
      ? donut(certCounts, { fit: '#2E9E6F', unfit: '#C0483C' }, 'exams')
      : emptyNote('No certification exams recorded yet.');

    // Visit disposition breakdown (closed visits only)
    const closedVisits = visits.filter(v => v.status === 'closed');
    const dispCounts = {};
    closedVisits.forEach(v => { const key = v.disposition || 'unspecified'; dispCounts[key] = (dispCounts[key] || 0) + 1; });
    document.getElementById('disposition-breakdown').innerHTML = closedVisits.length
      ? donut(dispCounts, { discharged: '#2E9E6F', admitted: '#3C7FB0', referred: '#D98B3F', unspecified: '#93A19E' }, 'closed visits')
      : emptyNote('No closed visits yet.');

    // Lab order status breakdown
    const labCounts = { pending: 0, in_progress: 0, completed: 0 };
    labOrders.forEach(o => { labCounts[o.status] = (labCounts[o.status] || 0) + 1; });
    document.getElementById('lab-breakdown').innerHTML = labOrders.length
      ? donut(labCounts, { pending: '#93A19E', in_progress: '#D98B3F', completed: '#2E9E6F' }, 'lab orders')
      : emptyNote('No lab orders recorded yet.');

    // Low stock drugs
    const lowStock = drugs.filter(d => d.stock && d.stock.quantity_on_hand <= d.stock.reorder_threshold);
    document.getElementById('low-stock-count').textContent = `${lowStock.length} drug(s)`;
    document.getElementById('low-stock-region').innerHTML = lowStock.length ? `
      <div class="table-wrap" style="box-shadow:none;">
        <table class="data-table">
          <thead><tr><th>Drug</th><th>On hand</th><th>Reorder threshold</th></tr></thead>
          <tbody>
            ${lowStock.map(d => `
              <tr>
                <td class="cell-primary">${UI.escapeHtml(d.name)}</td>
                <td class="cell-muted">${d.stock.quantity_on_hand} ${UI.escapeHtml(d.unit || '')}</td>
                <td class="cell-muted">${d.stock.reorder_threshold}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : emptyNote('All drugs are above their reorder threshold.');
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}
init();
