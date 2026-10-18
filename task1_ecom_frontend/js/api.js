/**
 * Threadly - API Service Layer
 * Connects directly to Django REST API at http://127.0.0.1:8000
 * Handles Bearer token authentication, automatic JWT refresh, error formatting,
 * and high-resolution verified Google CDN/Unsplash fashion imagery.
 */

export const API_BASE_URL = 'http://127.0.0.1:8000';

let isBackendAvailable = null;
let isRefreshing = false;
let refreshPromise = null;

/**
 * Currency Formatter (e.g. Rs. 6,500)
 */
export function formatCurrency(amount) {
  const num = parseFloat(amount || 0);
  return `Rs. ${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * Curated High-Definition Verified Fashion Photography Map
 * Accurately matches every product in the Threadly clothing collection.
 */
export const SLUG_IMAGE_MAP = {
  // Jackets
  'denim-trucker-jacket': 'public/images/denim-trucker-jacket.jpg',
  'quilted-puffer-jacket': 'public/images/quilted-puffer-jacket.jpg',
  'sherpa-lined-kids-jacket': 'public/images/sherpa-lined-kids-jacket.jpg',

  // Shalwar Kameez
  'classic-mens-shalwar-kameez': 'public/images/classic-mens-shalwar-kameez.jpg',
  'embroidered-lawn-3-piece': 'public/images/embroidered-lawn-3-piece.jpg',

  // Kurtas
  'embroidered-cotton-kurta': 'public/images/embroidered-cotton-kurta.jpg',
  'chikankari-anarkali-kurta': 'public/images/chikankari-anarkali-kurta.jpg',
  'kids-festive-kurta-set': 'public/images/kids-festive-kurta-set.jpg',

  // Dresses
  'floral-midi-wrap-dress': 'public/images/floral-midi-wrap-dress.jpg',
  'tiered-maxi-dress': 'public/images/tiered-maxi-dress.jpg',
  'denim-shirt-dress': 'public/images/denim-shirt-dress.jpg',

  // Jeans
  'straight-cut-indigo-jeans': 'public/images/straight-cut-indigo-jeans.jpg',
  'high-rise-skinny-jeans': 'public/images/high-rise-skinny-jeans.jpg',
  'relaxed-baggy-jeans': 'public/images/relaxed-baggy-jeans.jpg',

  // Hoodies
  'everyday-fleece-hoodie': 'public/images/everyday-fleece-hoodie.jpg',
  'zip-up-tech-hoodie': 'public/images/zip-up-tech-hoodie.jpg',
  'kitschy-cropped-hoodie': 'public/images/kitschy-cropped-hoodie.jpg',

  // T-Shirts
  'classic-cotton-crew-tee': 'public/images/classic-cotton-crew-tee.jpg',
  'oversized-graphic-tee': 'public/images/oversized-graphic-tee.jpg',
  'linen-collared-tee': 'public/images/linen-collared-tee.jpg',

  // Accessories
  'leather-belt': 'public/images/leather-belt.jpg',
  'silk-scarf': 'public/images/silk-scarf.jpg',
  'leather-wallet': 'public/images/leather-wallet.jpg',

  // Kidswear
  'kids-coordinated-outfit': 'public/images/kids-coordinated-outfit.jpg',
  'organic-cotton-bodysuit': 'public/images/organic-cotton-bodysuit.jpg',
  'cozy-child-knitwear': 'public/images/cozy-child-knitwear.jpg'
};

export const CATEGORY_IMAGE_MAP = {
  'jackets': 'public/images/category-jackets.jpg',
  'hoodies': 'public/images/category-hoodies.jpg',
  'jeans': 'public/images/category-jeans.jpg',
  'dresses': 'public/images/category-dresses.jpg',
  'kurtas': 'public/images/category-kurtas.jpg',
  'shalwar-kameez': 'public/images/category-shalwar-kameez.jpg',
  't-shirts': 'public/images/category-t-shirts.jpg'
};

export function normalizeImageUrl(url, slugOrCategory = '') {
  // 1. Direct slug or category key lookup
  if (slugOrCategory) {
    const key = String(slugOrCategory).toLowerCase().trim();
    if (SLUG_IMAGE_MAP[key]) return SLUG_IMAGE_MAP[key];
    if (CATEGORY_IMAGE_MAP[key]) return CATEGORY_IMAGE_MAP[key];
  }

  // 2. If url is explicitly pointing to public images folder
  if (url && typeof url === 'string') {
    const cleaned = url.trim();
    if (cleaned.startsWith('/public/images/') || cleaned.startsWith('/public/image/')) {
      return cleaned.slice(1);
    }
    if (cleaned.startsWith('public/images/') || cleaned.startsWith('public/image/') || cleaned.startsWith('images/')) {
      return cleaned;
    }

    // Check if url contains a slug or filename matching our image library
    const filename = cleaned.split('?')[0].split('/').pop().replace(/\.[^/.]+$/, "");
    if (filename && SLUG_IMAGE_MAP[filename]) {
      return SLUG_IMAGE_MAP[filename];
    }
    if (filename && CATEGORY_IMAGE_MAP[filename]) {
      return CATEGORY_IMAGE_MAP[filename];
    }

    // 3. Absolute HTTP/HTTPS URLs
    if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
      return cleaned;
    }

    // 4. Relative backend media URLs
    if (cleaned.startsWith('/media/')) {
      return `${API_BASE_URL}${cleaned}`;
    }

    if (cleaned.startsWith('/')) {
      return cleaned.slice(1);
    }
  }

  // 5. Default fallback image in local public/images
  return 'public/images/default.jpg';
}

/**
 * Attempts to refresh the JWT access token using the stored refresh token
 */
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('threadly_refresh_token');
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken })
    });

    if (!res.ok) {
      localStorage.removeItem('threadly_access_token');
      localStorage.removeItem('threadly_refresh_token');
      localStorage.removeItem('threadly_user');
      window.dispatchEvent(new CustomEvent('threadly:authExpired'));
      return null;
    }

    const data = await res.json();
    if (data.access) {
      localStorage.setItem('threadly_access_token', data.access);
      return data.access;
    }
  } catch (err) {
    console.warn('[Threadly Auth] Token refresh error:', err);
  }
  return null;
}

/**
 * Base Fetch Wrapper
 * Only sends Authorization for authenticated routes, and automatically refreshes expired tokens
 */
export async function apiRequest(endpoint, options = {}, isRetry = false) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(options.headers || {})
  };

  // Determine if this endpoint requires authentication
  const isPublicCatalog = endpoint.startsWith('/api/categories/') || 
                          endpoint.startsWith('/api/products/') || 
                          endpoint.includes('/auth/login/') || 
                          endpoint.includes('/auth/register/') || 
                          endpoint.includes('/auth/refresh/');

  const token = localStorage.getItem('threadly_access_token');

  // Only attach Bearer token to authenticated endpoints or when explicitly specified
  if (token && (!isPublicCatalog || options.authRequired)) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    updateBackendStatus(true);

    // If 401 on an authenticated request and we haven't retried yet, attempt refresh
    if (response.status === 401 && !isRetry && !endpoint.includes('/auth/login/') && !endpoint.includes('/auth/refresh/')) {
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = refreshAccessToken().finally(() => {
          isRefreshing = false;
        });
      }

      const newToken = await refreshPromise;
      if (newToken) {
        return apiRequest(endpoint, options, true);
      } else {
        localStorage.removeItem('threadly_access_token');
        localStorage.removeItem('threadly_refresh_token');
        localStorage.removeItem('threadly_user');
        window.dispatchEvent(new CustomEvent('threadly:authExpired'));
      }
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      let errorMsg = 'An error occurred';
      if (data) {
        if (typeof data === 'string') errorMsg = data;
        else if (data.detail) errorMsg = data.detail;
        else if (data.message) errorMsg = data.message;
        else if (data.error) errorMsg = data.error;
        else if (typeof data === 'object') {
          errorMsg = Object.entries(data)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join(' | ');
        }
      }
      const err = new Error(errorMsg);
      err.status = response.status;
      err.data = data;
      throw err;
    }

    return data;
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      updateBackendStatus(false);
      console.warn(`[Threadly API] Connection to ${API_BASE_URL} failed. Running fallback.`);
      return handleOfflineMock(endpoint, options);
    }
    throw error;
  }
}

function updateBackendStatus(connected) {
  if (isBackendAvailable === connected) return;
  isBackendAvailable = connected;

  let badge = document.getElementById('api-status-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'api-status-badge';
    badge.className = 'api-status-badge';
    document.body.appendChild(badge);
  }

  if (connected) {
    badge.innerHTML = `<span class="api-dot connected"></span> Connected: Django 127.0.0.1:8000`;
  } else {
    badge.innerHTML = `<span class="api-dot offline"></span> API Offline (Demo Mode)`;
  }
}

export function showToast(message, type = 'success', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconSvg = type === 'success' 
    ? '<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>'
    : type === 'error'
    ? '<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>'
    : '<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';

  toast.innerHTML = `
    <div class="toast-icon">${iconSvg}</div>
    <div class="toast-message">${message}</div>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export const authAPI = {
  async register(userData) {
    const payload = {
      username: userData.username,
      email: userData.email,
      password: userData.password,
      password2: userData.password2 || userData.confirm_password || userData.password
    };
    return apiRequest('/api/auth/register/', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async login(credentials) {
    return apiRequest('/api/auth/login/', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
  },

  async getMe() {
    return apiRequest('/api/auth/me/', { method: 'GET', authRequired: true });
  }
};

export const categoriesAPI = {
  async getAll() {
    const data = await apiRequest('/api/categories/', { method: 'GET' });
    const list = Array.isArray(data) ? data : (data?.results || data?.value || []);
    return list.map(c => ({
      ...c,
      image: c.image || CATEGORY_IMAGE_MAP[c.slug?.toLowerCase()] || 'public/images/default.jpg'
    }));
  }
};

export const productsAPI = {
  async getAll(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        query.append(key, val);
      }
    });
    const queryString = query.toString();
    const endpoint = queryString ? `/api/products/?${queryString}` : '/api/products/';
    return apiRequest(endpoint, { method: 'GET' });
  },

  async getFeatured() {
    return apiRequest('/api/products/featured/', { method: 'GET' });
  },

  async getById(id) {
    return apiRequest(`/api/products/${id}/`, { method: 'GET' });
  }
};

export const ordersAPI = {
  async create(orderData) {
    return apiRequest('/api/orders/', {
      method: 'POST',
      authRequired: true,
      body: JSON.stringify(orderData)
    });
  },

  async getAll() {
    return apiRequest('/api/orders/', {
      method: 'GET',
      authRequired: true
    });
  }
};

function handleOfflineMock(endpoint, options) {
  if (endpoint.includes('/auth/login/')) {
    return {
      access: 'mock_jwt_access_' + Date.now(),
      refresh: 'mock_jwt_refresh_' + Date.now(),
      user: { id: 1, username: 'threadly_member', email: 'member@threadly.com' }
    };
  }
  return { count: 0, next: null, previous: null, results: [] };
}

window.ThreadlyAPI = {
  API_BASE_URL,
  formatCurrency,
  normalizeImageUrl,
  apiRequest,
  showToast,
  authAPI,
  productsAPI,
  categoriesAPI,
  ordersAPI
};
