/**
 * Threadly - Orders History Page Logic
 * Retrieves past orders from GET /api/orders/
 * Displays order cards, item breakdowns, and status badges.
 */

import { ordersAPI, normalizeImageUrl, formatCurrency } from './api.js';
import { requireAuth } from './auth.js';

export async function initOrdersPage() {
  const container = document.getElementById('orders-list-container');
  if (!container) return;

  if (!requireAuth('orders.html')) {
    return;
  }

  renderSkeletons(container);

  try {
    const data = await ordersAPI.getAll();
    const orders = Array.isArray(data) ? data : (data?.results || data?.value || []);

    if (orders.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
            </svg>
          </div>
          <h3>No Orders Found</h3>
          <p>You haven't placed any orders yet. Discover our latest wardrobe essentials.</p>
          <a href="shop.html" class="btn btn-primary" style="margin-top: 1rem;">Explore Collection</a>
        </div>
      `;
      return;
    }

    container.innerHTML = orders.map(order => {
      const orderNumber = order.order_number || `TH-${order.id}`;
      const dateFormatted = order.created_at ? new Date(order.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }) : 'Recent';

      const status = order.status || 'Pending';
      const statusClass = getStatusClass(status);
      const totalAmount = order.total || order.total_amount || order.total_price || calculateOrderTotal(order.items);

      return `
        <article class="order-card">
          <header class="order-card-header">
            <div class="order-header-meta">
              <div class="order-meta-item">
                <span class="order-meta-label">Order Reference</span>
                <span class="order-meta-value">${orderNumber}</span>
              </div>
              <div class="order-meta-item">
                <span class="order-meta-label">Date Placed</span>
                <span class="order-meta-value">${dateFormatted}</span>
              </div>
              <div class="order-meta-item">
                <span class="order-meta-label">Total Payable</span>
                <span class="order-meta-value font-accent" style="color: var(--accent);">${formatCurrency(totalAmount)}</span>
              </div>
            </div>
            <div>
              <span class="badge badge-status ${statusClass}">${status}</span>
            </div>
          </header>

          <div class="order-items-list">
            ${renderOrderItems(order.items || [])}
          </div>

          <footer class="order-card-footer">
            <div>
              <strong>Consigned to:</strong> ${order.shipping_name || 'Customer'} &bull; ${order.shipping_address || ''}, ${order.city || ''}
            </div>
            <div style="font-weight: 500; color: var(--text-muted);">
              Payment: ${order.payment_method || 'Cash on Delivery'}
            </div>
          </footer>
        </article>
      `;
    }).join('');

  } catch (err) {
    console.error('Error fetching orders:', err);
    container.innerHTML = `
      <div class="empty-state">
        <h3>Could not load your orders</h3>
        <p>${err.message || 'Please check your connection to the server.'}</p>
        <button onclick="window.location.reload()" class="btn btn-primary btn-sm">Retry</button>
      </div>
    `;
  }
}

function renderOrderItems(items) {
  if (!items || items.length === 0) {
    return `<p class="text-muted" style="padding: 1rem 0;">Order item details unavailable.</p>`;
  }

  return items.map(item => {
    const name = item.product_name || item.name || 'Threadly Apparel';
    const size = item.size || 'Standard';
    const color = item.color || 'Classic';
    const qty = item.quantity || 1;
    const price = item.price || 0;
    const imgUrl = normalizeImageUrl(item.image_url || item.image, item.product_slug);

    return `
      <div class="order-item-row">
        <div class="order-item-detail">
          <div class="order-item-thumb">
            <img src="${imgUrl}" alt="${name}" onerror="this.onerror=null; this.src='public/images/default.jpg'">
          </div>
          <div>
            <h4 style="font-size: 0.95rem; font-weight: 600; margin-bottom: 0.25rem;">${name}</h4>
            <div style="font-size: 0.8rem; color: var(--text-muted);">
              Size: <strong>${size}</strong> &bull; Color: <strong>${color}</strong> &bull; Qty: <strong>${qty}</strong>
            </div>
          </div>
        </div>
        <div style="font-family: var(--font-accent); font-weight: 700; font-size: 0.95rem;">
          ${formatCurrency(parseFloat(price) * qty)}
        </div>
      </div>
    `;
  }).join('');
}

function calculateOrderTotal(items) {
  if (!items) return 0;
  return items.reduce((acc, it) => acc + (parseFloat(it.price || 0) * (it.quantity || 1)), 0);
}

function getStatusClass(status) {
  const s = String(status).toLowerCase();
  if (s.includes('deliver')) return 'status-delivered';
  if (s.includes('ship')) return 'status-shipped';
  if (s.includes('process')) return 'status-processing';
  if (s.includes('cancel')) return 'status-cancelled';
  return 'status-pending';
}

function renderSkeletons(container) {
  container.innerHTML = Array.from({ length: 3 }).map(() => `
    <div class="order-card" style="padding: 1.5rem;">
      <div class="skeleton" style="height: 24px; width: 45%; margin-bottom: 1.5rem;"></div>
      <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem;">
        <div class="skeleton" style="width: 60px; height: 75px; border-radius: var(--radius-sm);"></div>
        <div style="flex: 1;">
          <div class="skeleton" style="height: 16px; width: 60%; margin-bottom: 0.5rem;"></div>
          <div class="skeleton" style="height: 14px; width: 35%;"></div>
        </div>
      </div>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('orders-list-container')) {
    initOrdersPage();
  }
});
