/**
 * Threadly - Shop Catalog Page Logic
 * Handles filtering (category, gender, price, size, color), sorting, search,
 * URL query param synchronization, skeletons, and pagination.
 */

import { productsAPI, categoriesAPI, normalizeImageUrl, formatCurrency } from './api.js';

let state = {
  q: '',
  category: '',
  gender: '',
  min_price: '',
  max_price: '',
  size: '',
  color: '',
  ordering: '',
  page: 1,
  pageSize: 9,
  totalCount: 0
};

let searchDebounceTimer = null;

function parseUrlParams() {
  const params = new URLSearchParams(window.location.search);
  state.q = params.get('q') || '';
  state.category = params.get('category') || '';
  state.gender = params.get('gender') || '';
  state.min_price = params.get('min_price') || '';
  state.max_price = params.get('max_price') || '';
  state.size = params.get('size') || '';
  state.color = params.get('color') || '';
  state.ordering = params.get('ordering') || '';
  state.page = parseInt(params.get('page') || '1', 10);
}

function updateUrlParams() {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.category) params.set('category', state.category);
  if (state.gender) params.set('gender', state.gender);
  if (state.min_price) params.set('min_price', state.min_price);
  if (state.max_price) params.set('max_price', state.max_price);
  if (state.size) params.set('size', state.size);
  if (state.color) params.set('color', state.color);
  if (state.ordering) params.set('ordering', state.ordering);
  if (state.page > 1) params.set('page', state.page.toString());

  const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
  window.history.replaceState({}, '', newUrl);
}

async function loadCategories() {
  const container = document.getElementById('category-filter-list');
  if (!container) return;

  try {
    const data = await categoriesAPI.getAll();
    const categories = Array.isArray(data) ? data : (data?.results || data?.value || []);

    const allChecked = !state.category ? 'checked' : '';
    let html = `
      <label class="filter-checkbox-label">
        <input type="radio" name="category-filter" value="" ${allChecked}>
        <span>All Categories</span>
      </label>
    `;

    categories.forEach(cat => {
      const isChecked = (String(state.category).toLowerCase() === String(cat.id).toLowerCase() || 
                         state.category.toLowerCase() === (cat.slug || '').toLowerCase() || 
                         state.category.toLowerCase() === (cat.name || '').toLowerCase()) ? 'checked' : '';
      html += `
        <label class="filter-checkbox-label">
          <input type="radio" name="category-filter" value="${cat.name || cat.id}" ${isChecked}>
          <span>${cat.name}</span>
        </label>
      `;
    });

    container.innerHTML = html;

    container.querySelectorAll('input[name="category-filter"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        state.category = e.target.value;
        state.page = 1;
        updateUrlParams();
        fetchProducts();
      });
    });
  } catch (err) {
    console.error('Failed to load categories filter:', err);
  }
}

function renderSkeletons() {
  const grid = document.getElementById('shop-products-grid');
  if (!grid) return;

  grid.innerHTML = Array.from({ length: 6 }).map(() => `
    <div class="product-card">
      <div class="skeleton" style="aspect-ratio: 4/5; width: 100%;"></div>
      <div class="product-info" style="gap: 0.6rem;">
        <div class="skeleton" style="height: 12px; width: 40%;"></div>
        <div class="skeleton" style="height: 18px; width: 85%;"></div>
        <div class="skeleton" style="height: 16px; width: 30%; margin-top: 10px;"></div>
      </div>
    </div>
  `).join('');
}

