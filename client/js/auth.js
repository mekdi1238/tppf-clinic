/* ===========================================================
   Auth — session management (sessionStorage; swap to your real
   token/cookie strategy once the backend exists)
   =========================================================== */

const SESSION_KEY = 'tppf_session';
const LAST_ACTIVITY_KEY = 'tppf_last_activity';
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes inactivity timeout

let lastTouchTime = 0;

const Auth = {
  touchActivity() {
    const now = Date.now();
    // Throttle activity timestamps to avoid spamming storage (at most once every 3s)
    if (now - lastTouchTime > 3000) {
      lastTouchTime = now;
      sessionStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    }
  },
  getLastActivity() {
    const raw = sessionStorage.getItem(LAST_ACTIVITY_KEY);
    return raw ? parseInt(raw, 10) : 0;
  },
  isSessionExpired() {
    const rawSession = sessionStorage.getItem(SESSION_KEY);
    if (!rawSession) return false;
    const lastActivity = this.getLastActivity();
    if (lastActivity > 0 && (Date.now() - lastActivity > SESSION_TIMEOUT_MS)) {
      return true;
    }
    return false;
  },
  getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      if (this.isSessionExpired()) {
        this.clearSession();
        return null;
      }
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },
  setSession(session) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    this.touchActivity();
  },
  updateUser(userData) {
    const session = this.getSession();
    if (session) {
      session.user = { ...session.user, ...userData };
      this.setSession(session);
    }
  },
  clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(LAST_ACTIVITY_KEY);
  },
  isLoggedIn() {
    return !!this.getSession();
  },
  handleSessionExpired(reason = 'timeout') {
    this.clearSession();
    if (!window.location.pathname.toLowerCase().includes('login.html')) {
      document.documentElement.style.display = 'none';
      window.location.replace(`login.html?reason=${encodeURIComponent(reason)}`);
    }
  },
  requireAuth() {
    const isLogin = window.location.pathname.toLowerCase().includes('login.html');
    if (isLogin) return;

    const hasRawSession = !!sessionStorage.getItem(SESSION_KEY);
    if (hasRawSession && this.isSessionExpired()) {
      this.handleSessionExpired('timeout');
      throw new Error('session expired');
    }
    if (!this.isLoggedIn()) {
      document.documentElement.style.display = 'none';
      window.location.replace('login.html');
      throw new Error('redirecting to login');
    }
    this.touchActivity();
  },
  logout() {
    this.clearSession();
    window.location.replace('login.html');
  },
  initials(name) {
    if (!name) return '?';
    return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  },
};

// Activity listeners to keep session alive during user interaction
['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(eventType => {
  window.addEventListener(eventType, () => {
    if (Auth.isLoggedIn()) {
      Auth.touchActivity();
    }
  }, { passive: true });
});

// Periodic background check for idle session timeout
setInterval(() => {
  if (window.location.pathname.toLowerCase().includes('login.html')) return;
  const hasRawSession = !!sessionStorage.getItem(SESSION_KEY);
  if (hasRawSession && Auth.isSessionExpired()) {
    Auth.handleSessionExpired('timeout');
  }
}, 10000);

// Enforce session validity immediately and on Back/Forward cache navigation (pageshow)
function checkAuthOnPageShow() {
  if (window.location.pathname.toLowerCase().includes('login.html')) return;
  if (!Auth.isLoggedIn()) {
    document.documentElement.style.display = 'none';
    window.location.replace('login.html');
  }
}

window.addEventListener('pageshow', checkAuthOnPageShow);

