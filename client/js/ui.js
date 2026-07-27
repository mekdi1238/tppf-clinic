/* ===========================================================
   Shared UI helpers — toasts, formatting, badge mapping
   =========================================================== */

const UI = (() => {
  function ensureToastRegion() {
    let region = document.getElementById('toast-region');
    if (!region) {
      region = document.createElement('div');
      region.id = 'toast-region';
      document.body.appendChild(region);
    }
    return region;
  }

  function toast(message, type = 'default') {
    const region = ensureToastRegion();
    const el = document.createElement('div');
    el.className = `toast${type === 'danger' ? ' toast-danger' : ''}`;
    el.innerHTML = `${Icons.render(type === 'danger' ? 'alert' : 'check')}<span>${escapeHtml(message)}</span>`;
    region.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity .2s ease';
      setTimeout(() => el.remove(), 200);
    }, 3200);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function formatDate(iso, opts = {}) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', ...opts });
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function age(dob) {
    if (!dob) return '—';
    const b = new Date(dob);
    const diff = new Date() - b;
    const years = diff / (1000 * 60 * 60 * 24 * 365.25);
    return Math.floor(years);
  }

  const VISIT_STATUS_BADGE = {
    open: 'badge-info',
    examined: 'badge-warning',
    diagnosed: 'badge-primary',
    closed: 'badge-success',
  };

  const VISIT_STATUS_LABEL = {
    open: 'Open',
    examined: 'Examined',
    diagnosed: 'Diagnosed',
    closed: 'Closed',
  };

  function visitStatusBadge(status) {
    const cls = VISIT_STATUS_BADGE[status] || 'badge-neutral';
    const label = VISIT_STATUS_LABEL[status] || status;
    return `<span class="badge ${cls}"><span class="badge-dot"></span>${label}</span>`;
  }

  function patientStatusBadge(isActive) {
    return isActive
      ? `<span class="badge badge-success"><span class="badge-dot"></span>Active</span>`
      : `<span class="badge badge-neutral"><span class="badge-dot"></span>Inactive</span>`;
  }

  const REGISTRATION_STATUS_BADGE = {
    pending: 'badge-info',
    certified_fit: 'badge-success',
    certified_unfit: 'badge-danger',
    hired: 'badge-primary',
    withdrawn: 'badge-neutral',
  };
  const REGISTRATION_STATUS_LABEL = {
    pending: 'Pending',
    certified_fit: 'Certified Fit',
    certified_unfit: 'Certified Unfit',
    hired: 'Hired',
    withdrawn: 'Withdrawn',
  };
  function registrationStatusBadge(status) {
    const cls = REGISTRATION_STATUS_BADGE[status] || 'badge-neutral';
    const label = REGISTRATION_STATUS_LABEL[status] || status;
    return `<span class="badge ${cls}"><span class="badge-dot"></span>${label}</span>`;
  }

  function certResultBadge(result) {
    return result === 'fit'
      ? `<span class="badge badge-success"><span class="badge-dot"></span>Fit</span>`
      : `<span class="badge badge-danger"><span class="badge-dot"></span>Unfit</span>`;
  }

  function admissionStatusBadge(status) {
    return status === 'admitted'
      ? `<span class="badge badge-info"><span class="badge-dot"></span>Admitted</span>`
      : `<span class="badge badge-success"><span class="badge-dot"></span>Discharged</span>`;
  }

  const LAB_STATUS_BADGE = { pending: 'badge-neutral', in_progress: 'badge-warning', completed: 'badge-success' };
  const LAB_STATUS_LABEL = { pending: 'Pending', in_progress: 'In Progress', completed: 'Completed' };
  function labOrderStatusBadge(status) {
    const cls = LAB_STATUS_BADGE[status] || 'badge-neutral';
    const label = LAB_STATUS_LABEL[status] || status;
    return `<span class="badge ${cls}"><span class="badge-dot"></span>${label}</span>`;
  }

  function prescriptionStatusBadge(status) {
    return status === 'fulfilled'
      ? `<span class="badge badge-success"><span class="badge-dot"></span>Fulfilled</span>`
      : `<span class="badge badge-info"><span class="badge-dot"></span>Active</span>`;
  }

  function stockBadge(stock) {
    if (!stock) return `<span class="badge badge-neutral"><span class="badge-dot"></span>No stock record</span>`;
    return stock.quantity_on_hand <= stock.reorder_threshold
      ? `<span class="badge badge-danger"><span class="badge-dot"></span>Low stock</span>`
      : `<span class="badge badge-success"><span class="badge-dot"></span>In stock</span>`;
  }

  function avatar(name, photoUrl, extraStyle = '') {
    if (photoUrl) {
      return `<div class="avatar" style="overflow:hidden; padding:0; ${extraStyle}"><img src="${escapeHtml(photoUrl)}" style="width:100%; height:100%; object-fit:cover;" alt="${escapeHtml(name || '')}" /></div>`;
    }
    const initials = (typeof Auth !== 'undefined' && Auth.initials) ? Auth.initials(name || '?') : '?';
    return `<div class="avatar" style="${extraStyle}">${escapeHtml(initials)}</div>`;
  }

  return { toast, escapeHtml, formatDate, formatDateTime, age, visitStatusBadge, patientStatusBadge, registrationStatusBadge, certResultBadge, admissionStatusBadge, labOrderStatusBadge, prescriptionStatusBadge, stockBadge, errorMessage, avatar };
})();

// Escape key closes whichever modal is currently open, on any page.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.modal-backdrop.visible').forEach(m => m.classList.remove('visible'));
});
