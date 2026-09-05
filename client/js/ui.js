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
    accepted_as_staff: 'badge-primary',
    withdrawn: 'badge-neutral',
  };
  const REGISTRATION_STATUS_LABEL = {
    pending: 'Pending',
    certified_fit: 'Certified Fit',
    certified_unfit: 'Certified Unfit',
    hired: 'Hired (Patient)',
    accepted_as_staff: 'Accepted as Staff',
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

  function checkLabResultRange(value, normalRange) {
    if (!value || typeof value !== 'string' || !normalRange || typeof normalRange !== 'string') {
      return null;
    }
    const valClean = value.trim().replace(/,/g, '');
    const num = parseFloat(valClean);
    if (isNaN(num)) return null;

    const rangeStr = normalRange.trim();

    // Case 1: "min - max" e.g. "0.8 - 4.0", "4500 - 11000", "3.5 - 5.1 MMOL/L"
    const dashMatch = rangeStr.match(/^([0-9.]+)\s*-\s*([0-9.]+)/i);
    if (dashMatch) {
      const min = parseFloat(dashMatch[1]);
      const max = parseFloat(dashMatch[2]);
      if (!isNaN(min) && !isNaN(max)) {
        if (num < min) {
          return {
            status: 'low',
            label: 'LOW',
            badgeHtml: `<span class="badge" style="font-size:11px; font-weight:800; padding:2px 6px; background:#FEF3C7; color:#B45309; border:1px solid #FCD34D;">▼ Low</span>`
          };
        }
        if (num > max) {
          return {
            status: 'high',
            label: 'HIGH',
            badgeHtml: `<span class="badge" style="font-size:11px; font-weight:800; padding:2px 6px; background:#FEE2E2; color:#B91C1C; border:1px solid #FCA5A5;">▲ High</span>`
          };
        }
        return {
          status: 'normal',
          label: 'NORMAL',
          badgeHtml: `<span class="badge" style="font-size:11px; font-weight:700; padding:2px 6px; background:#DCFCE7; color:#15803D; border:1px solid #86EFAC;">✓ Normal</span>`
        };
      }
    }

    // Case 2: "Upto X" / "Below X" e.g. "Upto 0.25", "Below 24"
    const uptoMatch = rangeStr.match(/(?:upto|below|under|<)\s*([0-9.]+)/i);
    if (uptoMatch) {
      const max = parseFloat(uptoMatch[1]);
      if (!isNaN(max)) {
        if (num > max) {
          return {
            status: 'high',
            label: 'HIGH',
            badgeHtml: `<span class="badge" style="font-size:11px; font-weight:800; padding:2px 6px; background:#FEE2E2; color:#B91C1C; border:1px solid #FCA5A5;">▲ High</span>`
          };
        }
        return {
          status: 'normal',
          label: 'NORMAL',
          badgeHtml: `<span class="badge" style="font-size:11px; font-weight:700; padding:2px 6px; background:#DCFCE7; color:#15803D; border:1px solid #86EFAC;">✓ Normal</span>`
        };
      }
    }

    // Case 3: "Above X" / "> X" e.g. "Above 45"
    const aboveMatch = rangeStr.match(/(?:above|over|>)\s*([0-9.]+)/i);
    if (aboveMatch) {
      const min = parseFloat(aboveMatch[1]);
      if (!isNaN(min)) {
        if (num < min) {
          return {
            status: 'low',
            label: 'LOW',
            badgeHtml: `<span class="badge" style="font-size:11px; font-weight:800; padding:2px 6px; background:#FEF3C7; color:#B45309; border:1px solid #FCD34D;">▼ Low</span>`
          };
        }
        return {
          status: 'normal',
          label: 'NORMAL',
          badgeHtml: `<span class="badge" style="font-size:11px; font-weight:700; padding:2px 6px; background:#DCFCE7; color:#15803D; border:1px solid #86EFAC;">✓ Normal</span>`
        };
      }
    }

    return null;
  }

  function prescriptionStatusBadge(status) {
    return status === 'fulfilled'
      ? `<span class="badge badge-success"><span class="badge-dot"></span>Fulfilled</span>`
      : `<span class="badge badge-info"><span class="badge-dot"></span>Active</span>`;
  }

  function stockBadge(stock) {
    if (!stock) return `<span class="badge badge-neutral"><span class="badge-dot"></span>No stock</span>`;
    const qty = Number(stock.quantity_on_hand) || 0;
    const threshold = Number(stock.reorder_threshold) || 0;
    const max = stock.max_threshold !== null && stock.max_threshold !== undefined && stock.max_threshold !== '' ? Number(stock.max_threshold) : null;
    if (qty === 0) {
      return `<span class="badge badge-danger" style="background:#FDE8E8; color:#9B1C1C; border:1px solid #F8B4B4; font-weight:600;"><span class="badge-dot" style="background:#E02424;"></span>Out of stock</span>`;
    }
    if (qty <= threshold) {
      return `<span class="badge badge-warning" style="background:#FEF08A; color:#854D0E; border:1px solid #FDE047; font-weight:600;"><span class="badge-dot" style="background:#CA8A04;"></span>Low stock</span>`;
    }
    if (max !== null && qty > max) {
      return `<span class="badge badge-info" style="background:#E1EFFE; color:#1E429F; border:1px solid #B4C6FC; font-weight:600;"><span class="badge-dot" style="background:#3F83F8;"></span>Overstocked</span>`;
    }
    return `<span class="badge badge-success" style="background:#DEF7EC; color:#03543F; border:1px solid #BCF0DA; font-weight:600;"><span class="badge-dot" style="background:#0E9F6E;"></span>In stock</span>`;
  }

  function drugExpiryBadge(expiryDate) {
    if (!expiryDate) {
      return `<span class="badge badge-neutral" style="background:#F3F4F6; color:#4B5563; border:1px solid #E5E7EB;"><span class="badge-dot" style="background:#9CA3AF;"></span>No Expiry Set</span>`;
    }
    const expiry = new Date(expiryDate);
    if (isNaN(expiry.getTime())) {
      return `<span class="badge badge-neutral"><span class="badge-dot"></span>Invalid date</span>`;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sixMonthsLater = new Date(today);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);

    if (expiry < today) {
      return `<span class="badge badge-danger" style="background:#FDE8E8; color:#9B1C1C; border:1px solid #F8B4B4; font-weight:700;"><span class="badge-dot" style="background:#E02424;"></span>Expired</span>`;
    }
    if (expiry <= sixMonthsLater) {
      return `<span class="badge badge-warning" style="background:#FFEDD5; color:#9A3412; border:1px solid #FED7AA; font-weight:700;"><span class="badge-dot" style="background:#EA580C;"></span>Expiring Soon</span>`;
    }
    return `<span class="badge badge-success" style="background:#DEF7EC; color:#03543F; border:1px solid #BCF0DA; font-weight:600;"><span class="badge-dot" style="background:#0E9F6E;"></span>Good Condition</span>`;
  }

  function medicalCertificateBadge(patient) {
    if (!patient) return `<span class="badge badge-neutral" style="background:#F3F4F6; color:#6B7280; border:1px solid #E5E7EB;"><span class="badge-dot" style="background:#9CA3AF;"></span>No Certificate</span>`;

    const status = typeof patient === 'string' ? patient : (patient.certificate_status || (patient.has_certificate === false ? 'no_certificate' : null));

    if (status === 'no_certificate' || (!patient.latest_certificate_id && !patient.last_fitness_exam_date && !patient.certificate_exam_date)) {
      return `<span class="badge badge-neutral" style="background:#FEF3C7; color:#92400E; border:1px solid #FCD34D; font-weight:600;"><span class="badge-dot" style="background:#D97706;"></span>No Certificate</span>`;
    }

    const nextDueDate = patient.next_checkup_due_date ? new Date(patient.next_checkup_due_date) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (patient.fitness_status === 'unfit' || patient.certificate_result === 'unfit') {
      return `<span class="badge badge-danger" style="background:#FDE8E8; color:#9B1C1C; border:1px solid #F8B4B4; font-weight:700;"><span class="badge-dot" style="background:#E02424;"></span>Unfit</span>`;
    }

    if (nextDueDate && nextDueDate < today) {
      return `<span class="badge badge-danger" style="background:#FDE8E8; color:#9B1C1C; border:1px solid #F8B4B4; font-weight:700;"><span class="badge-dot" style="background:#E02424;"></span>Cert Expired</span>`;
    }

    const sevenDaysLater = new Date(today);
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

    if (nextDueDate && nextDueDate <= sevenDaysLater) {
      return `<span class="badge badge-warning" style="background:#FFEDD5; color:#9A3412; border:1px solid #FED7AA; font-weight:700;"><span class="badge-dot" style="background:#EA580C;"></span>Renewal Due Soon</span>`;
    }

    return `<span class="badge badge-success" style="background:#DEF7EC; color:#03543F; border:1px solid #BCF0DA; font-weight:600;"><span class="badge-dot" style="background:#0E9F6E;"></span>Certified Fit</span>`;
  }

  function getInitials(name) {
    if (!name) return '?';
    return (typeof Auth !== 'undefined' && Auth.initials) ? Auth.initials(name) : name.charAt(0).toUpperCase();
  }

  function avatar(name, photoUrl, extraStyle = '') {
    if (photoUrl) {
      return `<div class="avatar" style="overflow:hidden; padding:0; ${extraStyle}"><img src="${escapeHtml(photoUrl)}" style="width:100%; height:100%; object-fit:cover;" alt="${escapeHtml(name || '')}" /></div>`;
    }
    const initials = getInitials(name || '?');
    return `<div class="avatar" style="${extraStyle}">${escapeHtml(initials)}</div>`;
  }

  function errorMessage(e) {
    return (e && e.message) ? e.message : 'Something went wrong. Please try again.';
  }

  function makeSearchableSelect(selectEl, optionsData, placeholder = 'Type to search…') {
    if (!selectEl) return;
    
    selectEl.style.display = 'none';

    let parentField = selectEl.closest('.field') || selectEl.parentNode;
    let oldWrap = parentField.querySelector('.searchable-select-wrap');
    if (oldWrap) oldWrap.remove();

    const wrap = document.createElement('div');
    wrap.className = 'searchable-select-wrap';
    
    const inputBox = document.createElement('div');
    inputBox.className = 'searchable-select-input-box';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'searchable-select-input';
    input.placeholder = placeholder;
    input.autocomplete = 'off';

    const arrow = document.createElement('span');
    arrow.className = 'searchable-select-arrow';
    arrow.innerHTML = '&#9660;';

    inputBox.appendChild(input);
    inputBox.appendChild(arrow);

    const dropdown = document.createElement('div');
    dropdown.className = 'searchable-select-dropdown';

    wrap.appendChild(inputBox);
    wrap.appendChild(dropdown);

    selectEl.parentNode.insertBefore(wrap, selectEl.nextSibling);

    let currentOptions = optionsData.map(opt => typeof opt === 'string' ? { value: opt, label: opt } : opt);

    function renderOptions(filterText = '') {
      const text = filterText.toLowerCase().trim();
      const filtered = currentOptions.filter(o => 
        !text || 
        (o.label && o.label.toLowerCase().includes(text)) || 
        (o.sublabel && o.sublabel.toLowerCase().includes(text)) ||
        (o.value && String(o.value).toLowerCase().includes(text))
      );

      if (!filtered.length) {
        dropdown.innerHTML = `<div class="searchable-select-empty">No matching records found</div>`;
        return;
      }

      dropdown.innerHTML = filtered.map(o => {
        const isSelected = String(selectEl.value) === String(o.value);
        return `
          <div class="searchable-select-option ${isSelected ? 'selected' : ''}" data-value="${escapeHtml(String(o.value))}" data-label="${escapeHtml(o.label)}">
            <span>${escapeHtml(o.label)}</span>
            ${o.sublabel ? `<span class="option-sub">${escapeHtml(o.sublabel)}</span>` : ''}
          </div>
        `;
      }).join('');

      dropdown.querySelectorAll('.searchable-select-option').forEach(optEl => {
        optEl.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const val = optEl.getAttribute('data-value');
          const lbl = optEl.getAttribute('data-label');
          selectEl.value = val;
          input.value = lbl;
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          dropdown.classList.remove('visible');
        });
      });
    }

    const initialOpt = currentOptions.find(o => String(o.value) === String(selectEl.value));
    if (initialOpt) {
      input.value = initialOpt.label;
    }

    selectEl.addEventListener('change', () => {
      const selOpt = currentOptions.find(o => String(o.value) === String(selectEl.value));
      if (selOpt) input.value = selOpt.label;
      else input.value = '';
    });

    input.addEventListener('focus', () => {
      renderOptions(input.value);
      dropdown.classList.add('visible');
    });

    input.addEventListener('input', () => {
      renderOptions(input.value);
      dropdown.classList.add('visible');
    });

    input.addEventListener('blur', () => {
      setTimeout(() => dropdown.classList.remove('visible'), 150);
    });

    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) {
        dropdown.classList.remove('visible');
      }
    });

    return {
      setValue: (val, label) => {
        selectEl.value = val;
        input.value = label || val;
      },
      updateOptions: (newOpts) => {
        currentOptions = newOpts.map(opt => typeof opt === 'string' ? { value: opt, label: opt } : opt);
        const selOpt = currentOptions.find(o => String(o.value) === String(selectEl.value));
        if (selOpt) input.value = selOpt.label;
        else input.value = '';
        renderOptions('');
      }
    };
  }

  function getDateRangeFromPreset(preset, customStart = null, customEnd = null) {
    const now = new Date();
    const currentYear = now.getFullYear();
    // Ethiopian fiscal year reference (Hamle 1 is July 8)
    const ethYearStartYear = (now.getMonth() < 6 || (now.getMonth() === 6 && now.getDate() < 8)) ? currentYear - 1 : currentYear;

    let start = null;
    let end = null;
    let label = 'All Time';

    switch (preset) {
      case 'daily':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        label = 'Today (Daily)';
        break;

      case 'weekly': {
        const day = now.getDay();
        const diffToMon = now.getDate() - day + (day === 0 ? -6 : 1);
        start = new Date(now.getFullYear(), now.getMonth(), diffToMon, 0, 0, 0);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        label = 'This Week (Weekly)';
        break;
      }

      case 'monthly':
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        label = 'This Month (Monthly)';
        break;

      case 'q1': // Hamle – Meskerem [Jul 8 – Oct 10 G.C.]
        start = new Date(ethYearStartYear, 6, 8, 0, 0, 0);
        end = new Date(ethYearStartYear, 9, 10, 23, 59, 59, 999);
        label = 'Q1: Hamle – Meskerem [Jul 8 – Oct 10 G.C.]';
        break;

      case 'q2': // Tikimt – Tahisas [Oct 11 – Jan 8 G.C.]
        start = new Date(ethYearStartYear, 9, 11, 0, 0, 0);
        end = new Date(ethYearStartYear + 1, 0, 8, 23, 59, 59, 999);
        label = 'Q2: Tikimt – Tahisas [Oct 11 – Jan 8 G.C.]';
        break;

      case 'q3': // Tir – Megabit [Jan 9 – Apr 8 G.C.]
        start = new Date(ethYearStartYear + 1, 0, 9, 0, 0, 0);
        end = new Date(ethYearStartYear + 1, 3, 8, 23, 59, 59, 999);
        label = 'Q3: Tir – Megabit [Jan 9 – Apr 8 G.C.]';
        break;

      case 'q4': // Miazia – Sene [Apr 9 – Jul 7 G.C.]
        start = new Date(ethYearStartYear + 1, 3, 9, 0, 0, 0);
        end = new Date(ethYearStartYear + 1, 6, 7, 23, 59, 59, 999);
        label = 'Q4: Miazia – Sene [Apr 9 – Jul 7 G.C.]';
        break;

      case 'half1': // 1st Half Year: Hamle – Tahisas [Jul 8 – Jan 8 G.C.]
        start = new Date(ethYearStartYear, 6, 8, 0, 0, 0);
        end = new Date(ethYearStartYear + 1, 0, 8, 23, 59, 59, 999);
        label = '1st Half Year: Hamle – Tahisas [Jul 8 – Jan 8 G.C.]';
        break;

      case 'half2': // 2nd Half Year: Tir – Sene [Jan 9 – Jul 7 G.C.]
        start = new Date(ethYearStartYear + 1, 0, 9, 0, 0, 0);
        end = new Date(ethYearStartYear + 1, 6, 7, 23, 59, 59, 999);
        label = '2nd Half Year: Tir – Sene [Jan 9 – Jul 7 G.C.]';
        break;

      case 'annual': // Annual: Hamle 1 – Sene 30 [Jul 8 – Jul 7 G.C.]
        start = new Date(ethYearStartYear, 6, 8, 0, 0, 0);
        end = new Date(ethYearStartYear + 1, 6, 7, 23, 59, 59, 999);
        label = `Annual E.C. [Jul 8, ${ethYearStartYear} – Jul 7, ${ethYearStartYear + 1} G.C.]`;
        break;

      case 'custom':
        if (customStart) start = new Date(customStart + 'T00:00:00');
        if (customEnd) end = new Date(customEnd + 'T23:59:59.999');
        label = `Custom Range (${customStart || '…'} to ${customEnd || '…'})`;
        break;

      default:
        start = null;
        end = null;
        label = 'All Time';
        break;
    }

    return { start, end, label };
  }

  return { toast, escapeHtml, formatDate, formatDateTime, age, visitStatusBadge, patientStatusBadge, registrationStatusBadge, certResultBadge, medicalCertificateBadge, admissionStatusBadge, labOrderStatusBadge, checkLabResultRange, prescriptionStatusBadge, stockBadge, drugExpiryBadge, errorMessage, avatar, getInitials, makeSearchableSelect, getDateRangeFromPreset };
})();

