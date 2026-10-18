"""Root URL configuration for the Threadly backend."""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("users.urls")),
    path("api/", include("products.urls")),
    path("api/orders/", include("orders.urls")),
]
