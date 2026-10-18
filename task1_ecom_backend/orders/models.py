"""
Order models: Order, OrderItem.

An Order is a purchase by a single user. OrderItem lines reference the exact
ProductVariant bought and snapshot the unit price at time of purchase so later
price/discount changes don't rewrite history.
"""

from django.conf import settings
from django.db import models


class Order(models.Model):
    """A customer order with shipping details and payment status."""

    class Status(models.TextChoices):
        PENDING = "Pending", "Pending"
        PAID = "Paid", "Paid"
        SHIPPED = "Shipped", "Shipped"
        DELIVERED = "Delivered", "Delivered"
        CANCELLED = "Cancelled", "Cancelled"

    class PaymentMethod(models.TextChoices):
        COD = "Cash on Delivery", "Cash on Delivery"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="orders",
        db_index=True,
    )
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    shipping_name = models.CharField(max_length=120)
    shipping_address = models.TextField()
    city = models.CharField(max_length=100)
    phone = models.CharField(max_length=20)
    payment_method = models.CharField(
        max_length=50, choices=PaymentMethod.choices,
        default=PaymentMethod.COD,
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"Order #{self.id} – {self.user.username} – {self.status}"


class OrderItem(models.Model):
    """One line item of an order (a specific variant and quantity)."""

    order = models.ForeignKey(
        Order, on_delete=models.CASCADE, related_name="items"
    )
    product = models.ForeignKey(
        "products.Product", on_delete=models.PROTECT, related_name="order_items"
    )
    variant = models.ForeignKey(
        "products.ProductVariant", on_delete=models.PROTECT, related_name="order_items"
    )
    quantity = models.PositiveIntegerField()
    # Snapshot of the unit price (discount applied) at purchase time.
    price = models.DecimalField(max_digits=10, decimal_places=2)
    # Denormalized size/color so item history survives variant edits.
    size = models.CharField(max_length=5)
    color = models.CharField(max_length=50)

    def __str__(self) -> str:
        return f"{self.quantity} × {self.product.name} ({self.size}/{self.color})"
