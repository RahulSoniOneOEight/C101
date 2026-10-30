import json
import sys
import urllib.error
import urllib.request

API_IP = open("/tmp/u009-api-ip").read().strip()
EXP_IP = open("/tmp/u009-exp-ip").read().strip()
MEDUSA = f"http://{API_IP}:9010"
EXPERIENCE = f"http://{EXP_IP}:9020"
KEY = "pk_fee03ec911b430a1cc44fc4c4915a0154120b982557ad0bdac8000b3a6b87f00"
SELLER = "sel_01M4EC9CVVHG168X1DHHBY29HY"  # PowerMax Depot
CHANNEL = "sc_01M4EC8S2EBB6ZEAMGPGX7MP13"  # B2C Storefront
TITLE = "QC Test Steel Clamp 13mm"
SKU = "QC-U009-CLAMP-13"
PRICE_MAJOR = 1499  # Rs 1,499 (Medusa amounts are major units)
PRICE_MINOR = PRICE_MAJOR * 100

results = []


def call(base, method, path, token=None, body=None, headers=None):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(base + path, method=method, data=data)
    request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    for key, value in (headers or {}).items():
        request.add_header(key, value)
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        payload = error.read()
        try:
            parsed = json.loads(payload or b"{}")
        except Exception:
            parsed = {"raw": payload.decode(errors="replace")}
        return error.code, parsed


def check(name, ok, detail):
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + " :: " + json.dumps(detail)[:500])


# 1. Admin session
status, login = call(
    MEDUSA,
    "POST",
    "/auth/user/emailpass",
    body={"email": "u009-qc@buildkart.test", "password": "U009-QC-Passw0rd!"},
)
admin = login.get("token")
check("admin.login", status == 200 and bool(admin), {"status": status})

# 2. A real category
status, categories = call(MEDUSA, "GET", "/admin/product-categories?limit=1", admin)
category_id = (categories.get("product_categories") or [{}])[0].get("id")
check(
    "catalogue.category_available",
    status == 200 and bool(category_id),
    {"status": status, "category_id": category_id},
)

# 3. Product creation through the Product Studio (admin acting for PowerMax)
status, created = call(
    MEDUSA,
    "POST",
    "/admin/buildkart/product-studio",
    admin,
    {
        "title": TITLE,
        "subtitle": "QC product-creation check",
        "description": "Temporary QC product created to verify the add-product flow.",
        "category_id": category_id,
        "brand": "BuildKart QC",
        "tags": ["qc-test"],
        "sales_channel_ids": [CHANNEL],
        "seller_id": SELLER,
        "seller_provision_reason": "QC: product creation and add-to-cart flow",
        "variants": [
            {"title": "Default", "sku": SKU, "seller_id": SELLER},
        ],
    },
)
product = created.get("product") or {}
product_id = product.get("id")
check(
    "product.created",
    status == 201 and bool(product_id),
    {"status": status, "product_id": product_id, "status_field": product.get("status")},
)
if not product_id:
    print(json.dumps({"checks": results}, indent=2))
    sys.exit(1)

# 4. Studio read: offers + readiness before price
status, studio = call(
    MEDUSA, "GET", f"/admin/buildkart/product-studio/{product_id}", admin
)
studio_product = studio.get("product") or {}
offers = studio_product.get("offers") or []
offer = next((row for row in offers if row.get("seller_id") == SELLER), None)
check(
    "product.seller_offer_created",
    status == 200 and offer is not None,
    {"status": status, "offers": len(offers), "offer_id": (offer or {}).get("id")},
)
if not offer:
    print(json.dumps({"checks": results}, indent=2))
    sys.exit(1)

before_checks = {
    check.get("key"): check.get("ok")
    for check in (studio_product.get("review") or {}).get("checks", [])
}

# 5. Base price through the offer pricing API
status, priced = call(
    MEDUSA,
    "POST",
    f"/admin/buildkart/offers/{offer['id']}/pricing",
    admin,
    {
        "prices": [{"currency_code": "inr", "amount": PRICE_MAJOR}],
        "reason": "QC base price",
    },
)
pricing = priced.get("pricing") or {}
check(
    "offer.price_set",
    status == 200
    and any(
        row.get("currency_code") == "inr" and row.get("amount") == PRICE_MAJOR
        for row in (pricing.get("prices") or [])
    ),
    {"status": status, "prices": pricing.get("prices")},
)

# 6. Readiness after price
status, studio2 = call(
    MEDUSA, "GET", f"/admin/buildkart/product-studio/{product_id}", admin
)
studio2_product = studio2.get("product") or {}
review = studio2_product.get("review") or {}
b2c = ((studio2_product.get("readiness") or {}).get("channels") or {}).get("b2c") or {}
check(
    "product.review_ready",
    status == 200 and review.get("ready") is True,
    {
        "status": status,
        "ready": review.get("ready"),
        "failed": [
            row.get("label")
            for row in review.get("checks", [])
            if row.get("required") and not row.get("ok")
        ],
        "before_price": before_checks,
    },
)
check(
    "product.b2c_visible_precheck",
    bool(b2c.get("visible")),
    {"visible": b2c.get("visible"), "blocker": b2c.get("blocker")},
)

