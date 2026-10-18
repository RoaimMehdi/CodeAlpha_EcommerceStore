"""
Catalog views: categories, product list (filter/search/sort), featured list,
and product detail by slug-or-id. All catalog endpoints are public.
"""

from django.db.models import DecimalField
from django.db.models.functions import Coalesce
from django_filters import rest_framework as df_filters
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions
from rest_framework.filters import OrderingFilter, SearchFilter

from .models import Category, Product
from .serializers import (
    CategorySerializer,
    ProductDetailSerializer,
    ProductListSerializer,
)

# Coalesce(discount_price, price) — the price actually charged.
EFFECTIVE_PRICE = Coalesce("discount_price", "price", output_field=DecimalField(max_digits=10, decimal_places=2))


class ProductFilterSet(df_filters.FilterSet):
    """
    Filters for GET /api/products/:

    - category: slug (e.g. "t-shirts") or numeric category id
    - gender: Men | Women | Kids | Unisex
    - min_price / max_price: applied to the *effective* price (discount
      honored), not the raw list price
    - size / color: product must have an in-stock variant matching
    """

    min_price = df_filters.NumberFilter(method="filter_min_effective_price")
    max_price = df_filters.NumberFilter(method="filter_max_effective_price")
    size = df_filters.CharFilter(method="filter_variant_size")
    color = df_filters.CharFilter(method="filter_variant_color")
    category = df_filters.CharFilter(method="filter_category")
    gender = df_filters.CharFilter(field_name="gender", lookup_expr="iexact")

    class Meta:
        model = Product
        fields = []

    @staticmethod
    def _effective_qs(queryset):
        return queryset.annotate(_effective=EFFECTIVE_PRICE)

    def filter_category(self, queryset, name, value):
        """Match a category by slug, or by numeric id as a fallback."""
        value = value.strip()
        if value.isdigit():
            return queryset.filter(category_id=int(value))
        return queryset.filter(category__slug=value.lower())

    def filter_min_effective_price(self, queryset, name, value):
        return self._effective_qs(queryset).filter(_effective__gte=value)

    def filter_max_effective_price(self, queryset, name, value):
        return self._effective_qs(queryset).filter(_effective__lte=value)

    def filter_variant_size(self, queryset, name, value):
        # In-stock variants only; distinct() because of the variant join.
        return queryset.filter(variants__size=value.strip().upper(), variants__stock__gt=0).distinct()

    def filter_variant_color(self, queryset, name, value):
        return queryset.filter(variants__color__iexact=value.strip(), variants__stock__gt=0).distinct()


class EffectivePriceOrderingFilter(OrderingFilter):
    """
    OrderingFilter that understands ?ordering=price / -price as the EFFECTIVE
    price. We translate the client's "price" keyword to the `_effective`
    annotation added in get_queryset(); anything else (e.g. -created_at)
    passes through untouched. Only fields listed in the view's
    ordering_fields are accepted.
    """

    def get_ordering(self, request, queryset, view):
        allowed = {f.lstrip("-") for f in view.ordering_fields}
        raw = request.query_params.get(self.ordering_param)
        if not raw:
            return None  # fall back to the view's default ordering
        result = []
        for field in (p.strip() for p in raw.split(",")):
            key = field.lstrip("-")
            if key not in allowed:
                continue  # silently drop unknown fields
            if key == "price":
                field = ("-" if field.startswith("-") else "") + "_effective"
            result.append(field)
        return result or None


class SearchQFilter(SearchFilter):
    """SearchFilter subclass that reads ?q= instead of the default ?search=."""

    search_param = "q"


class CategoryListView(generics.ListAPIView):
    """GET /api/categories/ — public list of all categories."""

    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    authentication_classes = ()
    permission_classes = (permissions.AllowAny,)
    pagination_class = None  # 7 categories; paging would be noise


class ProductListAPIView(generics.ListAPIView):
    """
    GET /api/products/

    Public, paginated (12/page). Supports:
      ?q=<search in name/description>
      ?category=t-shirts | ?category=3
      ?gender=Men
      ?min_price=1000  ?max_price=5000
      ?size=M  ?color=Black
      ?ordering=price | -price | -created_at
    """

    serializer_class = ProductListSerializer
    authentication_classes = ()
    permission_classes = (permissions.AllowAny,)
    filter_backends = (
        df_filters.DjangoFilterBackend,
        SearchQFilter,  # ?q=
        EffectivePriceOrderingFilter,
    )
    filterset_class = ProductFilterSet
    search_param = "q"   # spec: ?q=<search>
    search_fields = ("name", "description")
    # Allowlist: clients may only sort by these fields.
    ordering_fields = ("price", "created_at")
    ordering = ("-created_at",)  # default: newest first

    def get_queryset(self):
        # Always annotate the effective price; DjangoFilterBackend uses it for
        # min_price/max_price and the ordering filter for ?ordering=price.
        return (
            Product.objects.filter(is_active=True)
            .annotate(_effective=EFFECTIVE_PRICE)
            .select_related("category")
        )


class FeaturedProductListView(generics.ListAPIView):
    """GET /api/products/featured/ — featured active products."""

    queryset = Product.objects.filter(is_active=True, is_featured=True)
    serializer_class = ProductListSerializer
    authentication_classes = ()
    permission_classes = (permissions.AllowAny,)
    pagination_class = None


class ProductDetailAPIView(generics.RetrieveAPIView):
    """
    GET /api/products/<slug-or-id>/

    Public detail. Looks up by numeric id first, otherwise by slug.
    """

    serializer_class = ProductDetailSerializer
    authentication_classes = ()
    permission_classes = (permissions.AllowAny,)
    lookup_url_kwarg = "identifier"

    def get_object(self):
        identifier = self.kwargs["identifier"]
        if identifier.isdigit():
            return get_object_or_404(Product.objects.filter(is_active=True), pk=int(identifier))
        return get_object_or_404(Product.objects.filter(is_active=True), slug=identifier)
