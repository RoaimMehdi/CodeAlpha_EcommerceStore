"""
Product models: Category, Product, ProductVariant.

A Product holds the catalogue-facing data (name, prices, description) while
ProductVariant captures purchasable combinations of size + color with its own
stock count. Orders reference variants, not products, so inventory is tracked
per size/color combination.
"""

from django.db import models


class Category(models.Model):
    """Top-level clothing category (T-Shirts, Hoodies, Jeans, ...)."""

    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=120, unique=True)

    class Meta:
        verbose_name_plural = "Categories"
        ordering = ("name",)

    def __str__(self) -> str:
        return self.name


class Product(models.Model):
    """A clothing item sold by Threadly."""

    class Gender(models.TextChoices):
        MEN = "Men", "Men"
        WOMEN = "Women", "Women"
        KIDS = "Kids", "Kids"
        UNISEX = "Unisex", "Unisex"

    name = models.CharField(max_length=200, db_index=True)
    slug = models.SlugField(max_length=220, unique=True)
    description = models.TextField()
    # Price is stored as a decimal; discount_price is the optional sale price.
    price = models.DecimalField(max_digits=10, decimal_places=2)
    discount_price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    image_url = models.URLField(max_length=500)
    category = models.ForeignKey(
        Category, on_delete=models.PROTECT, related_name="products"
    )
    gender = models.CharField(
        max_length=10, choices=Gender.choices, db_index=True
    )
    is_featured = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return self.name

    def effective_price(self):
        """Price actually charged: discount_price if set, otherwise price."""
        return self.discount_price if self.discount_price is not None else self.price


class ProductVariant(models.Model):
    """A purchasable product combination: size + color with its own stock."""

    class Size(models.TextChoices):
        XS = "XS", "XS"
        S = "S", "S"
        M = "M", "M"
        L = "L", "L"
        XL = "XL", "XL"
        XXL = "XXL", "XXL"

    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="variants"
    )
    size = models.CharField(max_length=5, choices=Size.choices)
    color = models.CharField(max_length=50)
    stock = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            # The same product can't have two variants of the same size+color.
            models.UniqueConstraint(
                fields=("product", "size", "color"),
                name="unique_variant_per_product",
            )
        ]

    def __str__(self) -> str:
        return f"{self.product.name} – {self.size} – {self.color}"