# 7. Medusa store: product is live for the B2C key
status, store = call(
    MEDUSA,
    "GET",
    "/store/products?limit=100&q=QC%20Test",
    headers={"x-publishable-api-key": KEY},
)
store_products = store.get("products") or []
store_product = next(
    (row for row in store_products if row.get("id") == product_id), None
)
handle = (store_product or {}).get("handle")
check(
    "webstore.medusa_visible",
    status == 200 and store_product is not None,
    {"status": status, "title": (store_product or {}).get("title"), "handle": handle},
)

# 8. Experience API catalogue (the feed the web store renders).
# The feed is paginated and can exceed one page, so scan pages for the new id.
status, catalogue = call(EXPERIENCE, "GET", "/v1/products?limit=250&channel=b2c")
items = catalogue.get("products") or catalogue.get("items") or []
catalogue_product = next(
    (
        row
        for row in items
        if row.get("id") == product_id
        or (TITLE.lower() in str(row.get("title", "")).lower())
    ),
    None,
)
offset = 250
while catalogue_product is None and status == 200 and offset <= 1000:
    status, page = call(
        EXPERIENCE,
        "GET",
        f"/v1/products?limit=250&offset={offset}&channel=b2c",
    )
    page_items = page.get("products") or page.get("items") or []
    if not page_items:
        break
    items.extend(page_items)
    catalogue_product = next(
        (
            row
            for row in page_items
            if row.get("id") == product_id
            or (TITLE.lower() in str(row.get("title", "")).lower())
        ),
        None,
    )
    offset += 250
check(
    "webstore.experience_catalogue_visible",
    status == 200 and catalogue_product is not None,
    {
        "status": status,
        "scanned": len(items),
        "title": (catalogue_product or {}).get("title"),
        "price": (catalogue_product or {}).get("price")
        or (catalogue_product or {}).get("min_price"),
    },
)

status, detail = call(
    EXPERIENCE,
    "GET",
    f"/v1/products/{product_id}?channel=b2c",
)
detail_product = detail.get("product") or detail
check(
    "webstore.product_detail",
    status == 200 and bool(detail_product.get("id") or detail_product.get("title")),
    {
        "status": status,
        "title": detail_product.get("title"),
        "variants": len(detail_product.get("variants") or []),
    },
)

# 9. Purchasable: add to a real B2C cart with the new offer
status, challenge = call(
    EXPERIENCE, "POST", "/v1/auth/otp/challenges", body={"identifier": "rsoni001@gmail.com"}
)
status, verified = call(
    EXPERIENCE,
    "POST",
    "/v1/auth/otp/verify",
    body={"challenge_id": challenge.get("challenge_id"), "code": "123456"},
)
pilot = verified.get("session_token")
status, cart = call(
    EXPERIENCE, "POST", "/v1/carts", pilot, {"channel": "b2c_web"}
)
cart_id = cart.get("id")
status, line = call(
    EXPERIENCE,
    "POST",
    f"/v1/carts/{cart_id}/lines",
    pilot,
    {"offer_id": offer["id"], "quantity": 1},
)
line_item = (line.get("items") or [{}])[0]
check(
    "storefront.add_to_cart",
    status == 200 and line_item.get("unit_price") == PRICE_MINOR,
    {
        "status": status,
        "cart_id": cart_id,
        "unit_price": line_item.get("unit_price"),
        "title": line_item.get("title"),
    },
)

status, bound = call(
    EXPERIENCE,
    "POST",
    f"/v1/carts/{cart_id}/customer-details",
    pilot,
    {
        "email": "rsoni001@gmail.com",
        "shipping_address": {
            "first_name": "QC",
            "last_name": "Product",
            "address_1": "12 Test Lane",
            "city": "Mumbai",
            "province": "MH",
            "postal_code": "400001",
            "country_code": "IN",
            "phone": "9999999999",
        },
    },
)
delivery = bound.get("delivery") or {}
check(
    "storefront.delivery_on_new_product_cart",
    status == 200 and delivery.get("total") == 4900,
    {
        "status": status,
        "delivery": delivery,
        "shipping_total": bound.get("shipping_total"),
        "total": bound.get("total"),
    },
)

print(
    "\nSUMMARY "
    + json.dumps(
        {
            "product_id": product_id,
            "title": TITLE,
            "sku": SKU,
            "handle": handle,
            "offer_id": offer["id"],
            "price_minor": PRICE_MINOR,
            "cart_id": cart_id,
            "checks": results,
        },
        indent=2,
    )
)
sys.exit(0 if all(row["ok"] for row in results) else 1)
