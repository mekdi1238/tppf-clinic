/* ===========================================================
   Role guard — role-aware nav and access scoping
   -----------------------------------------------------------
   This is a UI scoping layer only (hides nav/actions a role
   shouldn't use day-to-day). It is NOT a security boundary —
   the mock layer doesn't enforce any of this server-side, and
   neither does the real backend yet. See BACKEND_HANDOFF.md.
   =========================================================== */

const RoleGuard = (() => {
  const ROLE_KEYS = {
    'Receptionist': 'receptionist',
    'Physician': 'physician',
    'Lab Technician': 'lab_technician',
    'Pharmacist': 'pharmacist',
    'HR/Admin': 'hr_admin',
    'HR Reporting': 'hr_reporting',
    'Department HR': 'department_hr',
    'System Administrator': 'system_administrator',
  };

  // Roles that give a user the full, unrestricted view regardless of
  // what else they hold. Only the system administrator gets this —
  // every other role below is scoped to its own nav set.
  const ELEVATED = ['system_administrator'];

  // Which nav item keys (see shell.js NAV_SECTIONS) each restricted
  // role is allowed to see. Anyone not listed here (or holding an
  // elevated role) sees the full nav, unfiltered.
  const NAV_VISIBILITY = {
    department_hr: ['dept-hr', 'reports', 'profile'],
    hr_reporting: ['reports', 'profile'],
    hr_admin: ['dashboard', 'patients', 'visits', 'admissions', 'employee-registrations', 'certifications', 'laboratory', 'pharmacy', 'referrals', 'reports', 'archive', 'users', 'profile'],
    lab_technician: ['dashboard', 'patients', 'laboratory', 'profile'],
    pharmacist: ['dashboard', 'patients', 'pharmacy', 'profile'],
    receptionist: ['dashboard', 'patients', 'visits', 'employee-registrations', 'profile'],
    physician: ['dashboard', 'patients', 'visits', 'admissions', 'laboratory', 'pharmacy', 'referrals', 'employee-registrations', 'certifications', 'profile'],
  };

  function current() {
    const session = Auth.getSession();
    if (!session) return [];
    return session.user.roles.map(r => ROLE_KEYS[r]).filter(Boolean);
  }

  function has(key) {
    return current().includes(key);
  }

  function isRestricted() {
    const roles = current();
    if (!roles.length) return false;
    return roles.every(r => !ELEVATED.includes(r)) && roles.some(r => NAV_VISIBILITY[r]);
  }

  function restrictedRole() {
    const roles = current();
    if (!roles.length) return null;
    if (roles.some(r => ELEVATED.includes(r))) return null;
    return roles.find(r => NAV_VISIBILITY[r]) || null;
  }

  function allowedNavKeys() {
    const roles = current();
    if (!roles.length) return null;
    if (roles.some(r => ELEVATED.includes(r))) return null;

    let hasUnrestricted = false;
    const allowedSet = new Set();

    for (const r of roles) {
      if (NAV_VISIBILITY[r]) {
        NAV_VISIBILITY[r].forEach(k => allowedSet.add(k));
      } else {
        hasUnrestricted = true;
      }
    }

    if (hasUnrestricted) return null;
    return Array.from(allowedSet);
  }

  function blockIfNotAllowed(pageKey) {
    const allowed = allowedNavKeys();
    if (allowed && !allowed.includes(pageKey)) {
      const target = allowed.includes('dept-hr') ? 'dept-hr.html' : (allowed.includes('dashboard') ? 'dashboard.html' : `${allowed[0]}.html`);
      window.location.replace(target);
      return true;
    }
    return false;
  }

  return { current, has, isRestricted, restrictedRole, allowedNavKeys, blockIfNotAllowed };
})();
