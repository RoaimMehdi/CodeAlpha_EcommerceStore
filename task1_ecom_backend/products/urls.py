"""Catalog routes: /api/categories/ and /api/products/."""

from django.urls import path

from .views import (
    CategoryListView,
    FeaturedProductListView,
    ProductDetailAPIView,
    ProductListAPIView,
)

urlpatterns = [
    path("categories/", CategoryListView.as_view(), name="categories"),
    # "featured" must be matched BEFORE the generic <slug-or-id> pattern,
    # otherwise Django would try to look up a product with slug "featured".
    path("products/featured/", FeaturedProductListView.as_view(), name="products-featured"),
    path("products/", ProductListAPIView.as_view(), name="products-list"),
    path("products/<slug:identifier>/", ProductDetailAPIView.as_view(), name="products-detail-slug"),
    path("products/<str:identifier>/", ProductDetailAPIView.as_view(), name="products-detail-id"),
]
