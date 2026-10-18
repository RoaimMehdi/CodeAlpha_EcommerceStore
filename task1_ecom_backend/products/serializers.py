"""
Catalog serializers: categories, products, product detail with variants.
"""

from rest_framework import serializers

from .models import Category, Product, ProductVariant


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ("id", "name", "slug")


class ProductVariantSerializer(serializers.ModelSerializer):
    """Nested variant shown in the product detail payload."""

    class Meta:
        model = ProductVariant
        fields = ("id", "size", "color", "stock")


class ProductListSerializer(serializers.ModelSerializer):
    """Compact product representation used for list views."""

    category_name = serializers.CharField(source="category.name", read_only=True)
    # Price actually charged: discount_price if set, else price.
    effective_price = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            "id", "name", "slug", "price", "discount_price", "effective_price",
            "image_url", "category_name", "gender", "is_featured", "is_active",
            "created_at",
        )

    def get_effective_price(self, instance: Product):
        return instance.effective_price()


class ProductDetailSerializer(ProductListSerializer):
    """Product detail including its variants (sizes/colors/stock)."""

    category = serializers.CharField(source="category.name", read_only=True)
    variants = ProductVariantSerializer(many=True, read_only=True)

    class Meta(ProductListSerializer.Meta):
        fields = ProductListSerializer.Meta.fields + ("description", "category", "variants")
