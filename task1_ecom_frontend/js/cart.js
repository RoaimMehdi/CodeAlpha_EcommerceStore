/**
 * Threadly - Cart Service & State Management
 * Persists cart items in localStorage unique by variant_id.
 * Synchronizes cart counter badge across all pages.
 */

import { formatCurrency, showToast } from './api.js';

const CART_STORAGE_KEY = 'threadly_cart';

export function getCart() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error parsing cart from localStorage', e);
    return [];
  }
}

export function saveCart(cart) {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  updateCartBadge();
  window.dispatchEvent(new CustomEvent('threadly:cartUpdated', { detail: { cart } }));
}

export function addToCart({ variantId, productId, name, price, originalPrice, image, size, color, quantity = 1, stock = 99 }) {
  if (!variantId) {
    console.error('Cannot add to cart: variantId is required');
    return false;
  }

  const cart = getCart();
  const existingIndex = cart.findIndex(item => String(item.variant_id) === String(variantId));

  if (existingIndex > -1) {
    const currentQty = cart[existingIndex].quantity;
    const newQty = Math.min(currentQty + quantity, stock);
    
    if (newQty === currentQty && currentQty >= stock) {
      showToast(`Maximum stock limit (${stock}) reached for this variant.`, 'warning');
      return false;
    }

    cart[existingIndex].quantity = newQty;
  } else {
    cart.push({
      variant_id: variantId,
      product_id: productId,
      name,
      price: parseFloat(price),
      original_price: originalPrice ? parseFloat(originalPrice) : null,
      image,
      size,
      color,
      quantity: Math.min(quantity, stock),
      stock
    });
  }

  saveCart(cart);
  showToast(`"${name}" (${size} / ${color}) added to your bag.`);
  return true;
}

export function updateQuantity(variantId, newQuantity) {
  let cart = getCart();
  const index = cart.findIndex(item => String(item.variant_id) === String(variantId));

  if (index === -1) return;

  const item = cart[index];
  const maxStock = item.stock || 99;
  const targetQty = parseInt(newQuantity, 10);

  if (isNaN(targetQty) || targetQty <= 0) {
    removeFromCart(variantId);
    return;
  }

  item.quantity = Math.min(targetQty, maxStock);
  saveCart(cart);
}

export function removeFromCart(variantId) {
  let cart = getCart();
  const removedItem = cart.find(item => String(item.variant_id) === String(variantId));
  cart = cart.filter(item => String(item.variant_id) !== String(variantId));
  saveCart(cart);

  if (removedItem) {
    showToast(`Removed "${removedItem.name}" from your bag.`, 'info');
  }
}

export function clearCart() {
  localStorage.removeItem(CART_STORAGE_KEY);
  updateCartBadge();
  window.dispatchEvent(new CustomEvent('threadly:cartUpdated', { detail: { cart: [] } }));
}

export function getCartCount() {
  const cart = getCart();
  return cart.reduce((total, item) => total + (item.quantity || 0), 0);
}

export function getCartSubtotal() {
  const cart = getCart();
  return cart.reduce((total, item) => total + ((item.price || 0) * (item.quantity || 0)), 0);
}

export function updateCartBadge() {
  const count = getCartCount();
  const badges = document.querySelectorAll('.cart-badge');
  badges.forEach(badge => {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  });
}

let appliedDiscountRate = 0; // e.g. 0.1 for 10% coupon

