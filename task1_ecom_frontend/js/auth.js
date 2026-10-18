/**
 * Threadly - Authentication Service & Route Guards
 * Manages JWT tokens, user session state, and navbar auth rendering.
 */

import { authAPI, showToast } from './api.js';

const ACCESS_TOKEN_KEY = 'threadly_access_token';
const REFRESH_TOKEN_KEY = 'threadly_refresh_token';
const USER_KEY = 'threadly_user';

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(tokens) {
  if (tokens.access) localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access);
  if (tokens.refresh) localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh);
}

export function removeTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated() {
  return !!getAccessToken();
}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function setUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Route Guard: Redirects to login.html if user is not authenticated.
 * Preserves the destination URL as ?redirect=
 */
export function requireAuth(customRedirect) {
  if (!isAuthenticated()) {
    const currentPath = customRedirect || window.location.pathname.split('/').pop() || 'index.html';
    showToast('Please sign in to access this page', 'warning');
    setTimeout(() => {
      window.location.href = `login.html?redirect=${encodeURIComponent(currentPath)}`;
    }, 400);
    return false;
  }
  return true;
}

/**
 * Log out user, clear credentials and refresh current state
 */
export function logout() {
  removeTokens();
  showToast('You have been signed out.', 'info');
  updateNavbarAuth();
  // If currently on a protected page, navigate to home
  const currentPage = window.location.pathname.split('/').pop();
  if (currentPage === 'checkout.html' || currentPage === 'orders.html') {
    window.location.href = 'index.html';
  } else {
    window.location.reload();
  }
}

/**
 * Dynamically updates the navbar auth section based on login status
 */
export async function updateNavbarAuth() {
  const container = document.getElementById('navbar-auth-section');
  if (!container) return;

  if (isAuthenticated()) {
    let user = getUser();
    // Optionally fetch fresh user info if not cached
    if (!user) {
      try {
        user = await authAPI.getMe();
        if (user) setUser(user);
      } catch (e) {
        console.warn('Unable to fetch user details:', e);
      }
    }

    const displayName = user ? (user.first_name || user.username || user.email?.split('@')[0]) : 'Member';
    const email = user ? (user.email || '') : '';

    container.innerHTML = `
      <div class="auth-nav-container">
        <button id="user-menu-btn" class="icon-btn" aria-label="User Account" title="My Account">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
          </svg>
        </button>
        <div id="auth-dropdown-menu" class="auth-dropdown">
          <div class="auth-user-info">
            <div class="auth-user-name">${displayName}</div>
            <div class="auth-user-email">${email}</div>
          </div>
          <a href="orders.html" class="dropdown-item">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
            </svg>
            My Orders
          </a>
          <button id="logout-btn" class="dropdown-item" style="color: var(--status-error); width: 100%; text-align: left;">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
            </svg>
            Sign Out
          </button>
        </div>
      </div>
    `;

    // Dropdown toggle
    const menuBtn = document.getElementById('user-menu-btn');
    const dropdown = document.getElementById('auth-dropdown-menu');
    const logoutBtn = document.getElementById('logout-btn');

    if (menuBtn && dropdown) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('show');
      });

      document.addEventListener('click', () => {
        dropdown.classList.remove('show');
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
      });
    }
  } else {
    // Unauthenticated state
    container.innerHTML = `
      <a href="login.html" class="btn btn-outline btn-sm" style="border-radius: var(--radius-full); padding: 0.4rem 1.1rem;">
        Sign In
      </a>
    `;
  }
}

/**
 * Handle Login Form Submission
 */
export function initLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;

  const alertBox = document.getElementById('auth-alert');
  const submitBtn = document.getElementById('login-submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (alertBox) {
      alertBox.className = 'auth-alert';
      alertBox.textContent = '';
      alertBox.style.display = 'none';
    }

    const usernameOrEmail = document.getElementById('username-input')?.value.trim();
    const password = document.getElementById('password-input')?.value;

    if (!usernameOrEmail || !password) {
      showError('Please enter both your username/email and password.');
      return;
    }

    setLoading(true);

    try {
      // Accepts username or email
      const payload = { password };
      if (usernameOrEmail.includes('@')) {
        payload.email = usernameOrEmail;
        payload.username = usernameOrEmail; // send both for DRF compatibility
      } else {
        payload.username = usernameOrEmail;
      }

      const res = await authAPI.login(payload);
      
      // Store tokens
      setTokens({ access: res.access, refresh: res.refresh });
      
      // Store user if provided or fetch me
      if (res.user) {
        setUser(res.user);
      } else {
        const userDetails = await authAPI.getMe().catch(() => ({ username: usernameOrEmail }));
        setUser(userDetails);
      }

      showToast('Welcome back! You have successfully signed in.');

      // Check redirect param
      const urlParams = new URLSearchParams(window.location.search);
      const redirect = urlParams.get('redirect') || 'index.html';
      
      setTimeout(() => {
        window.location.href = redirect;
      }, 700);

    } catch (err) {
      const errorMsg = err.data?.detail || err.message || 'Invalid username or password. Please try again.';
      showError(errorMsg);
    } finally {
      setLoading(false);
    }
  });

  function showError(msg) {
    if (alertBox) {
      alertBox.textContent = msg;
      alertBox.className = 'auth-alert error';
      alertBox.style.display = 'block';
    }
  }

  function setLoading(loading) {
    if (!submitBtn) return;
    submitBtn.disabled = loading;
    submitBtn.innerHTML = loading 
      ? '<div class="spinner" style="margin: 0 auto;"></div>' 
      : 'Sign In';
  }
}

