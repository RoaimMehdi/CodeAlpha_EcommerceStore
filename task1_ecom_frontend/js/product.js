/**
 * Threadly - Product Detail Page Logic
 * Loads detailed product info from GET /api/products/<id>/
 * Manages variant matrix (Color & Size selection), live stock verification,
 * dynamic out-of-stock size disabling, and cart addition.
 */

import { productsAPI, normalizeImageUrl, formatCurrency, showToast } from './api.js';
import { addToCart } from './cart.js';

let currentProduct = null;
let selectedColor = null;
let selectedSize = null;
let selectedVariant = null;
let quantity = 1;

function getProductIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

async function loadProduct() {
  const productId = getProductIdFromUrl();
  const container = document.getElementById('product-detail-container');
  if (!container) return;

  if (!productId) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Product Not Specified</h3>
        <p>Please browse our catalog to find an item you love.</p>
        <a href="shop.html" class="btn btn-primary">Browse Collection</a>
      </div>
    `;
    return;
  }

  try {
    currentProduct = await productsAPI.getById(productId);
    renderProductDetail(currentProduct);
    loadRelatedProducts(currentProduct);
  } catch (err) {
    console.error('Error fetching product detail:', err);
    container.innerHTML = `
      <div class="empty-state">
        <h3>Product Not Found</h3>
        <p>${err.message || 'The requested product could not be retrieved.'}</p>
        <a href="shop.html" class="btn btn-primary">Back to Shop</a>
      </div>
    `;
  }
}

function renderProductDetail(product) {
  document.title = `${product.name} | Threadly`;
  const breadcrumbProduct = document.getElementById('breadcrumb-product-name');
  if (breadcrumbProduct) breadcrumbProduct.textContent = product.name;

  const breadcrumbCategory = document.getElementById('breadcrumb-category');
  const categoryName = product.category_name || (typeof product.category === 'object' ? product.category?.name : product.category) || 'Collection';
  if (breadcrumbCategory) {
    breadcrumbCategory.textContent = categoryName;
    breadcrumbCategory.href = `shop.html?category=${encodeURIComponent(categoryName)}`;
  }

  const mainImage = document.getElementById('main-product-image');
  const imageUrl = normalizeImageUrl(product.image_url || product.image || product.images?.[0]?.image, product.slug);
  if (mainImage) {
    mainImage.src = imageUrl;
    mainImage.alt = product.name;
    mainImage.onerror = function() {
      this.onerror = null;
      this.src = 'public/images/default.jpg';
    };
  }

  const thumbContainer = document.getElementById('gallery-thumbnails');
  if (thumbContainer) {
    const imagesList = product.images && product.images.length > 0 ? product.images : [{ image: imageUrl }];
    thumbContainer.innerHTML = imagesList.map((imgObj, idx) => {
      const src = normalizeImageUrl(imgObj.image || imgObj, product.slug);
      return `
        <div class="thumb-item ${idx === 0 ? 'active' : ''}" data-src="${src}">
          <img src="${src}" alt="${product.name} thumbnail" onerror="this.onerror=null; this.src='public/images/default.jpg'">
        </div>
      `;
    }).join('');

    thumbContainer.querySelectorAll('.thumb-item').forEach(thumb => {
      thumb.addEventListener('click', () => {
        thumbContainer.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
        if (mainImage) mainImage.src = thumb.dataset.src;
      });
    });
  }

  const titleEl = document.getElementById('detail-title');
  if (titleEl) titleEl.textContent = product.name;

  const catTag = document.getElementById('detail-category-tag');
  if (catTag) catTag.textContent = `${categoryName} • ${product.gender || 'Unisex'}`;

  // Price calculations
  const priceRaw = parseFloat(product.price || 0);
  const discountPriceRaw = product.discount_price ? parseFloat(product.discount_price) : null;
  const currentPrice = discountPriceRaw || product.effective_price || priceRaw;
  const originalPrice = (discountPriceRaw && priceRaw > currentPrice) ? priceRaw : null;

  const priceEl = document.getElementById('detail-price');
  if (priceEl) priceEl.textContent = formatCurrency(currentPrice);

  const origPriceEl = document.getElementById('detail-original-price');
  const discountPill = document.getElementById('detail-discount-pill');
  if (originalPrice) {
    if (origPriceEl) {
      origPriceEl.textContent = formatCurrency(originalPrice);
      origPriceEl.style.display = 'inline';
    }
    if (discountPill) {
      const pct = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
      discountPill.textContent = `SAVE ${pct}%`;
      discountPill.style.display = 'inline-block';
    }
  } else {
    if (origPriceEl) origPriceEl.style.display = 'none';
    if (discountPill) discountPill.style.display = 'none';
  }

  const descEl = document.getElementById('detail-description');
  if (descEl) descEl.textContent = product.description || 'Expertly tailored from sustainably sourced natural fibers. Engineered for timeless structure and enduring elegance.';

  renderVariantSelectors(product.variants || []);
  setupQuantityStepper();
  setupPurchaseButtons(currentPrice, originalPrice);
}

function renderVariantSelectors(variants) {
  const colorContainer = document.getElementById('detail-color-container');
  const sizeContainer = document.getElementById('detail-size-container');
  const selectedColorLabel = document.getElementById('selected-color-label');
  const selectedSizeLabel = document.getElementById('selected-size-label');

  if (!variants || variants.length === 0) {
    if (colorContainer) colorContainer.innerHTML = '<span class="text-muted">Classic</span>';
    if (sizeContainer) sizeContainer.innerHTML = '<span class="text-muted">Standard Size</span>';
    selectedVariant = { id: 1, stock: 10, price: currentProduct.price };
    return;
  }

  const colors = [...new Set(variants.map(v => v.color).filter(Boolean))];
  const sizes = [...new Set(variants.map(v => v.size).filter(Boolean))];

  selectedColor = colors[0] || null;
  if (selectedColorLabel && selectedColor) {
    selectedColorLabel.textContent = selectedColor;
  }

  if (colorContainer) {
    colorContainer.innerHTML = colors.map(col => `
      <button type="button" class="detail-color-btn ${col === selectedColor ? 'selected' : ''}" data-color="${col}">
        <span class="swatch-color-circle" style="background-color: ${getColorHex(col)};"></span>
        <span>${col}</span>
      </button>
    `).join('');

    colorContainer.querySelectorAll('.detail-color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        colorContainer.querySelectorAll('.detail-color-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedColor = btn.dataset.color;
        if (selectedColorLabel) selectedColorLabel.textContent = selectedColor;
        
        updateSizeButtonsForColor(variants, sizes);
      });
    });
  }

  updateSizeButtonsForColor(variants, sizes);
}

function updateSizeButtonsForColor(variants, sizes) {
  const sizeContainer = document.getElementById('detail-size-container');
  const selectedSizeLabel = document.getElementById('selected-size-label');
  if (!sizeContainer) return;

  const colorVariants = variants.filter(v => !selectedColor || v.color.toLowerCase() === selectedColor.toLowerCase());

  sizeContainer.innerHTML = sizes.map(sz => {
    const matched = colorVariants.find(v => v.size.toLowerCase() === sz.toLowerCase());
    const stock = matched ? (matched.stock ?? 0) : 0;
    const isOutOfStock = stock <= 0;
    const isSelected = selectedSize && selectedSize.toLowerCase() === sz.toLowerCase() && !isOutOfStock;

    return `
      <button type="button" 
        class="detail-size-btn ${isSelected ? 'selected' : ''} ${isOutOfStock ? 'out-of-stock' : ''}" 
        data-size="${sz}" 
        data-stock="${stock}"
        ${isOutOfStock ? 'disabled title="Out of Stock"' : ''}>
        ${sz}
      </button>
    `;
  }).join('');

  const matchedSelected = colorVariants.find(v => selectedSize && v.size.toLowerCase() === selectedSize.toLowerCase());
  if (!matchedSelected || matchedSelected.stock <= 0) {
    selectedSize = null;
    selectedVariant = null;
    if (selectedSizeLabel) selectedSizeLabel.textContent = 'Please choose an available size';
    updateStockStatus(null);
  } else {
    selectedVariant = matchedSelected;
    updateStockStatus(matchedSelected.stock);
  }

  sizeContainer.querySelectorAll('.detail-size-btn:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      sizeContainer.querySelectorAll('.detail-size-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedSize = btn.dataset.size;
      if (selectedSizeLabel) selectedSizeLabel.textContent = selectedSize;

      selectedVariant = colorVariants.find(v => v.size.toLowerCase() === selectedSize.toLowerCase());
      updateStockStatus(selectedVariant ? selectedVariant.stock : 0);
    });
  });
}

function updateStockStatus(stock) {
  const indicator = document.getElementById('detail-stock-indicator');
  if (!indicator) return;

  if (stock === null) {
    indicator.className = 'stock-indicator';
    indicator.innerHTML = `<span class="stock-dot" style="background-color: var(--text-light);"></span> <span>Select size to check availability</span>`;
  } else if (stock > 5) {
    indicator.className = 'stock-indicator in-stock';
    indicator.innerHTML = `<span class="stock-dot"></span> <span>In Stock (${stock} items available)</span>`;
  } else if (stock > 0) {
    indicator.className = 'stock-indicator low-stock';
    indicator.innerHTML = `<span class="stock-dot"></span> <span>Low Stock — only ${stock} remaining!</span>`;
  } else {
    indicator.className = 'stock-indicator out-of-stock';
    indicator.innerHTML = `<span class="stock-dot"></span> <span>Out of Stock</span>`;
  }
}

function setupQuantityStepper() {
  const minusBtn = document.getElementById('qty-minus');
  const plusBtn = document.getElementById('qty-plus');
  const input = document.getElementById('qty-input');

  if (!input) return;

  minusBtn?.addEventListener('click', () => {
    if (quantity > 1) {
      quantity--;
      input.value = quantity;
    }
  });

  plusBtn?.addEventListener('click', () => {
    const maxStock = selectedVariant ? (selectedVariant.stock || 99) : 99;
    if (quantity < maxStock) {
      quantity++;
      input.value = quantity;
    } else {
      showToast(`Cannot add more than ${maxStock} items`, 'warning');
    }
  });

  input.addEventListener('change', () => {
    let val = parseInt(input.value, 10);
    const maxStock = selectedVariant ? (selectedVariant.stock || 99) : 99;
    if (isNaN(val) || val < 1) val = 1;
    if (val > maxStock) val = maxStock;
    quantity = val;
    input.value = quantity;
  });
}

function setupPurchaseButtons(currentPrice, originalPrice) {
  const addBtn = document.getElementById('btn-add-to-cart');
  const buyBtn = document.getElementById('btn-buy-now');

  function validateSelection() {
    if (!selectedColor) {
      showToast('Please select a color first.', 'warning');
      return false;
    }
    if (!selectedSize) {
      showToast('Please select an available size before adding to bag.', 'warning');
      return false;
    }
    if (!selectedVariant || selectedVariant.stock <= 0) {
      showToast('Selected variant is currently out of stock.', 'error');
      return false;
    }
    return true;
  }

  addBtn?.addEventListener('click', () => {
    if (!validateSelection()) return;

    const item = {
      variantId: selectedVariant.id,
      productId: currentProduct.id,
      name: currentProduct.name,
      price: currentPrice,
      originalPrice: originalPrice,
      image: normalizeImageUrl(currentProduct.image_url || currentProduct.image || currentProduct.images?.[0]?.image, currentProduct.slug),
      size: selectedSize,
      color: selectedColor,
      quantity: quantity,
      stock: selectedVariant.stock
    };

    addToCart(item);
  });

  buyBtn?.addEventListener('click', () => {
    if (!validateSelection()) return;

    const item = {
      variantId: selectedVariant.id,
      productId: currentProduct.id,
      name: currentProduct.name,
      price: currentPrice,
      originalPrice: originalPrice,
      image: normalizeImageUrl(currentProduct.image_url || currentProduct.image || currentProduct.images?.[0]?.image, currentProduct.slug),
      size: selectedSize,
      color: selectedColor,
      quantity: quantity,
      stock: selectedVariant.stock
    };

    addToCart(item);
    window.location.href = 'checkout.html';
  });

  document.querySelectorAll('.accordion-header').forEach(btn => {
    btn.addEventListener('click', () => {
      const content = btn.nextElementSibling;
      if (content) {
        content.classList.toggle('show');
      }
    });
  });
}

async function loadRelatedProducts(product) {
  const container = document.getElementById('related-products-grid');
  if (!container) return;

  try {
    const catQuery = product.category_name || (typeof product.category === 'string' ? product.category : product.category?.name);
    const res = await productsAPI.getAll({ category: catQuery });
    const items = Array.isArray(res) ? res : (res?.results || res?.value || []);
    const related = items.filter(p => String(p.id) !== String(product.id)).slice(0, 4);

    if (related.length === 0) {
      container.parentElement.style.display = 'none';
      return;
    }

    container.innerHTML = related.map(p => {
      const priceRaw = parseFloat(p.price || 0);
      const discountPriceRaw = p.discount_price ? parseFloat(p.discount_price) : null;
      const curPrice = discountPriceRaw || p.effective_price || priceRaw;
      const img = normalizeImageUrl(p.image_url || p.image || p.images?.[0]?.image, p.slug);

      return `
        <article class="product-card">
          <div class="product-image-container">
            <a href="product.html?id=${p.id}">
              <img class="product-image" src="${img}" alt="${p.name}" onerror="this.onerror=null; this.src='public/images/default.jpg'">
            </a>
          </div>
          <div class="product-info">
            <h4 class="product-title">
              <a href="product.html?id=${p.id}">${p.name}</a>
            </h4>
            <div class="product-pricing">
              <span class="product-price">${formatCurrency(curPrice)}</span>
            </div>
          </div>
        </article>
      `;
    }).join('');
  } catch (e) {
    console.warn('Could not load related products:', e);
  }
}

function getColorHex(name) {
  const map = {
    'Camel': '#c19a6b',
    'Charcoal': '#36454f',
    'Black': '#18181b',
    'White': '#ffffff',
    'Oatmeal': '#e3dac9',
    'Sky Blue': '#87ceeb',
    'Olive': '#556b2f',
    'Champagne': '#fad6a5',
    'Midnight': '#191970',
    'Beige': '#f5f5dc',
    'Sand': '#c2b280',
    'Navy': '#1e293b',
    'Grey': '#808080',
    'Indigo': '#3949ab',
    'Heather Grey': '#9e9e9e'
  };
  return map[name] || '#71717a';
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('product-detail-container')) {
    loadProduct();
  }
});