// Escape key closes whichever modal is currently open, on any page.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.modal-backdrop.visible').forEach(m => m.classList.remove('visible'));
});

/* ===========================================================
   Sticky horizontal scrollbar — initStickyScrollbars()
   -----------------------------------------------------------
   Attaches a ghost scrollbar that stays pinned at the bottom
   of the viewport for every .table-wrap on the page.
   Mouse users can scroll wide tables horizontally without
   having to first scroll all the way down to the native
   browser scrollbar at the end of the page content.

   Call after rendering any table:
     initStickyScrollbars();          // re-scans all .table-wrap
   =========================================================== */
function initStickyScrollbars() {
  document.querySelectorAll('.table-wrap').forEach(wrap => {
    // Skip if already has a ghost scroller sibling
    if (wrap.nextElementSibling && wrap.nextElementSibling.classList.contains('table-ghost-scroll')) return;

    // Only attach when content is actually wider than the container
    if (wrap.scrollWidth <= wrap.clientWidth + 1) return;

    const ghost = document.createElement('div');
    ghost.className = 'table-ghost-scroll';
    const inner = document.createElement('div');
    inner.className = 'table-ghost-inner';
    ghost.appendChild(inner);

    // Match the inner spacer to the real scroll width
    function syncWidth() {
      inner.style.width = wrap.scrollWidth + 'px';
    }
    syncWidth();

    // Two-way scroll sync (prevent feedback loops with a flag)
    let syncing = false;
    wrap.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      ghost.scrollLeft = wrap.scrollLeft;
      syncing = false;
    });
    ghost.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      wrap.scrollLeft = ghost.scrollLeft;
      syncing = false;
    });

    // Re-sync width when table content changes (e.g. after data loads)
    const ro = new ResizeObserver(() => {
      syncWidth();
      // Hide ghost when no longer needed
      ghost.style.display = wrap.scrollWidth > wrap.clientWidth + 1 ? '' : 'none';
    });
    ro.observe(wrap);

    // Insert ghost right after the table-wrap
    wrap.insertAdjacentElement('afterend', ghost);
  });
}

// Auto-attach on page ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(initStickyScrollbars, 200));
} else {
  setTimeout(initStickyScrollbars, 200);
}

// Also watch for dynamically inserted .table-wrap elements (JS-rendered tables)
const _tableScrollObserver = new MutationObserver(() => {
  initStickyScrollbars();
});
_tableScrollObserver.observe(document.body, { childList: true, subtree: true });
