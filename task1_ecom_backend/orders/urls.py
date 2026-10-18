"""Order routes: /api/orders/."""

from django.urls import path

from .views import OrderDetailAPIView, OrderListCreateAPIView

urlpatterns = [
    path("", OrderListCreateAPIView.as_view(), name="orders-list-create"),
    path("<int:order_id>/", OrderDetailAPIView.as_view(), name="orders-detail"),
]
