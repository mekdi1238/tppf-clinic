/* ===========================================================
   Activity & Audit Logs page logic
   =========================================================== */

Auth.requireAuth();
if (RoleGuard.blockIfNotAllowed('audit-logs')) { throw new Error('redirecting'); }
renderShell('audit-logs');
setPageTitle('Activity Logs');

// Setup Icons
const searchIconSlot = document.getElementById('search-icon-slot');
if (searchIconSlot) searchIconSlot.innerHTML = Icons.render('search');
const refreshIconSlot = document.getElementById('refresh-icon-slot');
if (refreshIconSlot) refreshIconSlot.innerHTML = Icons.render('activity');
const modalClose = document.getElementById('audit-modal-close');
if (modalClose) modalClose.innerHTML = Icons.render('close');

let currentPage = 1;
const limit = 25;
let totalPages = 1;
let totalRecords = 0;
let activeLogs = [];

// DOM Elements
const searchInput = document.getElementById('search-input');
const moduleFilter = document.getElementById('module-filter');
const actionFilter = document.getElementById('action-filter');
const userFilter = document.getElementById('user-filter');
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');
const refreshBtn = document.getElementById('refresh-btn');
const resetFiltersBtn = document.getElementById('reset-filters-btn');
const tableRegion = document.getElementById('audit-table-region');
const paginationRegion = document.getElementById('audit-pagination-region');

const statTotal = document.getElementById('stat-total');
const statToday = document.getElementById('stat-today');
const statUsers = document.getElementById('stat-users');

// Modal Elements
const modalBackdrop = document.getElementById('audit-modal-backdrop');
const modalOk = document.getElementById('audit-modal-ok');
const dtTimestamp = document.getElementById('dt-timestamp');
const dtUser = document.getElementById('dt-user');
const dtIp = document.getElementById('dt-ip');
const dtAction = document.getElementById('dt-action');
const dtDescription = document.getElementById('dt-description');
const diffBefore = document.getElementById('diff-before');
const diffAfter = document.getElementById('diff-after');

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function getBadgeClass(action) {
  const act = (action || '').toLowerCase();
  if (act === 'create') return 'action-create';
  if (act === 'update') return 'action-update';
  if (act === 'delete') return 'action-delete';
  if (act === 'login' || act === 'logout') return 'action-login';
  if (act === 'dispense') return 'action-dispense';
  if (act === 'import') return 'action-import';
  return 'action-other';
}

