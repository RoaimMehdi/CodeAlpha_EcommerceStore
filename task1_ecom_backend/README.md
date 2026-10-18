# Threadly Backend

REST API backend for the **Threadly** online clothing brand e-commerce store.

- **Django 5** + **Django REST Framework**
- **MySQL** — database `threadly_db`, `utf8mb4` charset
- **JWT auth** — `djangorestframework-simplejwt`
- **CORS** — `django-cors-headers`, frontend origin `http://127.0.0.1:5500`
- **django-filter** — product filtering; **python-decouple** — `.env` config

## Project structure

```
threadly_backend/            # settings, root urls
users/                       # register / login / me
products/                    # categories, products, variants + seed command
orders/                      # order create/list/retrieve (JWT protected)
seed_products.py             # management command: 7 categories, 20 products
```

## 1. MySQL setup (run as root)

```sql
CREATE DATABASE threadly_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'threadly_user'@'localhost' IDENTIFIED BY 'your_password';
CREATE USER 'threadly_user'@'127.0.0.1' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON threadly_db.* TO 'threadly_user'@'localhost';
GRANT ALL PRIVILEGES ON threadly_db.* TO 'threadly_user'@'127.0.0.1';
FLUSH PRIVILEGES;
```

Put the credentials in `.env` (copy `.env.example` and edit).

## 2. Install & run

```bash
python -m venv venv
venv/Scripts/python -m pip install -r requirements.txt   # Windows
# source venv/bin/activate && pip install -r requirements.txt   # Linux/Mac

python manage.py makemigrations users products orders
python manage.py migrate
python manage.py createsuperuser
python manage.py seed_products        # 7 categories + 20 products + variants
python manage.py runserver
```

Admin panel: `http://127.0.0.1:8000/admin/`

---

## 3. Endpoint reference & sample JSON

### POST `/api/auth/register/` — public

```json
// Request
{"username": "hamza", "email": "hamza@example.com", "password": "secret123", "password2": "secret123"}
// 201 Response
{"id": 2, "username": "hamza", "email": "hamza@example.com"}
// 400 (duplicate email)
{"email": ["A user with that email already exists."]}
// 400 (short password)
{"password": ["Password must be at least 6 characters long."]}
```

### POST `/api/auth/login/` — public

```json
// Request
{"username": "hamza", "password": "secret123"}
// 200 Response
{"refresh": "eyJhbGciOi...", "access": "eyJhbGciOi..."}
```

### GET `/api/auth/me/` — requires `Authorization: Bearer <access>`

```json
// 200 Response
{"id": 2, "username": "hamza", "email": "hamza@example.com"}
// 401 without/invalid token
{"detail": "Given token not valid for any token type", "code": "token_not_valid"}
```

### GET `/api/categories/` — public

```json
[{"id": 1, "name": "T-Shirts", "slug": "t-shirts"}, {"id": 2, "name": "Hoodies", "slug": "hoodies"}]
```

### GET `/api/products/` — public, paginated (12/page)

Supported query params:
`?q=hoodie&category=hoodies&gender=Men&min_price=1000&max_price=5000&size=M&color=Black&ordering=price|-price|-created_at&page=1`

```json
// 200 Response
{
  "count": 20, "next": "http://127.0.0.1:8000/api/products/?page=2",
  "previous": null,
  "results": [
    {
      "id": 2, "name": "Oversized Graphic Tee", "slug": "oversized-graphic-tee",
      "price": "1900.00", "discount_price": "1600.00", "effective_price": 1600.0,
      "image_url": "https://cdn.threadly.app/products/oversized-graphic-tee.jpg",
      "category_name": "T-Shirts", "gender": "Men",
      "is_featured": false, "is_active": true,
      "created_at": "2026-10-17T16:00:00+05:00"
    }
  ]
}
```

`effective_price` is what is actually charged (discount honored) and is used by
min/max price filters and `?ordering=price`.

### GET `/api/products/featured/` — public

Same shape as above, no pagination.
\n### GET `/api/products/<slug-or-id>/` — public

```json
// 200 Response
{
  "id": 1, "name": "Classic Cotton Crew Tee", "slug": "classic-cotton-crew-tee",
  "description": "Soft 100% combed cotton crew-neck tee...",
  "price": "1500.00", "discount_price": null, "effective_price": 1500.0,
  "category": "T-Shirts", "gender": "Unisex", "image_url": "...",
  "variants": [
    {"id": 1, "size": "XS", "color": "Black", "stock": 4},
    {"id": 2, "size": "S", "color": "Black", "stock": 10}
  ]
}
// 404
{"detail": "Not found."}
```

### POST `/api/orders/` — JWT protected

```json
// Request
{
  "shipping_name": "Hamza Khan",
  "shipping_address": "House 12, Street 4, Gulberg",
  "city": "Lahore",
  "phone": "+923001234567",
  "items": [{"variant_id": 1, "quantity": 2}, {"variant_id": 4, "quantity": 1}]
}
// 201 Response
{
  "id": 1, "user": "hamza", "total": "4500.00", "status": "Pending",
  "payment_method": "Cash on Delivery",
  "shipping_name": "Hamza Khan", "shipping_address": "House 12, Street 4, Gulberg",
  "city": "Lahore", "phone": "+923001234567",
  "created_at": "2026-10-17T16:05:25+05:00",
  "items": [
    {"id": 1, "product_name": "Classic Cotton Crew Tee", "product_slug": "...",
     "image_url": "...", "size": "XS", "color": "Black", "quantity": 2, "price": "1500.00"}
  ]
}
// 401 — no/invalid token
// 400 — out of stock
{"items": ["Only 2 left for size XS in Black."]}
// 400 — bad variant
{"items": ["Variant 99999 does not exist."]}
// 400 — validation
{"phone": ["Enter a valid phone number (7–15 digits, optional leading +)."]}
```

The total is computed **server-side** (client prices are never trusted) and the
order + stock deduction happen inside `transaction.atomic()` with
`select_for_update()` row locks on the variants.

### GET `/api/orders/` — JWT protected, only the current user's orders

```json
// 200 Response — array of Order objects (same shape as create response)
// 401 — no/invalid token
```

### GET `/api/orders/<id>/` — JWT protected, owner only

```json
// 200 — Order object
// 404 — {"detail": "Order not found."}
// 403 — {"detail": "You do not have permission to view this order."}
```

## Notes

- Pagination default: 12 per page (`?page=2`).
- Ordering accepts only `price`, `-price`, `created_at`, `-created_at`.
- `products/featured/` is routed before the `<slug-or-id>` detail pattern.
- Sample data image URLs are placeholders (`cdn.threadly.app`).