async function fetchProducts() {
  const grid = document.getElementById('shop-products-grid');
  const countEl = document.getElementById('results-count');
  if (!grid) return;

  renderSkeletons();

  try {
    const params = {
      q: state.q,
      category: state.category,
      gender: state.gender,
      min_price: state.min_price,
      max_price: state.max_price,
      size: state.size,
      color: state.color,
      ordering: state.ordering,
      page: state.page
    };

    const res = await productsAPI.getAll(params);
    const products = Array.isArray(res) ? res : (res?.results || res?.value || []);
    state.totalCount = res?.count ?? products.length;

    if (countEl) {
      countEl.textContent = `Showing ${products.length} of ${state.totalCount} items`;
    }

    if (products.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>
          <h3>No products match your criteria</h3>
          <p>Try refining or clearing your filters to discover our collection.</p>
          <button id="empty-reset-btn" class="btn btn-outline btn-sm">Clear All Filters</button>
        </div>
      `;

      document.getElementById('empty-reset-btn')?.addEventListener('click', resetFilters);
      renderPagination(0, 1);
      return;
    }

    grid.innerHTML = products.map(product => {
      const priceRaw = parseFloat(product.price || 0);
      const discountPriceRaw = product.discount_price ? parseFloat(product.discount_price) : null;
      const currentPrice = discountPriceRaw || product.effective_price || priceRaw;
      const originalPrice = (discountPriceRaw && priceRaw > currentPrice) ? priceRaw : null;
      const discountPct = originalPrice ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100) : 0;

      const imageUrl = normalizeImageUrl(product.image_url || product.image || product.images?.[0]?.image, product.slug);
      const categoryName = product.category_name || (typeof product.category === 'object' ? product.category?.name : product.category) || 'Collection';

      return `
        <article class="product-card">
          <div class="product-image-container">
            <div class="product-badges">
              ${discountPct > 0 ? `<span class="badge badge-sale">-${discountPct}%</span>` : ''}
              ${product.is_featured || product.featured ? `<span class="badge badge-featured">Featured</span>` : ''}
            </div>
            <a href="product.html?id=${product.id}">
              <img class="product-image" src="${imageUrl}" alt="${product.name}" onerror="this.onerror=null; this.src='public/images/default.jpg'">
            </a>
            <div class="product-card-actions">
              <a href="product.html?id=${product.id}" class="btn btn-primary btn-block btn-sm" style="font-size: 0.8rem;">
                Select Options
              </a>
            </div>
          </div>
          <div class="product-info">
            <span class="product-category-tag">${categoryName}</span>
            <h3 class="product-title">
              <a href="product.html?id=${product.id}">${product.name}</a>
            </h3>
            <div class="product-pricing">
              <span class="product-price">${formatCurrency(currentPrice)}</span>
              ${originalPrice ? `<span class="product-original-price">${formatCurrency(originalPrice)}</span>` : ''}
            </div>
          </div>
        </article>
      `;
    }).join('');

    renderPagination(state.totalCount, state.page);
  } catch (err) {
    console.error('Failed to fetch products:', err);
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h3>Unable to load catalog</h3>
        <p>${err.message || 'Check your connection to the Django server.'}</p>
        <button onclick="window.location.reload()" class="btn btn-primary btn-sm">Try Again</button>
      </div>
    `;
  }
}

function renderPagination(totalCount, currentPage) {
  const container = document.getElementById('shop-pagination');
  if (!container) return;

  const totalPages = Math.ceil(totalCount / state.pageSize) || 1;
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = `
    <button class="pagination-btn" id="pag-prev" ${currentPage <= 1 ? 'disabled' : ''}>
      &larr; Prev
    </button>
  `;

  for (let i = 1; i <= totalPages; i++) {
    html += `
      <button class="pagination-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">
        ${i}
      </button>
    `;
  }

  html += `
    <button class="pagination-btn" id="pag-next" ${currentPage >= totalPages ? 'disabled' : ''}>
      Next &rarr;
    </button>
  `;

  container.innerHTML = html;

  container.querySelectorAll('.pagination-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.page = parseInt(btn.dataset.page, 10);
      updateUrlParams();
      fetchProducts();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  document.getElementById('pag-prev')?.addEventListener('click', () => {
    if (state.page > 1) {
      state.page--;
      updateUrlParams();
      fetchProducts();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  document.getElementById('pag-next')?.addEventListener('click', () => {
    if (state.page < totalPages) {
      state.page++;
      updateUrlParams();
      fetchProducts();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
}

function resetFilters() {
  state = {
    q: '',
    category: '',
    gender: '',
    min_price: '',
    max_price: '',
    size: '',
    color: '',
    ordering: '',
    page: 1,
    pageSize: 9,
    totalCount: 0
  };

  const searchInput = document.getElementById('shop-search-input');
  if (searchInput) searchInput.value = '';

  const sortSelect = document.getElementById('shop-sort-select');
  if (sortSelect) sortSelect.value = '';

  const minPriceInput = document.getElementById('min-price-input');
  if (minPriceInput) minPriceInput.value = '';

  const maxPriceInput = document.getElementById('max-price-input');
  if (maxPriceInput) maxPriceInput.value = '';

  document.querySelectorAll('input[name="gender-filter"]').forEach(r => r.checked = r.value === '');
  document.querySelectorAll('input[name="category-filter"]').forEach(r => r.checked = r.value === '');
  document.querySelectorAll('.size-chip').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.color-swatch-filter').forEach(c => c.classList.remove('selected'));

  updateUrlParams();
  fetchProducts();
}

function setupFilterListeners() {
  const searchInput = document.getElementById('shop-search-input');
  if (searchInput) {
    searchInput.value = state.q;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        state.q = e.target.value.trim();
        state.page = 1;
        updateUrlParams();
        fetchProducts();
      }, 350);
    });
  }

  const sortSelect = document.getElementById('shop-sort-select');
  if (sortSelect) {
    sortSelect.value = state.ordering;
    sortSelect.addEventListener('change', (e) => {
      state.ordering = e.target.value;
      state.page = 1;
      updateUrlParams();
      fetchProducts();
    });
  }

  document.querySelectorAll('input[name="gender-filter"]').forEach(radio => {
    if (radio.value.toLowerCase() === state.gender.toLowerCase()) radio.checked = true;
    radio.addEventListener('change', (e) => {
      state.gender = e.target.value;
      state.page = 1;
      updateUrlParams();
      fetchProducts();
    });
  });

  const minPriceInput = document.getElementById('min-price-input');
  const maxPriceInput = document.getElementById('max-price-input');
  const priceApplyBtn = document.getElementById('apply-price-btn');

  if (minPriceInput) minPriceInput.value = state.min_price;
  if (maxPriceInput) maxPriceInput.value = state.max_price;

  if (priceApplyBtn) {
    priceApplyBtn.addEventListener('click', () => {
      state.min_price = minPriceInput?.value.trim() || '';
      state.max_price = maxPriceInput?.value.trim() || '';
      state.page = 1;
      updateUrlParams();
      fetchProducts();
    });
  }

  document.querySelectorAll('.size-chip').forEach(chip => {
    const sizeVal = chip.dataset.size;
    if (sizeVal === state.size) chip.classList.add('selected');

    chip.addEventListener('click', () => {
      if (state.size === sizeVal) {
        state.size = '';
        chip.classList.remove('selected');
      } else {
        document.querySelectorAll('.size-chip').forEach(c => c.classList.remove('selected'));
        state.size = sizeVal;
        chip.classList.add('selected');
      }
      state.page = 1;
      updateUrlParams();
      fetchProducts();
    });
  });

  document.querySelectorAll('.color-swatch-filter').forEach(swatch => {
    const colorVal = swatch.dataset.color;
    if (colorVal === state.color) swatch.classList.add('selected');

    swatch.addEventListener('click', () => {
      if (state.color === colorVal) {
        state.color = '';
        swatch.classList.remove('selected');
      } else {
        document.querySelectorAll('.color-swatch-filter').forEach(s => s.classList.remove('selected'));
        state.color = colorVal;
        swatch.classList.add('selected');
      }
      state.page = 1;
      updateUrlParams();
      fetchProducts();
    });
  });

  document.getElementById('reset-filters-btn')?.addEventListener('click', resetFilters);
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('shop-products-grid')) {
    parseUrlParams();
    setupFilterListeners();
    loadCategories();
    fetchProducts();
  }
});
