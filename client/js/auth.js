/* ===========================================================
   Auth — session management (sessionStorage; swap to your real
   token/cookie strategy once the backend exists)
   =========================================================== */

const SESSION_KEY = 'tppf_session';

const Auth = {
  getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },
  setSession(session) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
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
  },
  isLoggedIn() {
    return !!this.getSession();
  },
  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = 'login.html';
      throw new Error('redirecting to login');
    }
  },
  logout() {
    this.clearSession();
    window.location.href = 'login.html';
  },
  initials(name) {
    if (!name) return '?';
    return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  },
};
