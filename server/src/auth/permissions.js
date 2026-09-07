// server/src/auth/permissions.js
// Single source of truth for backend granular permissions, role defaults, and route-to-permission mapping.

const PERMISSION_DEFS = [
  // Navigation
  "nav.dashboard", "nav.patients", "nav.visits", "nav.admissions", "nav.checkups",
  "nav.registrations", "nav.certifications", "nav.laboratory", "nav.pharmacy",
  "nav.referrals", "nav.reports", "nav.departments", "nav.audit_logs", "nav.archive",
  "nav.users", "nav.backup", "nav.settings", "nav.dept_hr", "nav.profile",

  // Patients
  "patients.create", "patients.edit", "patients.delete", "patients.view_history",

  // Visits
  "visits.create", "visits.edit", "visits.delete", "vitals.create",

  // Admissions
  "admissions.create", "admissions.edit", "admissions.discharge",

  // Check-ups
  "checkups.dispatch", "checkups.edit_date", "checkups.approve",

  // Registrations
  "registrations.create", "registrations.edit", "registrations.delete", "registrations.accept",

  // Certifications
  "certs.create", "certs.edit", "certs.delete",

  // Laboratory
  "lab.create_order", "lab.record_result", "lab.delete",

  // Pharmacy
  "pharmacy.dispense", "pharmacy.manage_stock", "pharmacy.delete",

  // Referrals & Sick Leaves
  "referrals.create", "referrals.edit", "referrals.delete", "sick_leaves.create",

  // Reports
  "reports.export",

  // Departments & Positions
  "departments.manage",

  // Audit Logs & Archive
  "audit_logs.view", "audit_logs.export", "archive.restore",

  // Users & Roles
  "users.create", "users.edit", "users.delete",

  // Backup & Settings
  "backup.create", "backup.restore", "backup.delete", "settings.edit",

  // Dept HR & Profile
  "dept_hr.dispatch", "profile.edit",
];

const ROLE_DEFAULTS = {
  system_administrator: PERMISSION_DEFS, // all permissions

  physician: [
    "nav.dashboard", "nav.patients", "nav.visits", "nav.admissions", "nav.checkups",
    "nav.registrations", "nav.certifications", "nav.laboratory", "nav.pharmacy",
    "nav.referrals", "nav.reports", "reports.export", "nav.profile",
    "patients.create", "patients.edit", "patients.view_history",
    "visits.create", "visits.edit", "visits.delete", "vitals.create",
    "admissions.create", "admissions.edit", "admissions.discharge",
    "lab.create_order",
    "certs.create", "certs.edit",
    "checkups.dispatch", "checkups.edit_date",
    "referrals.create", "referrals.edit", "sick_leaves.create",
    "profile.edit",
  ],

  receptionist: [
    "nav.dashboard", "nav.patients", "nav.visits", "nav.checkups",
    "nav.registrations", "nav.reports", "reports.export", "nav.profile",
    "patients.create", "patients.edit",
    "visits.create", "visits.delete",
    "checkups.dispatch",
    "registrations.create", "registrations.edit",
    "profile.edit",
  ],

  hr_admin: [
    "nav.dashboard", "nav.patients", "nav.visits", "nav.admissions", "nav.checkups",
    "nav.registrations", "nav.certifications", "nav.laboratory", "nav.pharmacy",
    "nav.referrals", "nav.reports", "nav.audit_logs", "nav.users", "nav.profile",
    "patients.create", "patients.edit", "patients.view_history",
    "visits.create", "visits.edit", "visits.delete", "vitals.create",
    "admissions.create", "admissions.edit", "admissions.discharge",
    "lab.create_order", "lab.record_result",
    "pharmacy.dispense", "pharmacy.manage_stock",
    "certs.create", "certs.edit",
    "checkups.dispatch", "checkups.approve", "checkups.edit_date",
    "referrals.create", "referrals.edit", "sick_leaves.create",
    "registrations.create", "registrations.edit", "registrations.delete", "registrations.accept",
    "reports.export",
    "audit_logs.view", "audit_logs.export",
    "users.create", "users.edit",
    "profile.edit",
  ],

  department_hr: [
    "nav.dept_hr", "nav.checkups", "nav.reports", "nav.profile",
    "dept_hr.dispatch", "checkups.dispatch", "checkups.approve", "reports.export",
    "profile.edit",
  ],

  hr_reporting: [
    "nav.reports", "reports.export", "nav.profile", "profile.edit",
  ],

  lab_technician: [
    "nav.dashboard", "nav.patients", "nav.laboratory", "nav.reports", "reports.export", "nav.profile",
    "lab.record_result", "profile.edit",
  ],

  pharmacist: [
    "nav.dashboard", "nav.patients", "nav.pharmacy", "nav.reports", "reports.export", "nav.profile",
    "pharmacy.dispense", "pharmacy.manage_stock", "profile.edit",
  ],
};

