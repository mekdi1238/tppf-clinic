/* ===========================================================
   Role guard — role-aware nav and access scoping
   -----------------------------------------------------------
   Now delegates to Permissions.js for granular per-user
   permission checks, while maintaining backward compatibility.
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
    'receptionist': 'receptionist',
    'physician': 'physician',
    'lab_technician': 'lab_technician',
    'pharmacist': 'pharmacist',
    'hr_admin': 'hr_admin',
    'hr_reporting': 'hr_reporting',
    'department_hr': 'department_hr',
    'system_administrator': 'system_administrator',
  };

  const ELEVATED = ['system_administrator'];

  function current() {
    const session = Auth.getSession();
    if (!session) return [];
    return (session.user.roles || []).map(r => ROLE_KEYS[r] || r).filter(Boolean);
  }

  function has(key) {
    return current().includes(key);
  }

  function isRestricted() {
    const roles = current();
    if (!roles.length) return false;
    return roles.every(r => !ELEVATED.includes(r));
  }

  function restrictedRole() {
    const roles = current();
    if (!roles.length) return null;
    if (roles.some(r => ELEVATED.includes(r))) return null;
    return roles[0] || null;
  }

  // Delegate to Permissions engine for nav keys
  function allowedNavKeys() {
    if (typeof Permissions !== 'undefined') {
      return Permissions.allowedNavKeys();
    }
    return null; // fallback: no filtering
  }

  function blockIfNotAllowed(pageKey) {
    if (typeof Permissions !== 'undefined') {
      return Permissions.blockIfNotAllowed(pageKey);
    }
    return false;
  }

  return { current, has, isRestricted, restrictedRole, allowedNavKeys, blockIfNotAllowed };
})();
