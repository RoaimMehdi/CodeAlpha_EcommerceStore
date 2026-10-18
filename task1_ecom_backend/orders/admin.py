"""Admin for the orders app — Order list with inline OrderItem."""

from django.contrib import admin

from .models import Order, OrderItem


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ("product", "variant", "size", "color", "quantity", "price")


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    order_history_note = None  # informational no-op

    list_display = ("id", "user", "total", "status", "payment_method",
                    "shipping_name", "city", "created_at")
    list_filter = ("status", "payment_method", "city")
    search_fields = ("user__username", "shipping_name", "phone", "id")
    # Show item lines inline; new lines usually come via the API, not admin.
    inlines = [OrderItemInline]
    date_hierarchy = "created_at"


# Django's built-in User for the users app is registered in users/admin.py.
