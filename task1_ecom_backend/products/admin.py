"""Admin for the products app — Category list, Product with inline variants."""

from django.contrib import admin

from .models import Category, Product, ProductVariant


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "slug")
    list_display_links = ("name",)
    search_fields = ("name",)
    prepopulated_fields = {"slug": ("name",)}


class ProductVariantInline(admin.TabularInline):
    """Add/edit ProductVariant rows directly inside the Product page."""

    model = ProductVariant
    extra = 1
    fields = ("size", "color", "stock")


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "category", "gender", "price", "discount_price",
                    "is_featured", "is_active", "created_at")
    list_filter = ("category", "gender", "is_featured", "is_active")
    search_fields = ("name", "description")
    prepopulated_fields = {"slug": ("name",)}
    inlines = [ProductVariantInline]

    # Group editability: featured/active are quick one-flag toggles.
    list_editable = ("is_featured", "is_active")
