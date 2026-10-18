/**
 * Threadly - Checkout Page Logic
 * Handles authentication checks, order summary calculation,
 * shipping form submission to POST /api/orders/, and order success screen.
 */

import { ordersAPI, formatCurrency, showToast } from './api.js';
import { requireAuth, getUser } from './auth.js';
import { getCart, getCartSubtotal, clearCart } from './cart.js';

let isSubmitting = false;

export function initCheckoutPage() {
  const form = document.getElementById('checkout-form');
  if (!form) return;

  if (!requireAuth('checkout.html')) {
    return;
  }

  const cart = getCart();
  if (cart.length === 0) {
    showToast('Your shopping bag is empty. Please select items first.', 'warning');
    setTimeout(() => {
      window.location.href = 'shop.html';
    }, 1200);
    return;
  }

  prefillUserInfo();
  renderOrderSummary(cart);
  form.addEventListener('submit', handleOrderSubmit);
}

function prefillUserInfo() {
  const user = getUser();
  if (!user) return;

  const nameInput = document.getElementById('shipping-name');
  if (nameInput && !nameInput.value) {
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || '';
    nameInput.value = fullName;
  }
}

function renderOrderSummary(cart) {
  const itemsContainer = document.getElementById('checkout-items-list');
  const subtotalEl = document.getElementById('checkout-subtotal');
  const shippingEl = document.getElementById('checkout-shipping');
  const totalEl = document.getElementById('checkout-total');

  if (!itemsContainer) return;

  const subtotal = getCartSubtotal();
  const shipping = subtotal > 3000 ? 0.00 : 250.00;
  const total = subtotal + shipping;

  itemsContainer.innerHTML = cart.map(item => `
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-light);">
      <div style="display: flex; align-items: center; gap: 0.85rem;">
        <img src="${item.image}" alt="${item.name}" style="width: 50px; height: 60px; object-fit: cover; border-radius: var(--radius-sm);" onerror="this.onerror=null; this.src='public/images/default.jpg'">
        <div>
          <h5 style="font-size: 0.92rem; font-weight: 600; margin-bottom: 0.2rem;">${item.name}</h5>
          <div style="font-size: 0.78rem; color: var(--text-muted);">
            Size: <strong>${item.size}</strong> &bull; Color: <strong>${item.color}</strong> &bull; Qty: <strong>${item.quantity}</strong>
          </div>
        </div>
      </div>
      <div style="font-family: var(--font-accent); font-weight: 600; font-size: 0.92rem;">
        ${formatCurrency(item.price * item.quantity)}
      </div>
    </div>
  `).join('');

  if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);
  if (shippingEl) shippingEl.textContent = shipping === 0 ? 'FREE' : formatCurrency(shipping);
  if (totalEl) totalEl.textContent = formatCurrency(total);
}

async function handleOrderSubmit(e) {
  e.preventDefault();

  if (isSubmitting) return;

  const cart = getCart();
  if (cart.length === 0) {
    showToast('Your bag is empty.', 'error');
    return;
  }

  const shippingName = document.getElementById('shipping-name')?.value.trim();
  const shippingAddress = document.getElementById('shipping-address')?.value.trim();
  const city = document.getElementById('shipping-city')?.value.trim();
  const phone = document.getElementById('shipping-phone')?.value.trim();
  const errorAlert = document.getElementById('checkout-error-alert');
  const submitBtn = document.getElementById('place-order-btn');

  if (errorAlert) {
    errorAlert.style.display = 'none';
    errorAlert.textContent = '';
  }

  if (!shippingName || !shippingAddress || !city || !phone) {
    if (errorAlert) {
      errorAlert.textContent = 'Please complete all required shipping fields.';
      errorAlert.style.display = 'block';
    }
    showToast('Please complete all shipping fields.', 'warning');
    return;
  }

  isSubmitting = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="spinner" style="margin: 0 auto;"></div>';
  }

  try {
    const orderPayload = {
      shipping_name: shippingName,
      shipping_address: shippingAddress,
      city: city,
      phone: phone,
      items: cart.map(item => ({
        variant_id: parseInt(item.variant_id, 10),
        quantity: parseInt(item.quantity, 10)
      }))
    };

    const response = await ordersAPI.create(orderPayload);
    clearCart();
    showOrderSuccess(response);

  } catch (err) {
    console.error('Order creation failed:', err);
    if (errorAlert) {
      errorAlert.textContent = err.data?.detail || err.message || 'Failed to place order. Please review your information.';
      errorAlert.style.display = 'block';
    }
    showToast('Unable to complete order. Please try again.', 'error');
  } finally {
    isSubmitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Place Order &rarr;';
    }
  }
}

function showOrderSuccess(order) {
  const modal = document.getElementById('order-success-modal');
  const orderNumEl = document.getElementById('modal-order-number');
  const addressEl = document.getElementById('modal-shipping-summary');

  const orderNum = order.order_number || `TH-${order.id || Math.floor(Math.random() * 900000 + 100000)}`;

  if (orderNumEl) orderNumEl.textContent = orderNum;
  if (addressEl) {
    addressEl.textContent = `${order.shipping_name}, ${order.shipping_address}, ${order.city} (Phone: ${order.phone})`;
  }

  if (modal) {
    modal.classList.add('open');
  } else {
    alert(`Order #${orderNum} placed successfully! Thank you for choosing Threadly.`);
    window.location.href = 'orders.html';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('checkout-form')) {
    initCheckoutPage();
  }
});
