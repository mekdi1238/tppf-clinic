/* ===========================================================
   Permissions — Granular Per-User & Role Permission Engine
   -----------------------------------------------------------
   Provides a clean Matrix CRUD Table interface and resolution
   order for permissions:
     1. Explicit user override (user_permissions) → highest priority
     2. Dynamic Predefined Role Defaults (roles.default_permissions) → baseline
   =========================================================== */

const Permissions = (() => {

  // --------------- Master Permission Definitions ---------------
  const PERMISSION_DEFS = [
    // Navigation (View)
    { key: 'nav.dashboard',      label: 'View Dashboard',                 category: 'Clinical Overview' },
    { key: 'nav.patients',       label: 'View Patients',                  category: 'Clinical Overview' },
    { key: 'nav.visits',         label: 'View Visits',                    category: 'Clinical Overview' },
    { key: 'nav.admissions',     label: 'View Admissions',                category: 'Clinical Overview' },
    { key: 'nav.checkups',       label: 'View Periodic Check-ups',        category: 'Clinical Overview' },
    { key: 'nav.registrations',  label: 'View Employee Registrations',    category: 'Workforce' },
    { key: 'nav.certifications', label: 'View Certifications',            category: 'Workforce' },
    { key: 'nav.dept_hr',        label: 'View Dept HR Portal',            category: 'Workforce' },
    { key: 'nav.laboratory',     label: 'View Laboratory',                category: 'Clinical Services' },
    { key: 'nav.pharmacy',       label: 'View Pharmacy',                  category: 'Clinical Services' },
    { key: 'nav.referrals',      label: 'View Referrals & Certificates',  category: 'Clinical Services' },
    { key: 'nav.reports',        label: 'View Reports',                   category: 'Administration' },
    { key: 'nav.departments',    label: 'View Departments & Positions',   category: 'Administration' },
    { key: 'nav.audit_logs',     label: 'View Activity Logs',             category: 'Administration' },
    { key: 'nav.archive',        label: 'View Archive',                   category: 'Administration' },
    { key: 'nav.users',          label: 'View Users & Roles',             category: 'Administration' },
    { key: 'nav.backup',         label: 'View Backup',                    category: 'Administration' },
    { key: 'nav.settings',       label: 'View Settings',                  category: 'Administration' },
    { key: 'nav.profile',        label: 'View Profile',                   category: 'Account' },

    // Patients
    { key: 'patients.create',       label: 'Create Patients (Walk-in & Import)', category: 'Patients' },
    { key: 'patients.edit',         label: 'Edit Patient Details',               category: 'Patients' },
    { key: 'patients.delete',       label: 'Delete / Archive Patient',           category: 'Patients' },
    { key: 'patients.view_history', label: 'View Full Clinical History',         category: 'Patients' },

    // Visits
    { key: 'visits.create', label: 'Create Visits & Vitals', category: 'Visits' },
    { key: 'visits.edit',   label: 'Edit Consultation & Diagnosis', category: 'Visits' },
    { key: 'visits.delete', label: 'Delete Visit', category: 'Visits' },
    { key: 'vitals.create', label: 'Record Patient Vitals', category: 'Visits' },

    // Admissions
    { key: 'admissions.create',    label: 'Admit Patient to Ward', category: 'Admissions' },
    { key: 'admissions.edit',      label: 'Add Ward Notes & Update Bed', category: 'Admissions' },
    { key: 'admissions.discharge', label: 'Discharge Patient', category: 'Admissions' },

    // Check-ups
    { key: 'checkups.dispatch',  label: 'Dispatch Renewal Visit', category: 'Check-ups' },
    { key: 'checkups.edit_date', label: 'Edit Scheduled Exam Date', category: 'Check-ups' },
    { key: 'checkups.approve',   label: 'Approve Renewal / Cert Status', category: 'Check-ups' },

    // Employee Registrations
    { key: 'registrations.create', label: 'Register Candidates & Import', category: 'Registrations' },
    { key: 'registrations.edit',   label: 'Edit Candidate Details', category: 'Registrations' },
    { key: 'registrations.delete', label: 'Delete Candidate Record', category: 'Registrations' },
    { key: 'registrations.accept', label: 'Accept Candidate as Staff', category: 'Registrations' },

    // Certifications
    { key: 'certs.create', label: 'Record Fitness Exam Certificate', category: 'Certifications' },
    { key: 'certs.edit',   label: 'Edit Fitness Certificate', category: 'Certifications' },
    { key: 'certs.delete', label: 'Delete Certificate', category: 'Certifications' },

    // Laboratory
    { key: 'lab.create_order',  label: 'Create / Order Lab Tests', category: 'Laboratory' },
    { key: 'lab.record_result', label: 'Record Results & Tech Notes', category: 'Laboratory' },
    { key: 'lab.delete',        label: 'Cancel / Delete Lab Order', category: 'Laboratory' },

    // Pharmacy
    { key: 'pharmacy.dispense',     label: 'Dispense Prescriptions', category: 'Pharmacy' },
    { key: 'pharmacy.manage_stock', label: 'Add Drugs, Import & Adjust Stock', category: 'Pharmacy' },
    { key: 'pharmacy.delete',       label: 'Delete Drugs & Prescriptions', category: 'Pharmacy' },

    // Referrals & Sick Leaves
    { key: 'referrals.create',   label: 'Create External Referral', category: 'Referrals' },
    { key: 'referrals.edit',     label: 'Edit Referral Record', category: 'Referrals' },
    { key: 'referrals.delete',   label: 'Delete Referral / Sick Leave', category: 'Referrals' },
    { key: 'sick_leaves.create', label: 'Issue Sick Leave Certificate', category: 'Referrals' },

    // Reports & Analytics
    { key: 'reports.export', label: 'Export Custom Reports', category: 'Reports' },

    // Departments & Positions
    { key: 'departments.manage', label: 'Create, Edit & Delete Departments/Positions', category: 'Departments' },

    // Activity Logs & Archive
    { key: 'audit_logs.view',   label: 'View System Audit Logs', category: 'Administration' },
    { key: 'audit_logs.export', label: 'Export Audit Logs', category: 'Administration' },
    { key: 'archive.restore',   label: 'Restore Records from Archive', category: 'Administration' },

    // Users & Roles
    { key: 'users.create', label: 'Create User Accounts', category: 'Users' },
    { key: 'users.edit',   label: 'Edit Users, Roles & Fine-Tune Perms', category: 'Users' },
    { key: 'users.delete', label: 'Delete User Accounts', category: 'Users' },

    // Backup & Settings
    { key: 'backup.create',  label: 'Create Database Backup', category: 'Backup' },
    { key: 'backup.restore', label: 'Restore Database Backup', category: 'Backup' },
    { key: 'backup.delete',  label: 'Delete Backup Archives', category: 'Backup' },
    { key: 'settings.edit',  label: 'Modify Clinic Settings & Schedules', category: 'Settings' },

    // Dept HR & Profile
    { key: 'dept_hr.dispatch', label: 'Dispatch Renewals for Department Staff', category: 'Dept HR' },
    { key: 'profile.edit',     label: 'Edit Personal Profile & Password', category: 'Account' },
  ];

  // --------------- Module Schema for CRUD Grid ---------------
  const MODULE_SCHEMA = [
    {
      key: 'dashboard',
      label: 'Dashboard',
      category: 'Clinical Overview',
      viewPerm: 'nav.dashboard',
      createPerm: null,
      editPerm: null,
      deletePerm: null,
      specialPerms: [],
    },
    {
      key: 'patients',
      label: 'Patients',
      category: 'Clinical Overview',
      viewPerm: 'nav.patients',
      createPerm: 'patients.create',
      editPerm: 'patients.edit',
      deletePerm: 'patients.delete',
      specialPerms: [
        { key: 'patients.view_history', label: 'Clinical History' },
      ],
    },
    {
      key: 'visits',
      label: 'Clinical Visits',
      category: 'Clinical Overview',
      viewPerm: 'nav.visits',
      createPerm: 'visits.create',
      editPerm: 'visits.edit',
      deletePerm: 'visits.delete',
      specialPerms: [
        { key: 'vitals.create', label: 'Record Vitals' },
      ],
    },
    {
      key: 'admissions',
      label: 'Inpatient Admissions',
      category: 'Clinical Overview',
      viewPerm: 'nav.admissions',
      createPerm: 'admissions.create',
      editPerm: 'admissions.edit',
      deletePerm: null,
      specialPerms: [
        { key: 'admissions.discharge', label: 'Discharge Patient' },
      ],
    },
    {
      key: 'checkups',
      label: 'Periodic Check-ups (6-Mo)',
      category: 'Clinical Overview',
      viewPerm: 'nav.checkups',
      createPerm: 'checkups.dispatch',
      editPerm: 'checkups.edit_date',
      deletePerm: null,
      specialPerms: [
        { key: 'checkups.approve', label: 'Approve Renewal' },
      ],
    },
    {
      key: 'registrations',
      label: 'Employee Registrations',
      category: 'Workforce',
      viewPerm: 'nav.registrations',
      createPerm: 'registrations.create',
      editPerm: 'registrations.edit',
      deletePerm: 'registrations.delete',
      specialPerms: [
        { key: 'registrations.accept', label: 'Accept as Staff' },
      ],
    },
    {
      key: 'certifications',
      label: 'Medical Certifications',
      category: 'Workforce',
      viewPerm: 'nav.certifications',
      createPerm: 'certs.create',
      editPerm: 'certs.edit',
      deletePerm: 'certs.delete',
      specialPerms: [],
    },
    {
      key: 'dept_hr',
      label: 'Dept HR Portal',
      category: 'Workforce',
      viewPerm: 'nav.dept_hr',
      createPerm: 'dept_hr.dispatch',
      editPerm: null,
      deletePerm: null,
      specialPerms: [],
    },
    {
      key: 'laboratory',
      label: 'Laboratory',
      category: 'Clinical Services',
      viewPerm: 'nav.laboratory',
      createPerm: 'lab.create_order',
      editPerm: 'lab.record_result',
      deletePerm: 'lab.delete',
      specialPerms: [],
    },
    {
      key: 'pharmacy',
      label: 'Pharmacy & Stock',
      category: 'Clinical Services',
      viewPerm: 'nav.pharmacy',
      createPerm: 'pharmacy.manage_stock',
      editPerm: 'pharmacy.dispense',
      deletePerm: 'pharmacy.delete',
      specialPerms: [],
    },
    {
      key: 'referrals',
      label: 'Referrals & Sick Leaves',
      category: 'Clinical Services',
      viewPerm: 'nav.referrals',
      createPerm: 'referrals.create',
      editPerm: 'referrals.edit',
      deletePerm: 'referrals.delete',
      specialPerms: [
        { key: 'sick_leaves.create', label: 'Issue Sick Leave' },
      ],
    },
    {
      key: 'reports',
      label: 'Reports & Analytics',
      category: 'Administration',
      viewPerm: 'nav.reports',
      createPerm: null,
      editPerm: null,
      deletePerm: null,
      specialPerms: [
        { key: 'reports.export', label: 'Export Reports' },
      ],
    },
    {
      key: 'departments',
      label: 'Departments & Positions',
      category: 'Administration',
      viewPerm: 'nav.departments',
      createPerm: 'departments.manage',
      editPerm: 'departments.manage',
      deletePerm: 'departments.manage',
      specialPerms: [],
    },
    {
      key: 'audit_logs',
      label: 'Activity Logs',
      category: 'Administration',
      viewPerm: 'nav.audit_logs',
      createPerm: null,
      editPerm: null,
      deletePerm: null,
      specialPerms: [
        { key: 'audit_logs.export', label: 'Export Audit Logs' },
      ],
    },
    {
      key: 'archive',
      label: 'Archive Records',
      category: 'Administration',
      viewPerm: 'nav.archive',
      createPerm: null,
      editPerm: null,
      deletePerm: null,
      specialPerms: [
        { key: 'archive.restore', label: 'Restore from Archive' },
      ],
    },
    {
      key: 'users',
      label: 'Users & Roles',
      category: 'Administration',
      viewPerm: 'nav.users',
      createPerm: 'users.create',
      editPerm: 'users.edit',
      deletePerm: 'users.delete',
      specialPerms: [],
    },
    {
      key: 'backup',
      label: 'System Backup',
      category: 'Administration',
      viewPerm: 'nav.backup',
      createPerm: 'backup.create',
      editPerm: null,
      deletePerm: 'backup.delete',
      specialPerms: [
        { key: 'backup.restore', label: 'Restore Backup' },
      ],
    },
    {
      key: 'settings',
      label: 'System Settings',
      category: 'Administration',
      viewPerm: 'nav.settings',
      createPerm: null,
      editPerm: 'settings.edit',
      deletePerm: null,
      specialPerms: [],
    },
    {
      key: 'profile',
      label: 'User Profile',
      category: 'Account',
      viewPerm: 'nav.profile',
      createPerm: null,
      editPerm: 'profile.edit',
      deletePerm: null,
      specialPerms: [],
    },
  ];

  // --------------- Role Display Name & Key Mapping ---------------
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

  const NAV_KEY_TO_PERM = {
    'dashboard': 'nav.dashboard',
    'patients': 'nav.patients',
    'visits': 'nav.visits',
    'admissions': 'nav.admissions',
    'checkups': 'nav.checkups',
    'employee-registrations': 'nav.registrations',
    'certifications': 'nav.certifications',
    'laboratory': 'nav.laboratory',
    'pharmacy': 'nav.pharmacy',
    'referrals': 'nav.referrals',
    'reports': 'nav.reports',
    'departments': 'nav.departments',
    'users': 'nav.users',
    'dept-hr': 'nav.dept_hr',
    'profile': 'nav.profile',
    'audit-logs': 'nav.audit_logs',
    'archive': 'nav.archive',
    'backup': 'nav.backup',
    'settings': 'nav.settings',
  };

  // --------------- Fallback Role Defaults ---------------
  const BASELINE_ROLE_DEFAULTS = {
    system_administrator: PERMISSION_DEFS.map(p => p.key),

    physician: [
      'nav.dashboard', 'nav.patients', 'patients.create', 'patients.edit', 'patients.view_history',
      'nav.visits', 'visits.create', 'visits.edit', 'visits.delete', 'vitals.create',
      'nav.admissions', 'admissions.create', 'admissions.edit', 'admissions.discharge',
      'nav.checkups', 'checkups.dispatch', 'checkups.edit_date',
      'nav.registrations',
      'nav.certifications', 'certs.create', 'certs.edit',
      'nav.laboratory', 'lab.create_order',
      'nav.pharmacy',
      'nav.referrals', 'referrals.create', 'referrals.edit', 'sick_leaves.create',
      'nav.profile', 'profile.edit',
    ],

    receptionist: [
      'nav.dashboard', 'nav.patients', 'patients.create', 'patients.edit',
      'nav.visits', 'visits.create', 'visits.delete',
      'nav.checkups', 'checkups.dispatch',
      'nav.registrations', 'registrations.create', 'registrations.edit',
      'nav.profile', 'profile.edit',
    ],

    hr_admin: [
      'nav.dashboard', 'nav.patients', 'patients.create', 'patients.edit', 'patients.view_history',
      'nav.visits', 'visits.create', 'visits.edit', 'visits.delete', 'vitals.create',
      'nav.admissions', 'admissions.create', 'admissions.edit', 'admissions.discharge',
      'nav.checkups', 'checkups.dispatch', 'checkups.approve', 'checkups.edit_date',
      'nav.registrations', 'registrations.create', 'registrations.edit', 'registrations.delete', 'registrations.accept',
      'nav.certifications', 'certs.create', 'certs.edit',
      'nav.laboratory', 'lab.create_order', 'lab.record_result',
      'nav.pharmacy', 'pharmacy.dispense', 'pharmacy.manage_stock',
      'nav.referrals', 'referrals.create', 'referrals.edit', 'sick_leaves.create',
      'nav.reports', 'reports.export',
      'nav.audit_logs', 'audit_logs.export',
      'nav.users', 'users.create', 'users.edit',
      'nav.profile', 'profile.edit',
    ],

    department_hr: [
      'nav.dept_hr', 'dept_hr.dispatch',
      'nav.checkups', 'checkups.dispatch', 'checkups.approve',
      'nav.reports', 'reports.export',
      'nav.profile', 'profile.edit',
    ],

    hr_reporting: [
      'nav.reports', 'reports.export',
      'nav.profile', 'profile.edit',
    ],

    lab_technician: [
      'nav.dashboard', 'nav.patients',
      'nav.laboratory', 'lab.record_result',
      'nav.profile', 'profile.edit',
    ],

    pharmacist: [
      'nav.dashboard', 'nav.patients',
      'nav.pharmacy', 'pharmacy.dispense', 'pharmacy.manage_stock',
      'nav.profile', 'profile.edit',
    ],
  };

  let _cachedPerms = null;

  function _getSession() {
    try { return Auth.getSession(); } catch (e) { return null; }
  }

  /**
   * Compute merged default permissions for a set of role identifiers.
   * Can use live dynamic role objects fetched from API if provided.
   */
  function defaultsForRoles(roleIdentifiers, dynamicRolesList = null) {
    const defaults = new Set();
    const roleMap = {};

    if (Array.isArray(dynamicRolesList) && dynamicRolesList.length > 0) {
      for (const r of dynamicRolesList) {
        const key = r.name || ROLE_KEYS[r.display_name];
        const perms = Array.isArray(r.default_permissions)
          ? r.default_permissions
          : (typeof r.default_permissions === 'string' ? JSON.parse(r.default_permissions || '[]') : []);
        roleMap[r.id] = perms;
        if (key) roleMap[key] = perms;
      }
    }

    for (const r of roleIdentifiers) {
      const perms = roleMap[r] || BASELINE_ROLE_DEFAULTS[r] || BASELINE_ROLE_DEFAULTS[ROLE_KEYS[r]] || [];
      for (const p of perms) defaults.add(p);
    }
    return defaults;
  }

  /**
   * Compute effective permissions for the current user session.
   */
  function _computeEffective() {
    const session = _getSession();
    if (!session) return new Set();

    const userRoles = (session.user.roles || []).map(r => ROLE_KEYS[r] || r).filter(Boolean);
    const customPerms = session.user.custom_permissions || {};

    // System administrator gets all permissions unless explicitly revoked
    if (userRoles.includes('system_administrator')) {
      const effective = new Set(PERMISSION_DEFS.map(p => p.key));
      for (const [key, granted] of Object.entries(customPerms)) {
        if (granted === false) effective.delete(key);
      }
      return effective;
    }

    // Start with union of all role defaults
    const effective = defaultsForRoles(userRoles);

    // Apply explicit user overrides
    for (const [key, granted] of Object.entries(customPerms)) {
      if (granted === true) {
        effective.add(key);
      } else if (granted === false) {
        effective.delete(key);
      }
    }

    return effective;
  }

  function has(key) {
    if (!_cachedPerms) _cachedPerms = _computeEffective();
    return _cachedPerms.has(key);
  }

  function allowedNavKeys() {
    const session = _getSession();
    if (!session) return null;

    const userRoles = (session.user.roles || []).map(r => ROLE_KEYS[r]).filter(Boolean);
    if (userRoles.includes('system_administrator')) return null;

    const allowed = [];
    for (const [navKey, permKey] of Object.entries(NAV_KEY_TO_PERM)) {
      if (has(permKey)) allowed.push(navKey);
    }
    return allowed.length ? allowed : null;
  }

  function blockIfNotAllowed(pageKey) {
    const allowed = allowedNavKeys();
    if (allowed && !allowed.includes(pageKey)) {
      const target = allowed.includes('dept-hr') ? 'dept-hr.html'
        : (allowed.includes('dashboard') ? 'dashboard.html'
        : `${allowed[0]}.html`);
      window.location.replace(target);
      return true;
    }
    return false;
  }

  function invalidateCache() {
    _cachedPerms = null;
  }

  /**
   * ===========================================================
   * Render Interactive CRUD Matrix Table
   * ===========================================================
   * @param {string} containerId - DOM ID where matrix table is injected
   * @param {Object} opts - Options { selectedRoleIds, customOverrides, dynamicRoles, isRoleEditMode }
   */
  function renderMatrixGrid(containerId, opts = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const {
      selectedRoleIds = [],
      customOverrides = {},
      dynamicRoles = [],
      isRoleEditMode = false,
      initialPermissions = null, // for role editing mode
    } = opts;

    // Calculate baseline role defaults from selected roles
    const baselineDefaults = isRoleEditMode
      ? new Set(initialPermissions || [])
      : defaultsForRoles(selectedRoleIds, dynamicRoles);

    let html = `
      <div style="overflow-x:auto; border:1px solid var(--color-border); border-radius:var(--radius-md); background:var(--color-surface);">
        <table class="data-table" style="margin:0; width:100%; border-collapse:collapse; font-size:12.5px;">
          <thead>
            <tr style="background:var(--color-bg-secondary, #F4F6F6); border-bottom:2px solid var(--color-border);">
              <th style="padding:10px 12px; width:220px; text-align:left;">Module / View</th>
              <th style="padding:10px 8px; text-align:center; width:90px;">View (Nav)</th>
              <th style="padding:10px 8px; text-align:center; width:80px;">Create</th>
              <th style="padding:10px 8px; text-align:center; width:90px;">Edit / Update</th>
              <th style="padding:10px 8px; text-align:center; width:80px;">Delete</th>
              <th style="padding:10px 12px; text-align:left;">Special / Other Actions</th>
            </tr>
          </thead>
          <tbody>
    `;

    MODULE_SCHEMA.forEach((mod, idx) => {
      // Gather all valid permission keys in this row for row-toggle
      const rowPermKeys = [];
      if (mod.viewPerm) rowPermKeys.push(mod.viewPerm);
      if (mod.createPerm) rowPermKeys.push(mod.createPerm);
      if (mod.editPerm && mod.editPerm !== mod.createPerm) rowPermKeys.push(mod.editPerm);
      if (mod.deletePerm && mod.deletePerm !== mod.createPerm) rowPermKeys.push(mod.deletePerm);
      (mod.specialPerms || []).forEach(sp => rowPermKeys.push(sp.key));

      // Helper to render a checkbox cell
      function renderCell(permKey, label = '') {
        if (!permKey) {
          return `<td style="padding:8px; text-align:center; color:var(--color-text-muted); opacity:0.3;">—</td>`;
        }

        const isDefault = baselineDefaults.has(permKey);
        let isChecked = isDefault;
        if (!isRoleEditMode && customOverrides[permKey] === true) isChecked = true;
        if (!isRoleEditMode && customOverrides[permKey] === false) isChecked = false;
        if (isRoleEditMode && initialPermissions) isChecked = baselineDefaults.has(permKey);

        let cellStyle = 'padding:6px 8px; text-align:center; vertical-align:middle;';
        let highlightStyle = '';

        if (!isRoleEditMode) {
          if (customOverrides[permKey] === true && !isDefault) {
            highlightStyle = 'background:rgba(18, 129, 122, 0.1); border-radius:4px; font-weight:700; color:var(--color-primary);';
          } else if (customOverrides[permKey] === false && isDefault) {
            highlightStyle = 'background:rgba(192, 72, 60, 0.12); border-radius:4px; color:var(--color-danger);';
          }
        }

        return `
          <td style="${cellStyle}">
            <label style="display:inline-flex; align-items:center; justify-content:center; gap:4px; cursor:pointer; margin:0; padding:2px 4px; ${highlightStyle}" title="${UI.escapeHtml(label || permKey)}">
              <input type="checkbox" class="matrix-perm-cb" data-key="${permKey}" data-mod="${mod.key}" data-default="${isDefault}" ${isChecked ? 'checked' : ''} onchange="Permissions.handleMatrixCheckboxChange('${containerId}')" />
              ${label ? `<span style="font-size:11.5px; font-weight:500;">${UI.escapeHtml(label)}</span>` : ''}
            </label>
          </td>
        `;
      }

      // Render Special Actions
      let specialHtml = '<span style="color:var(--color-text-muted); opacity:0.3;">—</span>';
      if (mod.specialPerms && mod.specialPerms.length > 0) {
        specialHtml = `
          <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
            ${mod.specialPerms.map(sp => {
              const isDefault = baselineDefaults.has(sp.key);
              let isChecked = isDefault;
              if (!isRoleEditMode && customOverrides[sp.key] === true) isChecked = true;
              if (!isRoleEditMode && customOverrides[sp.key] === false) isChecked = false;

              let highlight = '';
              if (!isRoleEditMode) {
                if (customOverrides[sp.key] === true && !isDefault) {
                  highlight = 'background:rgba(18, 129, 122, 0.12); color:var(--color-primary); font-weight:700; border-color:var(--color-primary);';
                } else if (customOverrides[sp.key] === false && isDefault) {
                  highlight = 'background:rgba(192, 72, 60, 0.12); color:var(--color-danger); text-decoration:line-through;';
                }
              }

              return `
                <label style="display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border:1px solid var(--color-border); border-radius:4px; background:var(--color-bg-secondary); cursor:pointer; font-size:11.5px; ${highlight}">
                  <input type="checkbox" class="matrix-perm-cb" data-key="${sp.key}" data-mod="${mod.key}" data-default="${isDefault}" ${isChecked ? 'checked' : ''} onchange="Permissions.handleMatrixCheckboxChange('${containerId}')" />
                  <span>${UI.escapeHtml(sp.label)}</span>
                </label>
              `;
            }).join('')}
          </div>
        `;
      }

      html += `
        <tr style="border-bottom:1px solid var(--color-border); ${idx % 2 === 1 ? 'background:rgba(0,0,0,0.015);' : ''}">
          <!-- Module Column with Row-Toggle Checkbox -->
          <td style="padding:10px 12px; font-weight:600; color:var(--color-text);">
            <div style="display:flex; align-items:center; gap:8px;">
              <button type="button" class="btn btn-ghost btn-sm" onclick="Permissions.toggleRowPermissions('${containerId}', '${mod.key}')" title="Toggle all actions for ${UI.escapeHtml(mod.label)}" style="padding:2px 5px; font-size:11px; color:var(--color-text-muted); border:1px solid var(--color-border);">
                Toggle All
              </button>
              <div>
                <div>${UI.escapeHtml(mod.label)}</div>
                <div style="font-size:10.5px; color:var(--color-text-muted); font-weight:normal;">${UI.escapeHtml(mod.category)}</div>
              </div>
            </div>
          </td>
          ${renderCell(mod.viewPerm)}
          ${renderCell(mod.createPerm)}
          ${renderCell(mod.editPerm)}
          ${renderCell(mod.deletePerm)}
          <td style="padding:8px 12px; vertical-align:middle;">${specialHtml}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; font-size:11.5px; color:var(--color-text-muted);">
        <div style="display:flex; gap:16px;">
          <span style="display:inline-flex; align-items:center; gap:4px;">
            <span style="width:10px; height:10px; border-radius:2px; background:var(--color-primary);"></span> Role Default
          </span>
          <span style="display:inline-flex; align-items:center; gap:4px;">
            <span style="width:10px; height:10px; border-radius:2px; background:rgba(18, 129, 122, 0.25); border:1px solid var(--color-primary);"></span> Explicitly Added
          </span>
          <span style="display:inline-flex; align-items:center; gap:4px;">
            <span style="width:10px; height:10px; border-radius:2px; background:rgba(192, 72, 60, 0.25); border:1px solid var(--color-danger);"></span> Explicitly Revoked
          </span>
        </div>
        <div>
          <button type="button" class="btn btn-ghost btn-sm" style="font-size:11.5px; padding:2px 8px;" onclick="Permissions.resetMatrixToRoleDefaults('${containerId}')">
            Reset to Role Defaults
          </button>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  /**
   * Toggle all checkboxes in a specific row.
   */
  function toggleRowPermissions(containerId, modKey) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const cbs = Array.from(container.querySelectorAll(`input.matrix-perm-cb[data-mod="${modKey}"]`));
    const allChecked = cbs.every(cb => cb.checked);
    cbs.forEach(cb => { cb.checked = !allChecked; });
    handleMatrixCheckboxChange(containerId);
  }

  /**
   * Reset all matrix checkboxes back to the role defaults.
   */
  function resetMatrixToRoleDefaults(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const cbs = container.querySelectorAll('input.matrix-perm-cb');
    cbs.forEach(cb => {
      cb.checked = cb.getAttribute('data-default') === 'true';
    });
    handleMatrixCheckboxChange(containerId);
  }

  /**
   * Handle checkbox changes to update visual override styling.
   */
  function handleMatrixCheckboxChange(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const cbs = container.querySelectorAll('input.matrix-perm-cb');
    cbs.forEach(cb => {
      const isDefault = cb.getAttribute('data-default') === 'true';
      const isChecked = cb.checked;
      const label = cb.closest('label');
      if (!label) return;

      label.style.background = '';
      label.style.color = '';
      label.style.fontWeight = '';
      label.style.textDecoration = '';
      label.style.borderColor = '';

      if (isChecked && !isDefault) {
        // Explicitly added override
        label.style.background = 'rgba(18, 129, 122, 0.15)';
        label.style.color = 'var(--color-primary)';
        label.style.fontWeight = '700';
        label.style.borderColor = 'var(--color-primary)';
      } else if (!isChecked && isDefault) {
        // Explicitly revoked override
        label.style.background = 'rgba(192, 72, 60, 0.15)';
        label.style.color = 'var(--color-danger)';
        label.style.textDecoration = 'line-through';
        label.style.borderColor = 'var(--color-danger)';
      }
    });
  }

  /**
   * Extract custom permissions override payload from matrix table.
   * Compares currently checked values with role defaults.
   * Returns: { [permKey]: true / false }
   */
  function extractCustomOverrides(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return {};

    const overrides = {};
    const cbs = container.querySelectorAll('input.matrix-perm-cb');
    cbs.forEach(cb => {
      const key = cb.getAttribute('data-key');
      const isDefault = cb.getAttribute('data-default') === 'true';
      const isChecked = cb.checked;

      if (isChecked && !isDefault) {
        overrides[key] = true;
      } else if (!isChecked && isDefault) {
        overrides[key] = false;
      }
    });

    return overrides;
  }

  /**
   * Extract full array of checked permissions (for role editing).
   */
  function extractAllCheckedPermissions(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];

    const checked = [];
    const cbs = container.querySelectorAll('input.matrix-perm-cb:checked');
    cbs.forEach(cb => {
      const key = cb.getAttribute('data-key');
      if (key && !checked.includes(key)) checked.push(key);
    });
    return checked;
  }

  return {
    PERMISSION_DEFS,
    MODULE_SCHEMA,
    ROLE_KEYS,
    NAV_KEY_TO_PERM,
    BASELINE_ROLE_DEFAULTS,
    has,
    allowedNavKeys,
    blockIfNotAllowed,
    defaultsForRoles,
    invalidateCache,
    renderMatrixGrid,
    toggleRowPermissions,
    resetMatrixToRoleDefaults,
    handleMatrixCheckboxChange,
    extractCustomOverrides,
    extractAllCheckedPermissions,
  };
})();
