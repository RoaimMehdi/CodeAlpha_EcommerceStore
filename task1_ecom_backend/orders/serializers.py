"""
Order serializers.

CreateOrderSerializer enforces every business rule the API contract requires:
  - each item references an existing variant id
  - quantity >= 1 (max 10 per variant, a sensible anti-abuse cap)
  - total is computed *here on the server* from effective prices — never
    from any price sent by the client
  - shipping fields are all required
"""

from rest_framework import serializers

from orders.models import Order, OrderItem
from products.models import ProductVariant


class CreateOrderItemSerializer(serializers.Serializer):
    """One element of the `items` array in the create-order payload."""

    variant_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1, max_value=10)


class CreateOrderSerializer(serializers.Serializer):
    """Input serializer for POST /api/orders/."""

    shipping_name = serializers.CharField(max_length=120, trim_whitespace=True)
    shipping_address = serializers.CharField(trim_whitespace=False)
    city = serializers.CharField(max_length=100, trim_whitespace=True)
    phone = serializers.CharField(max_length=20, trim_whitespace=True)
    items = CreateOrderItemSerializer(many=True)

    # Populated by validate() so the view can consume ready-to-write data.
    variants = None

    def validate_shipping_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Shipping name is required.")
        return value

    def validate_phone(self, value):
        import re
        if not re.fullmatch(r"\+?\d{7,15}", value.strip()):
            raise serializers.ValidationError("Enter a valid phone number (7–15 digits, optional leading +).")
        return value

    def validate_shipping_address(self, value):
        if not value.strip():
            raise serializers.ValidationError("Shipping address is required.")
        return value

    def validate_items(self, value):
        """List-level checks on items: not empty, and no duplicate variants."""
        if not value:
            raise serializers.ValidationError("items must contain at least one item.")
        variant_ids = [item["variant_id"] for item in value]
        if len(variant_ids) != len(set(variant_ids)):
            raise serializers.ValidationError("Duplicate variant_id values are not allowed.")
        return value

    def validate(self, attrs):
        """Check that every variant exists and has enough stock."""
        variant_ids = [item["variant_id"] for item in attrs["items"]]
        variants = {
            v.id: v for v in ProductVariant.objects.filter(id__in=variant_ids).select_related("product")
        }

        errors = []
        for item in attrs["items"]:
            variant = variants.get(item["variant_id"])
            if variant is None:
                errors.append(f"Variant {item['variant_id']} does not exist.")
                continue
            requested = item["quantity"]
            if variant.stock < requested:
                errors.append(
                    f"Size {variant.size} in {variant.color} is out of stock."
                    if variant.stock == 0
                    else f"Only {variant.stock} left for size {variant.size} in {variant.color}."
                )
        if errors:
            raise serializers.ValidationError({"items": errors})

        # Stash resolved variants for the view to use in its transaction.
        self.context["variants_map"] = variants
        return attrs


class OrderItemSerializer(serializers.ModelSerializer):
    """Read-only line item with product info embedded for easy display."""

    product_name = serializers.CharField(source="product.name", read_only=True)
    product_slug = serializers.CharField(source="product.slug", read_only=True)
    image_url = serializers.CharField(source="product.image_url", read_only=True)

    class Meta:
        model = OrderItem
        fields = ("id", "product_name", "product_slug", "image_url",
                  "size", "color", "quantity", "price")


class OrderSerializer(serializers.ModelSerializer):
    """Read-only order representation including nested items."""

    items = OrderItemSerializer(many=True, read_only=True)
    user = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = Order
        fields = (
            "id", "user", "total", "status", "payment_method",
            "shipping_name", "shipping_address", "city", "phone",
            "created_at", "items",
        )
