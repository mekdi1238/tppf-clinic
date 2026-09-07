/* ===========================================================
   ExportModal module — Universal Customizable Report Exporter
   =========================================================== */

const ExportModal = (() => {
  let modalInitialized = false;
  let currentDatasetKey = 'patients';
  let activeColumns = [];

  const DATASET_CONFIGS = {
    patients: {
      label: 'Patients Register',
      fetcher: () => Api.patients.list(),
      fields: [
        { key: 'patient_code', label: 'Patient Code', selected: true },
        { key: 'full_name', label: 'Full Name', selected: true },
        { key: 'gender', label: 'Gender', selected: true },
        { key: 'department', label: 'Department', selected: true },
        { key: 'position', label: 'Position', selected: true },
        { key: 'age', label: 'Age', selected: true, getter: r => UI.age(r.date_of_birth) },
        { key: 'phone', label: 'Phone', selected: true },
        { key: 'location', label: 'Location', selected: false },
        { key: 'address', label: 'Address', selected: false },
        { key: 'registered_date', label: 'Registration Date', selected: true, getter: r => UI.formatDate(r.registered_date) },
        { key: 'status', label: 'Status', selected: true, getter: r => (r.is_active ? 'Active' : 'Inactive') },
      ],
      filterTypes: ['status', 'department', 'gender', 'limit'],
    },
    registrations: {
      label: 'Pre-Employment Registrations',
      fetcher: () => Api.registrations.list({ status: 'all' }),
      fields: [
        { key: 'registration_code', label: 'Registration Code', selected: true },
        { key: 'full_name', label: 'Candidate Name', selected: true },
        { key: 'gender', label: 'Gender', selected: true },
        { key: 'department', label: 'Department', selected: true },
        { key: 'position', label: 'Position', selected: true },
        { key: 'occupation', label: 'Occupation Applied', selected: true },
        { key: 'age', label: 'Age', selected: true, getter: r => UI.age(r.date_of_birth) },
        { key: 'location', label: 'Location', selected: false },
        { key: 'registration_date', label: 'Date Registered', selected: true, getter: r => UI.formatDate(r.registration_date) },
        { key: 'status', label: 'Status', selected: true, getter: r => (r.status || '').replace(/_/g, ' ') },
      ],
      filterTypes: ['status', 'department', 'gender', 'limit'],
    },
    visits: {
      label: 'Clinical Visits',
      fetcher: () => Api.visits.list(),
      fields: [
        { key: 'visit_date', label: 'Visit Date & Time', selected: true, getter: v => UI.formatDateTime(v.visit_date) },
        { key: 'patient_code', label: 'Patient Code', selected: true, getter: v => (v.patient ? v.patient.patient_code : '—') },
        { key: 'patient_name', label: 'Patient Name', selected: true, getter: v => (v.patient ? v.patient.full_name : '—') },
        { key: 'department', label: 'Department', selected: true, getter: v => (v.patient ? v.patient.department || '—' : '—') },
        { key: 'chief_complaint', label: 'Chief Complaint', selected: true },
        { key: 'diagnosis', label: 'Diagnosis', selected: true },
        { key: 'treatment', label: 'Treatment', selected: true },
        { key: 'disposition', label: 'Disposition', selected: true, getter: v => v.disposition || '—' },
        { key: 'status', label: 'Status', selected: true },
      ],
      filterTypes: ['status', 'department', 'limit'],
    },
    certifications: {
      label: 'Medical Certifications',
      fetcher: () => Api.certifications.list({ result: 'all' }),
      fields: [
        { key: 'examination_date', label: 'Exam Date', selected: true, getter: c => UI.formatDate(c.examination_date) },
        { key: 'candidate_code', label: 'Registration Code', selected: true, getter: c => (c.registration ? c.registration.registration_code : '—') },
        { key: 'candidate_name', label: 'Candidate Name', selected: true, getter: c => (c.registration ? c.registration.full_name : '—') },
        { key: 'department', label: 'Department', selected: true, getter: c => (c.registration ? c.registration.department || '—' : '—') },
        { key: 'result', label: 'Result', selected: true, getter: c => c.result.toUpperCase() },
        { key: 'physician_name', label: 'Examining Physician', selected: true, getter: c => (c.physician ? c.physician.full_name : '—') },
        { key: 'physical_examination', label: 'Physical Exam', selected: false },
        { key: 'personal_hygiene', label: 'Personal Hygiene', selected: false },
        { key: 'skin_disease', label: 'Skin Disease', selected: false },
        { key: 'stool_exam', label: 'Stool Direct', selected: false },
        { key: 'syphilis', label: 'Syphilis', selected: false },
        { key: 'gonorrhea', label: 'Gonorrhea', selected: false },
        { key: 'other_findings', label: 'Other Findings', selected: false },
      ],
      filterTypes: ['department', 'limit'],
    },
    labOrders: {
      label: 'Laboratory Orders',
      fetcher: () => Api.labOrders.list({ status: 'all' }),
      fields: [
        { key: 'order_date', label: 'Order Date', selected: true, getter: o => UI.formatDateTime(o.order_date) },
        { key: 'patient_code', label: 'Patient Code', selected: true, getter: o => (o.patient ? o.patient.patient_code : '—') },
        { key: 'patient_name', label: 'Patient Name', selected: true, getter: o => (o.patient ? o.patient.full_name : '—') },
        { key: 'department', label: 'Department', selected: true, getter: o => (o.patient ? o.patient.department || '—' : '—') },
        { key: 'tests', label: 'Tests Requested', selected: true, getter: o => (o.items ? o.items.map(i => i.test ? i.test.code : '?').join(', ') : '—') },
        { key: 'status', label: 'Status', selected: true },
      ],
      filterTypes: ['status', 'department', 'limit'],
    },
    drugs: {
      label: 'Drug Inventory & Formulary',
      fetcher: () => Api.drugs.list(),
      fields: [
        { key: 'drug_code', label: 'Item Code (ID)', selected: true, getter: d => d.drug_code || '—' },
        { key: 'name', label: 'Drug / Item Name', selected: true },
        { key: 'category', label: 'Clinical Category', selected: true, getter: d => d.category || '—' },
        { key: 'unit', label: 'Unit of Measure', selected: true, getter: d => d.unit || '—' },
        { key: 'batch_no', label: 'Batch No (Lot #)', selected: true, getter: d => d.batch_no || '—' },
        { key: 'reorder_threshold', label: 'Min Threshold', selected: true, getter: d => (d.stock ? (d.stock.reorder_threshold ?? 0) : 0) },
        { key: 'max_threshold', label: 'Max Limit', selected: true, getter: d => (d.stock && d.stock.max_threshold ? d.stock.max_threshold : '—') },
        { key: 'quantity_on_hand', label: 'Quantity On Hand', selected: true, getter: d => (d.stock ? d.stock.quantity_on_hand : 0) },
        { key: 'expiry_date', label: 'Expiration Date', selected: true, getter: d => (d.expiry_date ? UI.formatDate(d.expiry_date) : '—') },
        { key: 'stock_status', label: 'Stock Status', selected: true, getter: d => {
          const s = d.stock || {};
          const q = Number(s.quantity_on_hand) || 0;
          const t = Number(s.reorder_threshold) || 0;
          const m = s.max_threshold !== null && s.max_threshold !== undefined ? Number(s.max_threshold) : null;
          if (q === 0) return 'Out of Stock';
          if (q <= t) return 'Low Stock';
          if (m !== null && q > m) return 'Overstocked';
          return 'In Stock';
        } },
        { key: 'expiry_status', label: 'Expiry Condition', selected: true, getter: d => {
          if (!d.expiry_date) return 'Not set';
          const exp = new Date(d.expiry_date);
          const now = new Date();
          if (exp < now) return 'Expired';
          const sixMo = new Date();
          sixMo.setMonth(sixMo.getMonth() + 6);
          if (exp <= sixMo) return 'Expiring Soon';
          return 'Good Condition';
        } },
        { key: 'description', label: 'Description', selected: false, getter: d => d.description || '' },
      ],
      filterTypes: ['period', 'limit'],
    },
  };

  function ensureModalMarkup() {
    if (document.getElementById('export-modal-backdrop')) return;

    const modalHtml = `
      <div class="modal-backdrop" id="export-modal-backdrop" style="z-index: 2000;">
        <div class="modal modal-wide" style="max-width: 780px;">
          <div class="modal-header">
            <div>
              <h2 style="display:flex; align-items:center; gap:8px;">
                <span style="display:inline-flex; width:22px; height:22px; flex-shrink:0;">${Icons.render('download')}</span> Export Custom Report
              </h2>
              <p>Filter criteria, choose columns, and drag to reorder columns before exporting.</p>
            </div>
            <button class="icon-btn" id="export-modal-close">${Icons.render('close')}</button>
          </div>
          <div class="modal-body" style="display:flex; flex-direction:column; gap:20px;">
            
            <!-- Category / Dataset Selector -->
            <div class="field">
              <label for="export-dataset-select" style="font-weight:700;">Report Dataset</label>
              <select id="export-dataset-select" class="select-filter" style="width:100%; font-size:14px; font-weight:600;">
                ${Object.keys(DATASET_CONFIGS).map(k => `
                  <option value="${k}">${DATASET_CONFIGS[k].label}</option>
                `).join('')}
              </select>
            </div>

            <!-- Filters Section -->
            <div style="background:var(--color-bg-secondary, #F4F6F6); border-radius:8px; padding:16px;">
              <h4 style="margin:0 0 12px 0; font-size:13px; text-transform:uppercase; letter-spacing:0.5px; color:var(--color-text-muted, #647572);">1. Filter Data</h4>
              <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px;">
                
                <div class="field" id="exp-filter-period-wrap">
                  <label for="exp-filter-period">Time Period</label>
                  <select id="exp-filter-period">
                    <option value="all">All Time</option>
                    <option value="daily">Daily (Today)</option>
                    <option value="weekly">Weekly (This Week)</option>
                    <option value="monthly">Monthly (This Month)</option>
                    <optgroup label="Ethiopian Quarters (E.C. / G.C.)">
                      <option value="q1">Q1: Hamle – Meskerem [Jul 8 – Oct 10 G.C.]</option>
                      <option value="q2">Q2: Tikimt – Tahisas [Oct 11 – Jan 8 G.C.]</option>
                      <option value="q3">Q3: Tir – Megabit [Jan 9 – Apr 8 G.C.]</option>
                      <option value="q4">Q4: Miazia – Sene [Apr 9 – Jul 7 G.C.]</option>
                    </optgroup>
                    <optgroup label="Half Year &amp; Annual (E.C. / G.C.)">
                      <option value="half1">1st Half Year: Hamle – Tahisas [Jul 8 – Jan 8 G.C.]</option>
                      <option value="half2">2nd Half Year: Tir – Sene [Jan 9 – Jul 7 G.C.]</option>
                      <option value="annual">Annual (Full Year) [Jul 8 – Jul 7 G.C.]</option>
                    </optgroup>
                    <option value="custom">Custom Date Range…</option>
                  </select>
                </div>

                <div class="field span-2" id="exp-custom-date-wrap" style="display:none; margin-top:-4px;">
                  <label style="font-weight:600; font-size:12px; margin-bottom:6px;">Custom Date Range</label>
                  <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <div style="display:flex; align-items:center; gap:6px; flex:1; min-width:140px;">
                      <span style="font-size:12px; color:var(--color-text-muted); font-weight:600;">From:</span>
                      <input type="date" id="exp-start-date" />
                    </div>
                    <div style="display:flex; align-items:center; gap:6px; flex:1; min-width:140px;">
                      <span style="font-size:12px; color:var(--color-text-muted); font-weight:600;">To:</span>
                      <input type="date" id="exp-end-date" />
                    </div>
                  </div>
                </div>

                <div class="field" id="exp-filter-status-wrap">
                  <label for="exp-filter-status">Status</label>
                  <select id="exp-filter-status">
                    <option value="all">All statuses</option>
                    <option value="active">Active only</option>
                    <option value="inactive">Inactive only</option>
                    <option value="pending">Pending</option>
                    <option value="certified_fit">Certified Fit</option>
                    <option value="certified_unfit">Certified Unfit</option>
                    <option value="hired">Hired (Patient)</option>
                    <option value="accepted_as_staff">Accepted as Staff</option>
                  </select>
                </div>

                <div class="field" id="exp-filter-dept-wrap">
                  <label for="exp-filter-dept">Department</label>
                  <select id="exp-filter-dept">
                    <option value="all">All departments</option>
                    <option value="Manager">Manager</option>
                    <option value="Human Resource Management">Human Resource Management</option>
                    <option value="Planning and Budget Service">Planning and Budget Service</option>
                    <option value="Production Quality Control Service">Production Quality Control Service</option>
                    <option value="Production">Production</option>
                    <option value="Technic">Technic</option>
                    <option value="Property Management">Property Management</option>
                    <option value="Finance">Finance</option>
                  </select>
                </div>


                <div class="field" id="exp-filter-gender-wrap">
                  <label for="exp-filter-gender">Gender</label>
                  <select id="exp-filter-gender">
                    <option value="all">All genders</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>

                <div class="field" id="exp-filter-limit-wrap">
                  <label for="exp-filter-limit">Record Limit</label>
                  <select id="exp-filter-limit">
                    <option value="all">All records</option>
                    <option value="10">Top 10</option>
                    <option value="25">Top 25</option>
                    <option value="50">Top 50</option>
                    <option value="100">Top 100</option>
                  </select>
                </div>

              </div>
            </div>

            <!-- Columns & Ordering Section -->
            <div style="background:var(--color-bg-secondary, #F4F6F6); border-radius:8px; padding:16px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h4 style="margin:0; font-size:13px; text-transform:uppercase; letter-spacing:0.5px; color:var(--color-text-muted, #647572);">2. Select &amp; Order Columns</h4>
                <span class="text-muted" style="font-size:12px;">Drag items or use ▲ ▼ arrows to reorder</span>
              </div>
              
              <div id="export-columns-list" style="display:flex; flex-direction:column; gap:6px; max-height:260px; overflow-y:auto; padding-right:4px;">
              </div>
            </div>

          </div>
          <div class="modal-footer" style="display:flex; justify-content:space-between; align-items:center;">
            <button type="button" class="btn btn-secondary" id="export-modal-cancel">Cancel</button>
            <button type="button" class="btn btn-primary" id="export-modal-submit">
              ${Icons.render('download')} Export to CSV (.csv)
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    bindEvents();
  }

  function bindEvents() {
    const backdrop = document.getElementById('export-modal-backdrop');
    document.getElementById('export-modal-close').addEventListener('click', close);
    document.getElementById('export-modal-cancel').addEventListener('click', close);
    backdrop.addEventListener('click', (e) => {
      if (e.target.id === 'export-modal-backdrop') close();
    });

    document.getElementById('export-dataset-select').addEventListener('change', (e) => {
      switchDataset(e.target.value);
    });

    const periodSelect = document.getElementById('exp-filter-period');
    const customDateWrap = document.getElementById('exp-custom-date-wrap');
    if (periodSelect && customDateWrap) {
      periodSelect.addEventListener('change', (e) => {
        customDateWrap.style.display = e.target.value === 'custom' ? 'block' : 'none';
      });
    }

    document.getElementById('export-modal-submit').addEventListener('click', performExport);
  }

  function switchDataset(key) {
    currentDatasetKey = key;
    const config = DATASET_CONFIGS[key];
    if (!config) return;

    // Reset active columns list for this dataset
    activeColumns = config.fields.map(f => ({ ...f }));
    renderColumnsList();
  }

  function renderColumnsList() {
    const container = document.getElementById('export-columns-list');
    container.innerHTML = activeColumns.map((col, idx) => `
      <div class="export-col-item" draggable="true" data-index="${idx}" style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #ffffff;
        border: 1px solid var(--color-border, #D5DCDB);
        border-radius: 6px;
        padding: 8px 12px;
        cursor: grab;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      ">
        <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-weight:600; font-size:13.5px; user-select:none; margin:0; flex:1;">
          <input type="checkbox" ${col.selected ? 'checked' : ''} onchange="ExportModal.toggleCol(${idx}, this.checked)" />
          <span>${UI.escapeHtml(col.label)}</span>
        </label>
        <div style="display:flex; align-items:center; gap:4px;">
          <button type="button" class="icon-btn" title="Move Up" onclick="ExportModal.moveCol(${idx}, -1)" ${idx === 0 ? 'disabled style="opacity:0.3;"' : ''}>
            <span style="font-size:11px;">▲</span>
          </button>
          <button type="button" class="icon-btn" title="Move Down" onclick="ExportModal.moveCol(${idx}, 1)" ${idx === activeColumns.length - 1 ? 'disabled style="opacity:0.3;"' : ''}>
            <span style="font-size:11px;">▼</span>
          </button>
          <span style="color:#93A19E; font-size:16px; margin-left:6px; cursor:grab;">:::</span>
        </div>
      </div>
    `).join('');

    // Attach Drag and Drop handlers
    const items = container.querySelectorAll('.export-col-item');
    let draggedIdx = null;

    items.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        draggedIdx = parseInt(item.getAttribute('data-index'), 10);
        e.dataTransfer.effectAllowed = 'move';
        item.style.opacity = '0.5';
      });

      item.addEventListener('dragend', () => {
        item.style.opacity = '1';
        draggedIdx = null;
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetIdx = parseInt(item.getAttribute('data-index'), 10);
        if (draggedIdx !== null && draggedIdx !== targetIdx) {
          const movedItem = activeColumns.splice(draggedIdx, 1)[0];
          activeColumns.splice(targetIdx, 0, movedItem);
          renderColumnsList();
        }
      });
    });
  }

  function toggleCol(idx, checked) {
    if (activeColumns[idx]) {
      activeColumns[idx].selected = checked;
    }
  }

  function moveCol(idx, direction) {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= activeColumns.length) return;
    const moved = activeColumns.splice(idx, 1)[0];
    activeColumns.splice(targetIdx, 0, moved);
    renderColumnsList();
  }

  function open(defaultDataset = 'patients', defaultPeriod = null, defaultStartDate = null, defaultEndDate = null) {
    if (typeof Permissions !== 'undefined' && !Permissions.has('reports.export')) {
      if (typeof UI !== 'undefined') {
        UI.toast('You do not have permission to export reports.', 'danger');
      }
      return;
    }
    ensureModalMarkup();
    const selectEl = document.getElementById('export-dataset-select');
    selectEl.value = defaultDataset in DATASET_CONFIGS ? defaultDataset : 'patients';
    switchDataset(selectEl.value);

    const periodSelect = document.getElementById('exp-filter-period');
    const customDateWrap = document.getElementById('exp-custom-date-wrap');
    const startDateInput = document.getElementById('exp-start-date');
    const endDateInput = document.getElementById('exp-end-date');

    if (periodSelect) {
      if (defaultPeriod) {
        periodSelect.value = defaultPeriod;
      }
      if (customDateWrap) {
        customDateWrap.style.display = periodSelect.value === 'custom' ? 'block' : 'none';
      }
    }
    if (startDateInput && defaultStartDate !== null) {
      startDateInput.value = defaultStartDate;
    }
    if (endDateInput && defaultEndDate !== null) {
      endDateInput.value = defaultEndDate;
    }

    // Dynamically populate live departments in export filter
    if (typeof Api !== 'undefined' && Api.departments) {
      Api.departments.list().then(depts => {
        const expDept = document.getElementById('exp-filter-dept');
        if (expDept && Array.isArray(depts)) {
          const curVal = expDept.value;
          expDept.innerHTML = `<option value="all">All departments</option>` +
            depts.map(d => `<option value="${UI.escapeHtml(d.name)}">${UI.escapeHtml(d.name)}</option>`).join('');
          if (curVal && (curVal === 'all' || depts.some(d => d.name === curVal))) {
            expDept.value = curVal;
          }
        }
      }).catch(() => {});
    }

    document.getElementById('export-modal-backdrop').classList.add('visible');
  }

  function close() {
    const backdrop = document.getElementById('export-modal-backdrop');
    if (backdrop) backdrop.classList.remove('visible');
  }

  async function performExport() {
    const config = DATASET_CONFIGS[currentDatasetKey];
    if (!config) return;

    const selectedCols = activeColumns.filter(c => c.selected);
    if (!selectedCols.length) {
      UI.toast('Please select at least one column to export.', 'danger');
      return;
    }

    const submitBtn = document.getElementById('export-modal-submit');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Preparing Export…';

    try {
      let rawData = await config.fetcher();

      // Apply Filters
      const periodFilter = document.getElementById('exp-filter-period') ? document.getElementById('exp-filter-period').value : 'all';
      const statusFilter = document.getElementById('exp-filter-status').value;
      const deptFilter = document.getElementById('exp-filter-dept').value;
      const genderFilter = document.getElementById('exp-filter-gender').value;
      const limitFilter = document.getElementById('exp-filter-limit').value;
      const startDateInput = document.getElementById('exp-start-date');
      const endDateInput = document.getElementById('exp-end-date');
      const customStart = startDateInput ? startDateInput.value : null;
      const customEnd = endDateInput ? endDateInput.value : null;

      if (periodFilter === 'custom' && customStart && customEnd && new Date(customStart) > new Date(customEnd)) {
        UI.toast('Start date cannot be after end date.', 'danger');
        return;
      }

      let dateFilterLabel = 'All Time';
      if (periodFilter !== 'all') {
        const { start, end, label } = UI.getDateRangeFromPreset(periodFilter, customStart, customEnd);
        dateFilterLabel = label;
        const dateFieldsMap = {
          patients: 'registered_date',
          registrations: 'registration_date',
          visits: 'visit_date',
          certifications: 'examination_date',
          labOrders: 'order_date',
          drugs: 'created_at',
        };
        const dateKey = dateFieldsMap[currentDatasetKey] || 'created_at';
        rawData = rawData.filter(r => {
          const raw = r[dateKey] || r.created_at || r.visit_date || r.registration_date || r.registered_date;
          if (!raw) return false;
          const d = new Date(raw);
          if (isNaN(d.getTime())) return false;
          if (start && d < start) return false;
          if (end && d > end) return false;
          return true;
        });
      }

      if (statusFilter !== 'all') {
        if (currentDatasetKey === 'patients') {
          if (statusFilter === 'active') rawData = rawData.filter(r => r.is_active);
          if (statusFilter === 'inactive') rawData = rawData.filter(r => !r.is_active);
        } else {
          rawData = rawData.filter(r => r.status === statusFilter);
        }
      }

      if (deptFilter !== 'all') {
        rawData = rawData.filter(r => {
          const dept = r.department || (r.patient ? r.patient.department : null) || (r.registration ? r.registration.department : null);
          return dept === deptFilter;
        });
      }

      if (genderFilter !== 'all') {
        rawData = rawData.filter(r => {
          const gen = (r.gender || (r.patient ? r.patient.gender : null) || (r.registration ? r.registration.gender : null) || '').toLowerCase();
          return gen === genderFilter;
        });
      }

      if (limitFilter !== 'all') {
        const limitNum = parseInt(limitFilter, 10);
        if (!isNaN(limitNum)) {
          rawData = rawData.slice(0, limitNum);
        }
      }

      // Build CSV Headers and Rows
      const sanitize = (val) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      const rows = [];
      // Title Row
      rows.push([`TPPF CLINIC MANAGEMENT SYSTEM — ${config.label.toUpperCase()} EXPORT`]);
      rows.push(['Generated At', new Date().toLocaleString()]);
      rows.push(['Applied Filters', `Period: ${dateFilterLabel}, Status: ${statusFilter}, Department: ${deptFilter}, Gender: ${genderFilter}, Limit: ${limitFilter}`]);
      rows.push([]);

      // Column Header Row
      rows.push(selectedCols.map(c => c.label));

      // Data Rows
      rawData.forEach(item => {
        const row = selectedCols.map(c => {
          if (c.getter) return c.getter(item);
          return item[c.key] !== undefined ? item[c.key] : '—';
        });
        rows.push(row);
      });

      const csvContent = '\uFEFF' + rows.map(r => r.map(sanitize).join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      link.setAttribute('href', url);
      link.setAttribute('download', `TPPF_${config.label.replace(/\s+/g, '_')}_${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      UI.toast(`${config.label} exported (${rawData.length} rows) successfully.`);
      close();
    } catch (e) {
      UI.toast(UI.errorMessage(e), 'danger');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `${Icons.render('download')} Export to CSV (.csv)`;
    }
  }

  return {
    open,
    close,
    toggleCol,
    moveCol,
  };
})();
