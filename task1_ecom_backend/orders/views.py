"""
Order views.

POST /api/orders/  – create an order; stock is validated and deducted inside
                     transaction.atomic() with select_for_update() row locks on
                     the variants, and the total is always computed server-side.
GET  /api/orders/  – list the current user's orders only.
GET  /api/orders/<id>/ – retrieve an order only if it belongs to the user.
"""

from decimal import Decimal

from django.db import transaction
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from orders.models import Order, OrderItem
from orders.serializers import CreateOrderSerializer, OrderSerializer
from products.models import ProductVariant


class OrderListCreateAPIView(APIView):
    """GET (list own orders) + POST (create order). Requires a valid JWT."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        # Only ever return the requesting user's orders — never anybody else's.
        orders = (
            Order.objects.filter(user=request.user)
            .prefetch_related("items__product")
            .order_by("-created_at")
        )
        serializer = OrderSerializer(orders, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = CreateOrderSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        items = serializer.validated_data["items"]
        variants_map = serializer.context.get("variants_map", {})

        with transaction.atomic():
            # Lock variant rows for the duration of the transaction so two
            # concurrent checkouts can't both deduct from the same stock.
            variant_ids = list(variants_map.keys())
            locked_variants = {
                v.id: v
                for v in ProductVariant.objects.select_for_update().filter(id__in=variant_ids)
            }

            # Re-verify stock inside the lock (the validation outside ran before
            # any other request could grab stock in between).
            for item in items:
                variant = locked_variants[item["variant_id"]]
                if variant.stock < item["quantity"]:
                    if variant.stock == 0:
                        message = f"Size {variant.size} in {variant.color} is out of stock."
                    else:
                        message = (
                            f"Only {variant.stock} left for size {variant.size} "
                            f"in {variant.color}."
                        )
                    return Response({"items": [message]}, status=status.HTTP_400_BAD_REQUEST)

            # Compute the total server-side using effective prices.
            # Client-sent prices are never trusted.
            total = Decimal("0.00")
            item_rows = []
            for item in items:
                variant = locked_variants[item["variant_id"]]
                unit_price = variant.product.effective_price()
                quantity = item["quantity"]
                total += unit_price * quantity
                item_rows.append({
                    "variant": variant,
                    "quantity": quantity,
                    "price": unit_price,
                })

            order = Order.objects.create(
                user=request.user,
                total=total,
                shipping_name=serializer.validated_data["shipping_name"],
                shipping_address=serializer.validated_data["shipping_address"],
                city=serializer.validated_data["city"],
                phone=serializer.validated_data["phone"],
            )

            for row in item_rows:
                OrderItem.objects.create(
                    order=order,
                    product=row["variant"].product,
                    variant=row["variant"],
                    quantity=row["quantity"],
                    price=row["price"],
                    size=row["variant"].size,
                    color=row["variant"].color,
                )
                # Deduct variant stock now that items are safely persisted.
                row["variant"].stock -= row["quantity"]
                row["variant"].save(update_fields=["stock"])

        response = OrderSerializer(
            Order.objects.select_related("user").prefetch_related("items__product").get(pk=order.pk)
        )
        return Response(response.data, status=status.HTTP_201_CREATED)


class OrderDetailAPIView(APIView):
    """GET single order — only the owner may read it (403 otherwise)."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request, order_id):
        try:
            order = (
                Order.objects.select_related("user")
                .prefetch_related("items__product")
                .get(pk=order_id)
            )
        except Order.DoesNotExist:
            # 404 for both "no such order" and "not yours" would leak
            # existence; spec asks for 403 on foreign orders, so we 404 first.
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        if order.user_id != request.user.id:
            return Response({"detail": "You do not have permission to view this order."}, status=status.HTTP_403_FORBIDDEN)

        return Response(OrderSerializer(order).data)