export function initCartPage() {
  const cartContainer = document.getElementById('cart-items-container');
  const emptyState = document.getElementById('cart-empty-state');
  const cartContent = document.getElementById('cart-content-wrapper');

  if (!cartContainer) return;

  function render() {
    const cart = getCart();

    if (cart.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      if (cartContent) cartContent.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (cartContent) cartContent.style.display = 'grid';

    cartContainer.innerHTML = cart.map(item => {
      const lineTotal = item.price * item.quantity;
      return `
        <tr data-variant-id="${item.variant_id}">
          <td>
            <div class="cart-product-cell">
              <a href="product.html?id=${item.product_id}" class="cart-product-thumb">
                <img src="${item.image}" alt="${item.name}" onerror="this.onerror=null; this.src='public/images/default.jpg'">
              </a>
              <div>
                <a href="product.html?id=${item.product_id}" class="cart-product-name">${item.name}</a>
                <div class="cart-variant-badge">
                  <span>Size: <strong>${item.size}</strong></span>
                  <span>Color: <strong>${item.color}</strong></span>
                </div>
              </div>
            </div>
          </td>
          <td>
            <span class="font-accent" style="font-weight: 600;">${formatCurrency(item.price)}</span>
          </td>
          <td>
            <div class="qty-stepper">
              <button class="qty-btn btn-cart-minus" data-id="${item.variant_id}" aria-label="Decrease quantity">−</button>
              <input type="number" class="qty-input cart-qty-input" data-id="${item.variant_id}" value="${item.quantity}" min="1" max="${item.stock || 99}">
              <button class="qty-btn btn-cart-plus" data-id="${item.variant_id}" aria-label="Increase quantity">+</button>
            </div>
          </td>
          <td>
            <span class="font-accent" style="font-weight: 700; color: var(--text-main);">${formatCurrency(lineTotal)}</span>
          </td>
          <td>
            <button class="cart-remove-btn" data-id="${item.variant_id}" title="Remove item" aria-label="Remove item">
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    updateSummary();
  }

  function updateSummary() {
    const subtotal = getCartSubtotal();
    const shipping = subtotal > 3000 || subtotal === 0 ? 0.00 : 250.00;
    const discount = subtotal * appliedDiscountRate;
    const total = Math.max(0, subtotal - discount + shipping);

    const elSubtotal = document.getElementById('summary-subtotal');
    const elShipping = document.getElementById('summary-shipping');
    const elDiscountRow = document.getElementById('summary-discount-row');
    const elDiscount = document.getElementById('summary-discount');
    const elTotal = document.getElementById('summary-total');

    if (elSubtotal) elSubtotal.textContent = formatCurrency(subtotal);
    if (elShipping) elShipping.textContent = shipping === 0 ? 'FREE' : formatCurrency(shipping);
    
    if (elDiscountRow && elDiscount) {
      if (discount > 0) {
        elDiscountRow.style.display = 'flex';
        elDiscount.textContent = `-${formatCurrency(discount)}`;
      } else {
        elDiscountRow.style.display = 'none';
      }
    }

    if (elTotal) elTotal.textContent = formatCurrency(total);
  }

  cartContainer.addEventListener('click', (e) => {
    const minusBtn = e.target.closest('.btn-cart-minus');
    const plusBtn = e.target.closest('.btn-cart-plus');
    const removeBtn = e.target.closest('.cart-remove-btn');

    if (minusBtn) {
      const vId = minusBtn.dataset.id;
      const item = getCart().find(i => String(i.variant_id) === String(vId));
      if (item) updateQuantity(vId, item.quantity - 1);
      render();
    } else if (plusBtn) {
      const vId = plusBtn.dataset.id;
      const item = getCart().find(i => String(i.variant_id) === String(vId));
      if (item) updateQuantity(vId, item.quantity + 1);
      render();
    } else if (removeBtn) {
      const vId = removeBtn.dataset.id;
      removeFromCart(vId);
      render();
    }
  });

  cartContainer.addEventListener('change', (e) => {
    const input = e.target.closest('.cart-qty-input');
    if (input) {
      const vId = input.dataset.id;
      updateQuantity(vId, parseInt(input.value, 10));
      render();
    }
  });

  const couponForm = document.getElementById('coupon-form');
  if (couponForm) {
    couponForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const codeInput = document.getElementById('coupon-input');
      const code = codeInput?.value.trim().toUpperCase();

      if (code === 'THREADLY10' || code === 'WELCOME10') {
        appliedDiscountRate = 0.10;
        showToast('10% promotional discount applied!');
        updateSummary();
      } else {
        showToast('Invalid coupon code. Try "THREADLY10"', 'error');
      }
    });
  }

  render();
  window.addEventListener('threadly:cartUpdated', render);
}

document.addEventListener('DOMContentLoaded', () => {
  updateCartBadge();
  initCartPage();
});

window.ThreadlyCart = {
  getCart,
  addToCart,
  updateQuantity,
  removeFromCart,
  clearCart,
  getCartCount,
  getCartSubtotal,
  updateCartBadge
};