function formatTimestamp(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

async function loadFilters() {
  try {
    const res = await Api.auditLogs.filters();
    if (res && res.users) {
      userFilter.innerHTML = '<option value="all">All Users</option>';
      for (const u of res.users) {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${u.username}${u.full_name ? ' (' + u.full_name + ')' : ''}`;
        userFilter.appendChild(opt);
      }
    }
  } catch (err) {
    console.warn('Could not load audit filters:', err);
  }
}

async function loadStats() {
  try {
    const res = await Api.auditLogs.stats();
    if (res) {
      statTotal.textContent = (res.total || 0).toLocaleString();
      statToday.textContent = (res.today || 0).toLocaleString();
      statUsers.textContent = (res.topUsers ? res.topUsers.length : 0).toLocaleString();
    }
  } catch (err) {
    console.warn('Could not load audit stats:', err);
  }
}

async function loadLogs(page = 1) {
  currentPage = page;
  tableRegion.innerHTML = '<div class="table-wrap"><div class="empty-state"><p>Loading activity logs…</p></div></div>';

  const params = {
    page,
    limit,
  };

  if (searchInput.value.trim()) params.search = searchInput.value.trim();
  if (moduleFilter.value !== 'all') params.module = moduleFilter.value;
  if (actionFilter.value !== 'all') params.action = actionFilter.value;
  if (userFilter.value !== 'all') params.user_id = userFilter.value;
  if (startDateInput.value) params.start_date = startDateInput.value;
  if (endDateInput.value) params.end_date = endDateInput.value;

  try {
    const res = await Api.auditLogs.list(params);
    activeLogs = res.data || [];
    totalPages = res.pagination?.totalPages || 1;
    totalRecords = res.pagination?.total || 0;

    renderTable(activeLogs);
    renderPagination();
  } catch (err) {
    tableRegion.innerHTML = `<div class="notice notice-danger">Failed to load activity logs: ${UI.escapeHtml(UI.errorMessage(err))}</div>`;
  }
}

function renderTable(logs) {
  if (!logs.length) {
    tableRegion.innerHTML = `
      <div class="table-wrap">
        <div class="empty-state">
          <div class="empty-icon">${Icons.render('clock')}</div>
          <h3>No activity logs found</h3>
          <p>Try adjusting your search query, module filter, or date range.</p>
        </div>
      </div>
    `;
    return;
  }

  let html = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 170px;">Timestamp</th>
            <th style="width: 160px;">User</th>
            <th style="width: 120px;">Module</th>
            <th style="width: 100px;">Action</th>
            <th>Description / Details</th>
            <th style="width: 80px; text-align: center;">Details</th>
          </tr>
        </thead>
        <tbody>
  `;

  logs.forEach((log) => {
    const userDisplay = log.user_name || (log.user_id ? `User #${log.user_id}` : 'System');
    const fullNameSub = log.user_full_name ? `<div style="font-size:0.75rem; color:var(--color-text-muted);">${UI.escapeHtml(log.user_full_name)}</div>` : '';
    const ipSub = log.ip_address ? `<div style="font-size:0.72rem; color:var(--color-text-muted); opacity:0.8;">IP: ${UI.escapeHtml(log.ip_address)}</div>` : '';
    const badgeCls = getBadgeClass(log.action);
    const formattedDate = formatTimestamp(log.performed_at);

    html += `
      <tr>
        <td>
          <div style="font-weight: 500; font-size: 0.85rem;">${formattedDate}</div>
        </td>
        <td>
          <div style="font-weight: 600;">${UI.escapeHtml(userDisplay)}</div>
          ${fullNameSub}
          ${ipSub}
        </td>
        <td>
          <span class="module-tag">${UI.escapeHtml(log.module || 'general')}</span>
        </td>
        <td>
          <span class="action-badge ${badgeCls}">${UI.escapeHtml(log.action || 'action')}</span>
        </td>
        <td>
          <div style="font-size: 0.88rem; line-height: 1.4;">${UI.escapeHtml(log.description || '—')}</div>
          ${log.table_name ? `<div style="font-size:0.74rem; color:var(--color-text-muted); margin-top:2px;">Table: <code>${UI.escapeHtml(log.table_name)}</code>${log.record_id ? ` (ID: ${log.record_id})` : ''}</div>` : ''}
        </td>
        <td style="text-align: center;">
          <button class="icon-btn inspect-btn" data-id="${log.id}" title="Inspect before/after data">
            ${Icons.render('eye')}
          </button>
        </td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  tableRegion.innerHTML = html;

  // Attach inspect buttons
  tableRegion.querySelectorAll('.inspect-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.getAttribute('data-id'), 10);
      const record = activeLogs.find((l) => l.id === id);
      if (record) showDetailModal(record);
    });
  });
}

function renderPagination() {
  if (totalRecords === 0) {
    paginationRegion.innerHTML = '';
    return;
  }

  const start = (currentPage - 1) * limit + 1;
  const end = Math.min(currentPage * limit, totalRecords);

  paginationRegion.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: var(--color-text-muted); padding: 4px 2px;">
      <div>Showing <strong>${start}</strong>–<strong>${end}</strong> of <strong>${totalRecords.toLocaleString()}</strong> activity events</div>
      <div style="display: flex; gap: 6px;">
        <button class="btn btn-sm btn-secondary" id="page-prev" ${currentPage <= 1 ? 'disabled' : ''}>Previous</button>
        <span style="display: inline-flex; align-items: center; padding: 0 8px; font-weight: 500;">Page ${currentPage} of ${totalPages}</span>
        <button class="btn btn-sm btn-secondary" id="page-next" ${currentPage >= totalPages ? 'disabled' : ''}>Next</button>
      </div>
    </div>
  `;

  const prevBtn = document.getElementById('page-prev');
  const nextBtn = document.getElementById('page-next');
  if (prevBtn) prevBtn.addEventListener('click', () => loadLogs(currentPage - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => loadLogs(currentPage + 1));
}

function showDetailModal(log) {
  dtTimestamp.textContent = formatTimestamp(log.performed_at);
  dtUser.textContent = `${log.user_name || 'System'}${log.user_full_name ? ' (' + log.user_full_name + ')' : ''}`;
  dtIp.textContent = log.ip_address || 'Local / Not recorded';
  dtAction.textContent = `${(log.module || 'general').toUpperCase()} · ${(log.action || 'action').toUpperCase()}`;
  dtDescription.textContent = log.description || 'No description provided.';

  const formatJson = (val) => {
    if (!val) return 'None';
    if (typeof val === 'string') {
      try {
        return JSON.stringify(JSON.parse(val), null, 2);
      } catch (e) {
        return val;
      }
    }
    return JSON.stringify(val, null, 2);
  };

  diffBefore.textContent = formatJson(log.before_data);
  diffAfter.textContent = formatJson(log.after_data);

  modalBackdrop.classList.add('visible');
}

function closeModal() {
  modalBackdrop.classList.remove('visible');
}

// Event Listeners
searchInput.addEventListener('input', debounce(() => loadLogs(1), 300));
moduleFilter.addEventListener('change', () => loadLogs(1));
actionFilter.addEventListener('change', () => loadLogs(1));
userFilter.addEventListener('change', () => loadLogs(1));
startDateInput.addEventListener('change', () => loadLogs(1));
endDateInput.addEventListener('change', () => loadLogs(1));

refreshBtn.addEventListener('click', () => {
  loadStats();
  loadLogs(currentPage);
});

resetFiltersBtn.addEventListener('click', () => {
  searchInput.value = '';
  moduleFilter.value = 'all';
  actionFilter.value = 'all';
  userFilter.value = 'all';
  startDateInput.value = '';
  endDateInput.value = '';
  loadLogs(1);
});

if (modalClose) modalClose.addEventListener('click', closeModal);
if (modalOk) modalOk.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) closeModal();
});

// Initial Load
loadFilters();
loadStats();
loadLogs(1);
