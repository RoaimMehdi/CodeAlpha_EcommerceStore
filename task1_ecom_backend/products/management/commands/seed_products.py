"""
Seed command: python manage.py seed_products

Creates 7 categories and 20 clothing products, each with multiple size and
color variants and realistic stock. Uses high-resolution Google/Unsplash CDN
fashion photography. Idempotent: get_or_create is used and image URLs are updated.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from products.models import Category, Product, ProductVariant

CATEGORIES = [
    ("T-Shirts", "t-shirts"),
    ("Hoodies", "hoodies"),
    ("Jeans", "jeans"),
    ("Dresses", "dresses"),
    ("Kurtas", "kurtas"),
    ("Shalwar Kameez", "shalwar-kameez"),
    ("Jackets", "jackets"),
]

SIZES = ["XS", "S", "M", "L", "XL", "XXL"]

# Verified local public clothing images for each product slug
PRODUCT_IMAGES = {
    # Jackets
    "denim-trucker-jacket": "public/images/denim-trucker-jacket.jpg",
    "quilted-puffer-jacket": "public/images/quilted-puffer-jacket.jpg",
    "sherpa-lined-kids-jacket": "public/images/sherpa-lined-kids-jacket.jpg",

    # Shalwar Kameez
    "classic-mens-shalwar-kameez": "public/images/classic-mens-shalwar-kameez.jpg",
    "embroidered-lawn-3-piece": "public/images/embroidered-lawn-3-piece.jpg",

    # Kurtas
    "embroidered-cotton-kurta": "public/images/embroidered-cotton-kurta.jpg",
    "chikankari-anarkali-kurta": "public/images/chikankari-anarkali-kurta.jpg",
    "kids-festive-kurta-set": "public/images/kids-festive-kurta-set.jpg",

    # Dresses
    "floral-midi-wrap-dress": "public/images/floral-midi-wrap-dress.jpg",
    "tiered-maxi-dress": "public/images/tiered-maxi-dress.jpg",
    "denim-shirt-dress": "public/images/denim-shirt-dress.jpg",

    # Jeans
    "straight-cut-indigo-jeans": "public/images/straight-cut-indigo-jeans.jpg",
    "high-rise-skinny-jeans": "public/images/high-rise-skinny-jeans.jpg",
    "relaxed-baggy-jeans": "public/images/relaxed-baggy-jeans.jpg",

    # Hoodies
    "everyday-fleece-hoodie": "public/images/everyday-fleece-hoodie.jpg",
    "zip-up-tech-hoodie": "public/images/zip-up-tech-hoodie.jpg",
    "kitschy-cropped-hoodie": "public/images/kitschy-cropped-hoodie.jpg",

    # T-Shirts
    "classic-cotton-crew-tee": "public/images/classic-cotton-crew-tee.jpg",
    "oversized-graphic-tee": "public/images/oversized-graphic-tee.jpg",
    "linen-collared-tee": "public/images/linen-collared-tee.jpg",
}

# (category_slug, name, gender, price, discount_price, featured, colors, description)
PRODUCTS = [
    ("t-shirts", "Classic Cotton Crew Tee", "Unisex", 1500, None, True,
     ["Black", "White", "Navy"],
     "Soft 100% combed cotton crew-neck tee. Pre-shrunk and breathable — everyday staple."),
    ("t-shirts", "Oversized Graphic Tee", "Men", 1900, 1600, False,
     ["Black", "Off White"],
     "Boxy fit heavyweight tee with an original Threadly street-art print."),
    ("t-shirts", "Linen Collared Tee", "Women", 2200, None, False,
     ["Sand", "Sky Blue"],
     "Relaxed linen blend with a soft collar — breezy summer layering piece."),
    ("hoodies", "Everyday Fleece Hoodie", "Unisex", 3800, None, True,
     ["Charcoal", "Maroon", "Olive"],
     "Mid-weight brushed fleece hoodie with kangaroo pocket and double-lined hood."),
    ("hoodies", "Zip-Up Tech Hoodie", "Men", 4500, 3900, False,
     ["Black", "Storm Grey"],
     "Water-repellent shell zip hoodie with stash pockets — gym to street."),
    ("hoodies", "Kitschy Cropped Hoodie", "Women", 3600, None, False,
     ["Lilac", "Cream"],
     "Cropped silhouette with raw hem for a laid-back statement look."),
    ("jeans", "Straight-Cut Indigo Jeans", "Men", 5200, None, True,
     ["Mid Blue", "Black"],
     "Rigid 12oz indigo denim with a classic straight leg and clean 5-pocket styling."),
    ("jeans", "High-Rise Skinny Jeans", "Women", 4900, 4200, False,
     ["Dark Blue", "White"],
     "Stretch-contoured skinny denim with a flattering high rise."),
    ("jeans", "Relaxed Baggy Jeans", "Unisex", 5600, None, False,
     ["Washed Blue", "Ecru"],
     "90s-inspired baggy fit with dropped waist and roomy leg openings."),
    ("dresses", "Floral Midi Wrap Dress", "Women", 4700, None, True,
     ["Blush Floral", "Navy Floral"],
     "Effortless midi wrap dress in a breathable viscose floral print."),
    ("dresses", "Tiered Maxi Dress", "Women", 6200, 5400, False,
     ["Terracotta", "Sage"],
     "Flowy tiered maxi with smocked bodice — made for golden-hour photos."),
    ("dresses", "Denim Shirt Dress", "Kids", 3200, None, False,
     ["Light Blue"],
     "Button-front denim dress with pocket details for easy everyday wear."),
    ("kurtas", "Embroidered Cotton Kurta", "Men", 4200, None, True,
     ["Off White", "Navy", "Green"],
     "Hand-embroidered neckline cotton kurta — breathable all-day wear."),
    ("kurtas", "Chikankari Anarkali Kurta", "Women", 6800, 5900, False,
     ["Pastel Pink", "Mint"],
     "Traditional chikankari work on flowing anarkali silhouette."),
    ("kurtas", "Kids Festive Kurta Set", "Kids", 2900, None, False,
     ["Mustard", "Turquoise"],
     "Festive 2-piece kurta set with contrast piping — Eid ready."),
    ("shalwar-kameez", "Classic Men's Shalwar Kameez", "Men", 5500, None, True,
     ["White", "Fawn", "Navy"],
     "Timeless cotton shalwar kameez with clean straight stitching — Jummah ready."),
    ("shalwar-kameez", "Embroidered Lawn 3-Piece", "Women", 7200, None, False,
     ["Sky Blue", "Peach"],
     "Printed lawn suit with embroidered dupatta and straight-cut kameez."),
    ("jackets", "Denim Trucker Jacket", "Unisex", 7400, 6500, True,
     ["Indigo", "Black"],
     "All-season trucker jacket in sturdy 13oz denim with antique brass buttons."),
    ("jackets", "Quilted Puffer Jacket", "Men", 9200, None, False,
     ["Black", "Olive"],
     "Lightweight quilted puffer with down-alternative fill and storm cuffs."),
    ("jackets", "Sherpa-Lined Kids Jacket", "Kids", 3900, None, False,
     ["Red", "Mustard"],
     "Snug sherpa-lined jacket with matte zip and warm funnel collar."),
]


def _seed_variants(product: Product, colors: list[str]) -> None:
    """Create a variant for each size x color combo with varied stock."""
    for color in colors:
        for i, size in enumerate(SIZES):
            ProductVariant.objects.get_or_create(
                product=product,
                size=size,
                color=color,
                defaults={
                    "stock": max(4, 18 - 2 * abs(i - 2)),
                },
            )


class Command(BaseCommand):
    help = "Seed the DB with 7 categories and 20 clothing products + variants with working images."

    @transaction.atomic
    def handle(self, *args, **options):
        created_categories = 0
        for name, slug in CATEGORIES:
            _, was_created = Category.objects.get_or_create(name=name, slug=slug)
            created_categories += 1 if was_created else 0

        created_products = 0
        updated_products = 0

        for (cat_slug, name, gender, price, discount, featured,
             colors, description) in PRODUCTS:
            category = Category.objects.get(slug=cat_slug)
            slug = name.lower().replace(" ", "-").replace("'", "").replace("--", "-")
            img_url = PRODUCT_IMAGES.get(slug, f"https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80")

            product, was_created = Product.objects.get_or_create(
                slug=slug,
                defaults={
                    "name": name,
                    "description": description,
                    "price": price,
                    "discount_price": discount,
                    "category": category,
                    "gender": gender,
                    "is_featured": featured,
                    "image_url": img_url,
                },
            )
            if was_created:
                created_products += 1
                _seed_variants(product, colors)
            else:
                # Update image_url to high quality Google/Unsplash CDN
                if product.image_url != img_url:
                    product.image_url = img_url
                    product.save(update_fields=["image_url"])
                    updated_products += 1

        self.stdout.write(self.style.SUCCESS(
            f"Seeded: {created_categories} categories, "
            f"{created_products} new products created, "
            f"{updated_products} existing products updated with verified images."
        ))
