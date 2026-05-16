/* AIRMS shared client logic — RBAC, theme, sidebar, topbar, profile dropdown */
(function () {
  const LS_ROLE = 'airms.role';
  const LS_THEME = 'airms.theme';
  const LS_NAME = 'airms.name';

  const ROLES = {
    athlete: { label: 'Athlete', name: 'John Doe' },
    medical: { label: 'Medical Staff', name: 'Dr. Aisyah Rahman' },
    admin:   { label: 'Administrator', name: 'En. Mohd Faizal' }
  };

  // Sidebar nav (no group labels — they implicitly hint RBAC)
  const NAV = {
    athlete: [
      { href: 'dashboard.html',     label: 'My Dashboard',     icon: 'home' },
      { href: 'activity.html',      label: 'Activity Tracking', icon: 'activity' },
      { href: 'injury-report.html', label: 'Injury Reporting',  icon: 'alert' }
    ],
    medical: [
      { href: 'dashboard.html',       label: 'Athlete Dashboard',  icon: 'home' },
      { href: 'injury-log.html',      label: 'Injury Logging',     icon: 'clipboard' },
      { href: 'review-reports.html',  label: 'Self-Report Review', icon: 'check' },
      { href: 'data-upload.html',     label: 'Data Uploading',     icon: 'upload' }
    ],
    admin: [
      { href: 'dashboard.html',     label: 'Injury Analytics', icon: 'home' },
      { href: 'reports.html',       label: 'PDF Reports',      icon: 'file' },
      { href: 'data-upload.html',   label: 'Data Uploading',   icon: 'upload' }
    ]
  };

  // Profile-page link per role (used by dropdown)
  const PROFILE_HREF = {
    athlete: 'profile.html',
    medical: 'profile.html',
    admin:   'profile.html'
  };

  const ICONS = {
    home: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    activity: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    alert: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    user: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    key: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
    logout: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    clipboard: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h6a2 2 0 0 1 2 2v2H7V4a2 2 0 0 1 2-2z"/><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/></svg>',
    check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    upload: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    file: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    sun: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    moon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    caret: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
  };

  // ===== Theme =====
  function getTheme() { return localStorage.getItem(LS_THEME) || 'light'; }
  function setTheme(t) {
    localStorage.setItem(LS_THEME, t);
    document.documentElement.setAttribute('data-theme', t);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.innerHTML = t === 'dark' ? ICONS.sun : ICONS.moon;
  }

  // ===== Role =====
  function getRole() { return localStorage.getItem(LS_ROLE) || 'athlete'; }
  function setRole(r) { localStorage.setItem(LS_ROLE, r); }
  function getName() { return localStorage.getItem(LS_NAME) || ROLES[getRole()].name; }

  // ===== Page guard =====
  function enforceAccess() {
    const body = document.body;
    const allowed = (body.dataset.allowedRoles || '').split(/\s+/).filter(Boolean);
    if (allowed.length === 0) return;
    const role = getRole();
    if (!allowed.includes(role)) {
      const target = role === 'admin' ? '../admin/dashboard.html'
                   : role === 'medical' ? '../medical/dashboard.html'
                   : '../athlete/dashboard.html';
      window.location.replace(target);
    }
  }

  // ===== Sidebar render =====
  function renderSidebar() {
    const root = document.getElementById('sidebar');
    if (!root) return;
    const role = getRole();
    const links = NAV[role] || [];
    const currentPath = window.location.pathname.split('/').pop();

    let html = `
      <div class="sidebar__brand">
        <div class="sidebar__brand-mark">
          <img src="../assets/img/logo1.png" alt="ISN"/>
        </div>
        <div class="sidebar__brand-text">
          <span class="sidebar__brand-name">AIRMS</span>
          <span class="sidebar__brand-sub">Sports Health</span>
        </div>
      </div>
      <nav class="sidebar__nav">
    `;
    links.forEach(l => {
      const active = l.href === currentPath ? 'sidebar__link--active' : '';
      html += `<a href="${l.href}" class="sidebar__link ${active}">${ICONS[l.icon] || ''}<span>${l.label}</span></a>`;
    });
    html += `
      </nav>
      <div class="sidebar__footer">
        AIRMS Prototype v0.2
      </div>
    `;
    root.innerHTML = html;
  }

  // ===== Topbar render =====
  function renderTopbar(title) {
    const root = document.getElementById('topbar');
    if (!root) return;
    const role = getRole();
    const u = ROLES[role];
    const initials = u.name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
    root.innerHTML = `
      <div>
        <div class="topbar__title">${title || ''}</div>
      </div>
      <div class="topbar__actions">
        <div class="topbar__signedin">
          Signed in as
          <strong>${u.label}</strong>
        </div>
        <button id="theme-toggle" class="theme-toggle" aria-label="Toggle theme">
          ${getTheme() === 'dark' ? ICONS.sun : ICONS.moon}
        </button>
        <div class="user-menu">
          <button class="user-chip" id="user-chip-btn" aria-haspopup="true" aria-expanded="false">
            <span class="user-chip__avatar">${initials}</span>
            <span class="user-chip__name">${u.name}</span>
            <span class="user-chip__caret">${ICONS.caret}</span>
          </button>
          <div class="user-dropdown" id="user-dropdown">
            <div class="user-dropdown__head">
              <div class="user-dropdown__head-name">${u.name}</div>
              <div class="user-dropdown__head-role">${u.label}</div>
            </div>
            <a href="${PROFILE_HREF[role]}">${ICONS.user}<span>My Profile</span></a>
            <div class="user-dropdown__sep"></div>
            <button class="user-dropdown__danger" id="signout-btn">${ICONS.logout}<span>Sign out</span></button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('theme-toggle').addEventListener('click', () => {
      setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    });

    const chip = document.getElementById('user-chip-btn');
    const dd = document.getElementById('user-dropdown');
    chip.addEventListener('click', e => {
      e.stopPropagation();
      const open = dd.classList.toggle('open');
      chip.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', e => {
      if (!dd.contains(e.target) && !chip.contains(e.target)) {
        dd.classList.remove('open');
        chip.setAttribute('aria-expanded', 'false');
      }
    });

    document.getElementById('signout-btn').addEventListener('click', () => {
      localStorage.removeItem(LS_ROLE);
      localStorage.removeItem(LS_NAME);
      window.location.href = '../index.html';
    });
  }

  // ===== Init =====
  document.addEventListener('DOMContentLoaded', () => {
    setTheme(getTheme());
    if (document.body.dataset.layout === 'app') {
      enforceAccess();
      renderSidebar();
      const t = document.body.dataset.title || '';
      renderTopbar(t);
    }
  });

  window.AIRMS = { getRole, setRole, getName, getTheme, setTheme, ROLES, ICONS };
})();
