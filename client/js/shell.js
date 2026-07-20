/* ===========================================================
   App shell — sidebar + topbar, shared across all app pages
   =========================================================== */

const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: 'dashboard.html', active: true },
    ],
  },
  {
    label: 'Patient Care',
    items: [
      { key: 'patients', label: 'Patients', icon: 'patients', href: 'patients.html', active: true },
      { key: 'visits', label: 'Visits', icon: 'visits', href: 'visits.html', active: true },
      { key: 'admissions', label: 'Admissions', icon: 'admissions', href: 'coming-soon.html?module=admissions', active: false },
    ],
  },
  {
    label: 'Pre-Employment',
    items: [
      { key: 'employee-registrations', label: 'Employee Registrations', icon: 'employees', href: 'registrations.html', active: true },
      { key: 'certifications', label: 'Certifications', icon: 'filecheck', href: 'certifications.html', active: true },
    ],
  },
  {
    label: 'Clinical Support',
    items: [
      { key: 'laboratory', label: 'Laboratory', icon: 'flask', href: 'coming-soon.html?module=laboratory', active: false },
      { key: 'pharmacy', label: 'Pharmacy', icon: 'pill', href: 'coming-soon.html?module=pharmacy', active: false },
      { key: 'referrals', label: 'Referrals & Certificates', icon: 'referrals', href: 'coming-soon.html?module=referrals', active: false },
    ],
  },
  {
    label: 'Administration',
    items: [
      { key: 'reports', label: 'Reports', icon: 'reports', href: 'coming-soon.html?module=reports', active: false },
      { key: 'users', label: 'Users & Roles', icon: 'users', href: 'coming-soon.html?module=users', active: false },
      { key: 'backup', label: 'Backup', icon: 'backup', href: 'coming-soon.html?module=backup', active: false },
      { key: 'settings', label: 'Settings', icon: 'settings', href: 'coming-soon.html?module=settings', active: false },
    ],
  },
];

function renderNavItem(item, activeKey) {
  const isActive = item.key === activeKey;
  const classes = ['nav-item'];
  if (isActive) classes.push('active');
  if (!item.active) classes.push('disabled');
  const badge = !item.active ? '<span class="nav-badge">Soon</span>' : '';
  return `<a class="${classes.join(' ')}" href="${item.href}">${Icons.render(item.icon)}<span>${item.label}</span>${badge}</a>`;
}

function renderShell(activeKey) {
  const session = Auth.getSession();
  const sidebarHtml = `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-brand">
        <img src="assets/logo-mark.svg" alt="TPPF Clinic logo" />
        <div>
          <div class="org-name">TPPF CLINIC</div>
          <div class="org-tagline">Occupational &amp; Community Health</div>
        </div>
      </div>
      <div class="sidebar-appname">
        <div class="app-icon">${Icons.render('stethoscope')}</div>
        <div>
          <div class="app-title">Clinic Management</div>
          <div class="app-role">${session ? (session.user.roles[0] || 'Staff') : ''}</div>
        </div>
      </div>
      <nav class="sidebar-nav">
        ${NAV_SECTIONS.map(section => `
          <div class="nav-section-label">${section.label}</div>
          ${section.items.map(item => renderNavItem(item, activeKey)).join('')}
        `).join('')}
      </nav>
    </aside>
  `;

  const topbarHtml = `
    <header class="topbar">
      <div style="display:flex; align-items:center; gap:12px;">
        <button class="icon-btn" id="mobile-nav-toggle" style="display:none;">${Icons.render('menu')}</button>
        <div>
          <div class="crumb">TPPF Clinic</div>
          <h1 id="page-title"></h1>
        </div>
      </div>
      <div class="topbar-right">
        <div class="topbar-user">
          <div class="avatar">${session ? Auth.initials(session.user.full_name) : '?'}</div>
          <div class="topbar-user-info">
            <div class="name">${session ? session.user.full_name : ''}</div>
            <div class="role">${session ? (session.user.roles.join(', ')) : ''}</div>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" id="logout-btn">${Icons.render('logout')} Logout</button>
      </div>
    </header>
  `;

  const shellRoot = document.getElementById('shell-root');
  shellRoot.insertAdjacentHTML('afterbegin', sidebarHtml);
  document.getElementById('main-root').insertAdjacentHTML('afterbegin', topbarHtml);
  shellRoot.insertAdjacentHTML('beforeend', '<div class="sidebar-overlay" id="sidebar-overlay"></div>');

  document.getElementById('logout-btn').addEventListener('click', () => Auth.logout());

  const toggle = document.getElementById('mobile-nav-toggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  function openMobileNav() {
    sidebar.classList.add('open');
    overlay.classList.add('visible');
  }
  function closeMobileNav() {
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
  }
  function syncToggleVisibility() {
    const isMobile = window.innerWidth <= 860;
    toggle.style.display = isMobile ? 'inline-flex' : 'none';
    if (!isMobile) closeMobileNav();
  }

  toggle.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeMobileNav() : openMobileNav();
  });
  overlay.addEventListener('click', closeMobileNav);
  sidebar.addEventListener('click', (e) => {
    if (e.target.closest('.nav-item')) closeMobileNav();
  });
  window.addEventListener('resize', syncToggleVisibility);
  syncToggleVisibility();
}

function setPageTitle(title) {
  const el = document.getElementById('page-title');
  if (el) el.textContent = title;
  document.title = `${title} · TPPF Clinic`;
}