/**
 * Handle Registration Form Submission
 */
export function initRegisterForm() {
  const form = document.getElementById('register-form');
  if (!form) return;

  const alertBox = document.getElementById('auth-alert');
  const submitBtn = document.getElementById('register-submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (alertBox) {
      alertBox.className = 'auth-alert';
      alertBox.textContent = '';
      alertBox.style.display = 'none';
    }

    const username = document.getElementById('reg-username')?.value.trim();
    const email = document.getElementById('reg-email')?.value.trim();
    const password = document.getElementById('reg-password')?.value;
    const confirmPassword = document.getElementById('reg-confirm-password')?.value;

    if (!username || !email || !password) {
      showError('All required fields must be filled.');
      return;
    }

    if (password !== confirmPassword) {
      showError('Passwords do not match. Please verify.');
      return;
    }

    if (password.length < 6) {
      showError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    try {
      const payload = { username, email, password, password2: confirmPassword };
      await authAPI.register(payload);

      // Attempt automatic login or prompt sign-in
      try {
        const loginRes = await authAPI.login({ username, password });
        setTokens({ access: loginRes.access, refresh: loginRes.refresh });
        if (loginRes.user) setUser(loginRes.user);
        
        showToast('Registration complete! Welcome to Threadly.');
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 800);
      } catch (loginErr) {
        showSuccess('Account created! Please sign in with your credentials.');
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 1200);
      }
    } catch (err) {
      let msg = 'Registration failed. ';
      if (err.data && typeof err.data === 'object') {
        const errors = Object.entries(err.data).map(([field, errList]) => `${field}: ${Array.isArray(errList) ? errList.join(', ') : errList}`);
        msg += errors.join('; ');
      } else {
        msg += err.message || 'Please check your inputs.';
      }
      showError(msg);
    } finally {
      setLoading(false);
    }
  });

  function showError(msg) {
    if (alertBox) {
      alertBox.textContent = msg;
      alertBox.className = 'auth-alert error';
      alertBox.style.display = 'block';
    }
  }

  function showSuccess(msg) {
    if (alertBox) {
      alertBox.textContent = msg;
      alertBox.className = 'auth-alert success';
      alertBox.style.display = 'block';
    }
  }

  function setLoading(loading) {
    if (!submitBtn) return;
    submitBtn.disabled = loading;
    submitBtn.innerHTML = loading 
      ? '<div class="spinner" style="margin: 0 auto;"></div>' 
      : 'Create Account';
  }
}

// Global navbar setup on DOM content loaded
document.addEventListener('DOMContentLoaded', () => {
  updateNavbarAuth();
  initLoginForm();
  initRegisterForm();

  // Listen for automatic token expiration from api.js
  window.addEventListener('threadly:authExpired', () => {
    updateNavbarAuth();
    const currentPage = window.location.pathname.split('/').pop();
    if (currentPage === 'checkout.html' || currentPage === 'orders.html') {
      showToast('Your session has expired. Please sign in again.', 'warning');
      setTimeout(() => {
        window.location.href = `login.html?redirect=${encodeURIComponent(currentPage)}`;
      }, 800);
    }
  });

  // Mobile drawer controls
  const hamburger = document.getElementById('hamburger-btn');
  const drawer = document.getElementById('mobile-nav-drawer');
  const closeDrawer = document.getElementById('mobile-drawer-close');

  if (hamburger && drawer) {
    hamburger.addEventListener('click', () => drawer.classList.add('open'));
  }
  if (closeDrawer && drawer) {
    closeDrawer.addEventListener('click', () => drawer.classList.remove('open'));
  }
  if (drawer) {
    drawer.addEventListener('click', (e) => {
      if (e.target === drawer) drawer.classList.remove('open');
    });
  }
});
