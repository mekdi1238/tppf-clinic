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
    'System Administrator': 'system_administrator',
  };

  // Roles that give a user the full, unrestricted view regardless of
  // what else they hold. Only the system administrator gets this —
  // every other role below is scoped to its own nav set.
  const ELEVATED = ['system_administrator'];

  // Which nav item keys (see shell.js NAV_SECTIONS) each restricted
  // role is allowed to see. Anyone not listed here (or holding an
  // elevated role) sees the full nav, unfiltered.
  //
  // HR Reporting: restricted purely to viewing analytics & reports.
  // HR/Admin: broad clinical visibility (employee health programs)
  //           but NOT system tools like backup and settings.
  const NAV_VISIBILITY = {
    hr_reporting: ['reports'],
    hr_admin: ['dashboard', 'patients', 'visits', 'admissions', 'employee-registrations', 'certifications', 'laboratory', 'pharmacy', 'referrals', 'reports', 'archive', 'users'],
    lab_technician: ['dashboard', 'patients', 'laboratory'],
    pharmacist: ['dashboard', 'patients', 'pharmacy'],
    receptionist: ['dashboard', 'patients', 'visits', 'employee-registrations'],
    physician: ['dashboard', 'patients', 'visits', 'admissions', 'laboratory', 'pharmacy', 'referrals', 'employee-registrations', 'certifications'],
  };

  function current() {
    const session = Auth.getSession();
    if (!session) return [];
    return session.user.roles.map(r => ROLE_KEYS[r]).filter(Boolean);
  }

  function has(key) {
    return current().includes(key);
  }

  // True only if every role the user holds is a restricted one
  // (no admin/HR/physician/receptionist access mixed in).
  function isRestricted() {
    const roles = current();
    if (!roles.length) return false;
    return roles.every(r => !ELEVATED.includes(r)) && roles.some(r => NAV_VISIBILITY[r]);
  }

  // The single restricted role driving the current view. Returns
  // null if the user isn't restricted (i.e. has full access).
  function restrictedRole() {
    if (!isRestricted()) return null;
    const roles = current();
    return roles.find(r => NAV_VISIBILITY[r]) || null;
  }

  function allowedNavKeys() {
    const role = restrictedRole();
    return role ? NAV_VISIBILITY[role] : null; // null = no restriction, show everything
  }

  // Call at the top of a page's script, after Auth.requireAuth(). Redirects
  // away if the current role is restricted and this page isn't in its
  // allowed set. Returns true if it redirected (caller should stop running).
  function blockIfNotAllowed(pageKey) {
    const allowed = allowedNavKeys();
    if (allowed && !allowed.includes(pageKey)) {
      const target = allowed.includes('dashboard') ? 'dashboard.html' : `${allowed[0]}.html`;
      window.location.replace(target);
      return true;
    }
    return false;
  }

  return { current, has, isRestricted, restrictedRole, allowedNavKeys, blockIfNotAllowed };
})();