// Route matching rules to identify which granular permission guards each endpoint
const ROUTE_RULES = [
  // Patients
  { method: "POST", pattern: /\/patients\/import$/, perm: "patients.create" },
  { method: "POST", pattern: /\/patients$/, perm: "patients.create" },
  { method: "PUT", pattern: /\/patients\/\d+$/, perm: "patients.edit" },
  { method: "DELETE", pattern: /\/patients\/\d+$/, perm: "patients.delete" },
  { method: "GET", pattern: /\/patients/, perm: "nav.patients" },

  // Registrations
  { method: "POST", pattern: /\/registrations\/import$/, perm: "registrations.create" },
  { method: "POST", pattern: /\/registrations\/\d+\/accept-as-staff$/, perm: "registrations.accept" },
  { method: "POST", pattern: /\/registrations\/\d+\/create-visit$/, perm: "checkups.dispatch" },
  { method: "POST", pattern: /\/registrations$/, perm: "registrations.create" },
  { method: "PUT", pattern: /\/registrations\/\d+$/, perm: "registrations.edit" },
  { method: "DELETE", pattern: /\/registrations\/\d+$/, perm: "registrations.delete" },
  { method: "GET", pattern: /\/registrations/, perm: "nav.registrations" },

  // Visits & Vitals
  { method: "POST", pattern: /\/visits\/\d+\/vitals$/, perm: "vitals.create" },
  { method: "GET", pattern: /\/visits\/\d+\/vitals$/, perm: "nav.visits" },
  { method: "POST", pattern: /\/visits$/, perm: "visits.create" },
  { method: "PUT", pattern: /\/visits\/\d+$/, perm: "visits.edit" },
  { method: "DELETE", pattern: /\/visits\/\d+$/, perm: "visits.delete" },
  { method: "GET", pattern: /\/visits/, perm: "nav.visits" },

  // Admissions
  { method: "POST", pattern: /\/admissions$/, perm: "admissions.create" },
  { method: "POST", pattern: /\/admissions\/\d+\/notes$/, perm: "admissions.edit" },
  { method: "POST", pattern: /\/admissions\/\d+\/discharge$/, perm: "admissions.discharge" },
  { method: "GET", pattern: /\/admissions/, perm: "nav.admissions" },

  // Certifications
  { method: "POST", pattern: /\/certifications$/, perm: "certs.create" },
  { method: "PUT", pattern: /\/certifications\/\d+$/, perm: "certs.edit" },
  { method: "DELETE", pattern: /\/certifications\/\d+$/, perm: "certs.delete" },
  { method: "GET", pattern: /\/certifications/, perm: "nav.certifications" },

  // Checkups
  { method: "POST", pattern: /\/checkups\/dispatch-renewal$/, perm: "checkups.dispatch" },
  { method: "POST", pattern: /\/checkups\/approve-renewal$/, perm: "checkups.approve" },
  { method: "PUT", pattern: /\/checkups\/edit-exam-date$/, perm: "checkups.edit_date" },
  { method: "GET", pattern: /\/checkups/, perm: "nav.checkups" },

  // Laboratory
  { method: "POST", pattern: /\/lab-orders$/, perm: "lab.create_order" },
  { method: "PUT", pattern: /\/lab-orders\/\d+\/results$/, perm: "lab.record_result" },
  { method: "PUT", pattern: /\/lab-orders\/\d+\/items\/\d+$/, perm: "lab.record_result" },
  { method: "PUT", pattern: /\/lab-orders\/\d+$/, perm: "lab.record_result" },
  { method: "DELETE", pattern: /\/lab-orders\/\d+$/, perm: "lab.delete" },
  { method: "GET", pattern: /\/lab-orders/, perm: "nav.laboratory" },
  { method: "GET", pattern: /\/lab-test-catalog/, perm: "nav.laboratory" },

  // Pharmacy
  { method: "POST", pattern: /\/prescriptions\/\d+\/dispense$/, perm: "pharmacy.dispense" },
  { method: "POST", pattern: /\/drugs\/import$/, perm: "pharmacy.manage_stock" },
  { method: "POST", pattern: /\/drugs$/, perm: "pharmacy.manage_stock" },
  { method: "PUT", pattern: /\/drug-stock\/\d+$/, perm: "pharmacy.manage_stock" },
  { method: "PUT", pattern: /\/drugs\/\d+$/, perm: "pharmacy.manage_stock" },
  { method: "DELETE", pattern: /\/drugs\/\d+$/, perm: "pharmacy.delete" },
  { method: "DELETE", pattern: /\/prescriptions\/\d+$/, perm: "pharmacy.delete" },
  { method: "GET", pattern: /\/pharmacy/, perm: "nav.pharmacy" },
  { method: "GET", pattern: /\/drugs/, perm: "nav.pharmacy" },
  { method: "GET", pattern: /\/prescriptions/, perm: "nav.pharmacy" },

  // Referrals & Sick Leaves
  { method: "POST", pattern: /\/referrals$/, perm: "referrals.create" },
  { method: "PUT", pattern: /\/referrals\/\d+$/, perm: "referrals.edit" },
  { method: "DELETE", pattern: /\/referrals\/\d+$/, perm: "referrals.delete" },
  { method: "POST", pattern: /\/sick-leaves$/, perm: "sick_leaves.create" },
  { method: "PUT", pattern: /\/sick-leaves\/\d+$/, perm: "referrals.edit" },
  { method: "DELETE", pattern: /\/sick-leaves\/\d+$/, perm: "referrals.delete" },
  { method: "GET", pattern: /\/referrals/, perm: "nav.referrals" },
  { method: "GET", pattern: /\/sick-leaves/, perm: "nav.referrals" },

  // Users & Roles
  { method: "POST", pattern: /\/users$/, perm: "users.create" },
  { method: "PUT", pattern: /\/users\/\d+$/, perm: "users.edit" },
  { method: "DELETE", pattern: /\/users\/\d+$/, perm: "users.delete" },
  { method: "PUT", pattern: /\/roles\/\d+$/, perm: "users.edit" },
  { method: "GET", pattern: /\/users/, perm: "nav.users" },
  { method: "GET", pattern: /\/roles/, perm: "nav.users" },

  // Departments & Positions
  { method: "POST", pattern: /\/departments/, perm: "departments.manage" },
  { method: "PUT", pattern: /\/departments/, perm: "departments.manage" },
  { method: "DELETE", pattern: /\/departments/, perm: "departments.manage" },

  // Backups
  { method: "POST", pattern: /\/backups\/\d+\/restore$/, perm: "backup.restore" },
  { method: "POST", pattern: /\/backups$/, perm: "backup.create" },
  { method: "DELETE", pattern: /\/backups\/\d+$/, perm: "backup.delete" },
  { method: "GET", pattern: /\/backups/, perm: "nav.backup" },

  // Settings
  { method: "PUT", pattern: /\/settings$/, perm: "settings.edit" },
  { method: "GET", pattern: /\/settings/, perm: "nav.settings" },

  // Reports & Audit
  { method: "GET", pattern: /\/reports/, perm: "nav.reports" },
  { method: "GET", pattern: /\/audit-logs/, perm: "audit_logs.view" },
];

function getRoutePermission(method, path) {
  const normalizedMethod = (method || "").toUpperCase();
  const normalizedPath = (path || "").replace(/\/+$/, ""); // remove trailing slash

  for (const rule of ROUTE_RULES) {
    if (rule.method === normalizedMethod && rule.pattern.test(normalizedPath)) {
      return rule.perm;
    }
  }
  return null;
}

module.exports = {
  PERMISSION_DEFS,
  ROLE_DEFAULTS,
  getRoutePermission,
};
