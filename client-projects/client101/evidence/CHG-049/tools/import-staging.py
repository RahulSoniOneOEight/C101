import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://ops-staging.pinakaplay.cloud"
STATIC = "https://ops-staging.pinakaplay.cloud/static/"
PRODUCTS = "/opt/buildkart-import/products500.json"
PROGRESS = "/opt/buildkart-import/progress-500.json"
LOG = "/opt/buildkart-import/run-500.log"
LIMIT = int(sys.argv[1]) if len(sys.argv) > 1 else 0
IMPORT_KEY = "CHG-049"
STAGING_STOCK_FIXTURE = 50

SELLERS = {
    "Tools & Hardware": ("BuildMaster Supplies", "sloc_01M4EC9CC9CFFG4BAC9YJ22M6W"),
    "Lighting & Electrical": ("PowerMax Depot", "sloc_01M4EC9CXPTAXZBFYEGEN1N90K"),
    "Bathroom & Plumbing": ("AquaFlow Supplies", "sloc_01M4EC9D8XB30G2NCZSJGJFJFT"),
    "Tiles & Building Materials": ("UrbanBuild Supply", "sloc_01M4EC9DN3FSBHWAQ5TB31JEP6"),
    "Paints & Finishes": ("UrbanBuild Supply", "sloc_01M4EC9DN3FSBHWAQ5TB31JEP6"),
    "Agriculture & Seeds": ("BuildKart Direct", "sloc_01M589898F6DHEVYX1ZPYMFA1V"),
    "Automotive & Tyres": ("BuildKart Direct", "sloc_01M589898F6DHEVYX1ZPYMFA1V"),
    "Miscellaneous": ("BuildKart Direct", "sloc_01M589898F6DHEVYX1ZPYMFA1V"),
}
CHANNEL_NAMES = ("B2C Storefront", "B2B Trade Portal")


def log(message):
    line = time.strftime("%Y-%m-%d %H:%M:%S ") + message
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def call(path, data=None, token=None, timeout=120):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode() if data is not None else None
    request = urllib.request.Request(BASE + path, data=body, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            return (json.loads(raw) if raw else {}), None
    except urllib.error.HTTPError as error:
        return None, (error.code, error.read()[:1000].decode("utf-8", "ignore"))
    except Exception as error:  # noqa: BLE001
        return None, ("transport", str(error))


def save(progress):
    temporary = PROGRESS + ".tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(progress, handle, indent=2, sort_keys=True)
    os.replace(temporary, PROGRESS)


creds = open("/etc/buildkart/secrets/admin-console.txt", encoding="utf-8").read()
email = re.search(r"^Email\s*:\s*(.+)$", creds, re.M).group(1).strip()
password = re.search(r"^Password\s*:\s*(.+)$", creds, re.M).group(1).strip()
login, error = call("/auth/user/emailpass", {"email": email, "password": password})
if error:
    raise SystemExit(f"login failed: {error}")
token = login["token"]

sellers_response, error = call("/admin/sellers?limit=50", token=token)
if error:
    raise SystemExit(f"seller lookup failed: {error}")
sellers = {seller["name"]: seller["id"] for seller in sellers_response["sellers"]}

channels_response, error = call("/admin/sales-channels?limit=20", token=token)
if error:
    raise SystemExit(f"sales channel lookup failed: {error}")
channels = {channel["name"]: channel["id"] for channel in channels_response["sales_channels"]}

profiles_response, error = call("/admin/shipping-profiles?limit=50", token=token)
if error:
    raise SystemExit(f"shipping profile lookup failed: {error}")
profile_id = next(
    profile["id"]
    for profile in profiles_response["shipping_profiles"]
    if profile["name"] == "Marketplace Shipping"
)

categories_response, error = call("/admin/product-categories?limit=300", token=token)
if error:
    raise SystemExit(f"category lookup failed: {error}")
categories = categories_response["product_categories"]
by_name = {}
for category in categories:
    by_name.setdefault(category["name"], []).append(category)
l1_ids = {
    category["name"]: category["id"]
    for category in categories
    if not category.get("parent_category_id")
}


def resolve_category(l1, l2):
    parent_id = l1_ids.get(l1)
    if not parent_id:
        raise RuntimeError(f"Missing L1 category: {l1}")
    children = [
        category
        for category in by_name.get(l2, [])
        if category.get("parent_category_id") == parent_id
    ]
    if not children:
        raise RuntimeError(f"Missing L2 category under {l1}: {l2}")
    return children[0]["id"]


products = json.load(open(PRODUCTS, encoding="utf-8"))
manifest_skus = [variant["sku"] for product in products for variant in product["variants"]]
if len(manifest_skus) != 500 or len(set(manifest_skus)) != 500:
    raise SystemExit(
        f"manifest must contain 500 unique SKUs; got {len(manifest_skus)} / {len(set(manifest_skus))}"
    )

progress = (
    json.load(open(PROGRESS, encoding="utf-8"))
    if os.path.exists(PROGRESS)
    else {
        "done": {},
        "failed": {},
        "offers": [],
        "product_ids": [],
        "channel_product_ids": {name: [] for name in CHANNEL_NAMES},
    }
)
progress.setdefault("done", {})
progress.setdefault("failed", {})
progress.setdefault("offers", [])
progress.setdefault("product_ids", [])
progress.setdefault("channel_product_ids", {name: [] for name in CHANNEL_NAMES})
for channel_name in CHANNEL_NAMES:
    progress["channel_product_ids"].setdefault(channel_name, [])

queue = [
    product
    for product in products
    if product["uid"] not in progress["done"]
    and product["uid"] not in progress["failed"]
]
if LIMIT:
    queue = queue[:LIMIT]
log(
    f"queue={len(queue)} done={len(progress['done'])} "
    f"failed={len(progress['failed'])} manifest_products={len(products)}"
)


def add_product_to_progress(product, created_product, seller_id, location_id):
    expected_skus = {variant["sku"] for variant in product["variants"]}
    created_skus = {
        variant.get("sku")
        for variant in created_product.get("variants", [])
        if variant.get("sku")
    }
    if created_skus != expected_skus:
        raise RuntimeError(
            f"variant mismatch expected={sorted(expected_skus)} created={sorted(created_skus)}"
        )
    variant_ids = {
        variant["sku"]: variant["id"] for variant in created_product["variants"]
    }
    product_id = created_product["id"]
    if product_id not in progress["product_ids"]:
        progress["product_ids"].append(product_id)
    queued_keys = {
        (offer["seller_id"], offer["sku"]) for offer in progress["offers"]
    }
    for variant in product["variants"]:
        offer_key = (seller_id, variant["sku"])
        if offer_key in queued_keys:
            continue
        progress["offers"].append(
            {
                "seller_id": seller_id,
                "location_id": location_id,
                "sku": variant["sku"],
                "variant_id": variant_ids[variant["sku"]],
                "amount": int(round(float(variant["price"]) * 100)),
                "metadata": {
                    "catalogue_import": IMPORT_KEY,
                    "price_source": variant["metadata"].get("price_source", ""),
                    "source_url": variant["metadata"].get("source_url", ""),
                    "staging_inventory_fixture": True,
                },
            }
        )
    progress["done"][product["uid"]] = {
        "product_id": product_id,
        "variant_count": len(expected_skus),
        "seller_id": seller_id,
    }


for index, product in enumerate(queue, 1):
    seller_name, location_id = SELLERS[product["category_l1"]]
    seller_id = sellers[seller_name]
    option_title = product.get("option_title") or "Variant"
    option_values = [variant["title"] for variant in product["variants"]]
    if len({value.casefold() for value in option_values}) != len(option_values):
        progress["failed"][product["uid"]] = "duplicate option values after sanitisation"
        save(progress)
        continue
    if any(variant.get("price") is None for variant in product["variants"]):
        progress["failed"][product["uid"]] = "missing source price"
        save(progress)
        continue

    category_id = resolve_category(product["category_l1"], product["category_l2"])
    payload = {
        "title": product["name"][:200],
        "handle": product["uid"],
        "status": "published",
        "seller_ids": [seller_id],
        "categories": [{"id": category_id}],
        "metadata": {
            "brand": product["brand"],
            "category_l1": product["category_l1"],
            "category_l2": product["category_l2"],
            "source_url": product.get("source_url", ""),
            "source_file": product.get("source_file", ""),
            "catalogue_import": IMPORT_KEY,
        },
        "attributes": [
            {
                "title": option_title,
                "type": "multi_select",
                "values": option_values,
                "is_variant_axis": True,
                "is_filterable": False,
                "is_required": True,
                "description": "Product-scoped source catalogue variant axis",
                "metadata": {"catalogue_import": IMPORT_KEY},
            }
        ],
        "variants": [
            {
                "title": variant["title"][:120],
                "sku": variant["sku"],
                "options": {option_title: variant["title"]},
                "metadata": variant["metadata"],
            }
            for variant in product["variants"]
        ],
    }
    if product.get("image"):
        image_url = STATIC + product["image"]
        payload["thumbnail"] = image_url
        payload["images"] = [{"url": image_url}]

    created, error = call("/admin/products", payload, token=token)
    if error:
        code, body = error
        if code == 400 and "already exists" in body:
            query = urllib.parse.urlencode(
                {"handle": product["uid"], "limit": 1, "fields": "+variants"}
            )
            existing, lookup_error = call(f"/admin/products?{query}", token=token)
            if lookup_error or not existing.get("products"):
                progress["failed"][product["uid"]] = (
                    f"duplicate handle but lookup failed: {lookup_error}"
                )
                log(f"FAIL {product['uid']} duplicate lookup {lookup_error}")
                save(progress)
                continue
            created_product = existing["products"][0]
            disposition = "reused"
        else:
            progress["failed"][product["uid"]] = f"{code} {body}"
            log(f"FAIL {product['uid']} {code} {body[:240]}")
            save(progress)
            continue
    else:
        created_product = created["product"]
        disposition = "created"

    try:
        add_product_to_progress(product, created_product, seller_id, location_id)
    except Exception as validation_error:  # noqa: BLE001
        progress["failed"][product["uid"]] = str(validation_error)
        log(f"FAIL {product['uid']} validation {validation_error}")
        save(progress)
        continue
    save(progress)
    log(
        f"product {index}/{len(queue)} {disposition} {product['uid']} "
        f"variants={len(product['variants'])}"
    )

# Sales-channel links are idempotent through the progress ledger: only newly
# created/recovered product IDs are added on each run.
for channel_name in CHANNEL_NAMES:
    assigned = set(progress["channel_product_ids"][channel_name])
    pending_ids = [
        product_id for product_id in progress["product_ids"] if product_id not in assigned
    ]
    for start in range(0, len(pending_ids), 100):
        batch = pending_ids[start : start + 100]
        _, error = call(
            f"/admin/sales-channels/{channels[channel_name]}/products",
            {"add": batch},
            token=token,
        )
        if error:
            log(f"CHANNEL FAIL {channel_name} start={start} {error}")
            continue
        progress["channel_product_ids"][channel_name].extend(batch)
        save(progress)
        log(f"channel {channel_name}: +{len(batch)}")

# Discover existing offers before writes so a resumed run never duplicates a
# successfully-created batch whose response was lost.
existing_offer_keys = set()
for seller_id in sorted({offer["seller_id"] for offer in progress["offers"]}):
    offset = 0
    while True:
        query = urllib.parse.urlencode(
            {"seller_id": seller_id, "limit": 100, "offset": offset}
        )
        response, error = call(f"/admin/offers?{query}", token=token)
        if error:
            log(f"OFFER LOOKUP FAIL seller={seller_id} offset={offset} {error}")
            break
        offers = response.get("offers", [])
        existing_offer_keys.update((seller_id, offer["sku"]) for offer in offers)
        offset += len(offers)
        if not offers or offset >= response.get("count", 0):
            break

if existing_offer_keys:
    before = len(progress["offers"])
    progress["offers"] = [
        offer
        for offer in progress["offers"]
        if (offer["seller_id"], offer["sku"]) not in existing_offer_keys
    ]
    skipped = before - len(progress["offers"])
    if skipped:
        save(progress)
        log(f"offers already present: {skipped}")

pending_by_seller = {}
for offer in progress["offers"]:
    pending_by_seller.setdefault(offer["seller_id"], []).append(offer)

for seller_id, seller_offers in pending_by_seller.items():
    for start in range(0, len(seller_offers), 100):
        chunk = seller_offers[start : start + 100]
        batch = [
            {
                "sku": offer["sku"],
                "variant_id": offer["variant_id"],
                "shipping_profile_id": profile_id,
                "prices": [
                    {"amount": offer["amount"], "currency_code": "inr"}
                ],
                "inventory_items": [
                    {
                        "sku": offer["sku"],
                        "required_quantity": 1,
                        "stock_levels": [
                            {
                                "location_id": offer["location_id"],
                                "stocked_quantity": STAGING_STOCK_FIXTURE,
                            }
                        ],
                    }
                ],
                "metadata": offer["metadata"],
            }
            for offer in chunk
        ]
        _, error = call(
            "/admin/offers/batch",
            {"seller_id": seller_id, "offers": batch},
            token=token,
            timeout=180,
        )
        if error:
            log(f"OFFERS FAIL seller={seller_id} start={start} {error}")
            continue
        completed_keys = {(offer["seller_id"], offer["sku"]) for offer in chunk}
        progress["offers"] = [
            offer
            for offer in progress["offers"]
            if (offer["seller_id"], offer["sku"]) not in completed_keys
        ]
        save(progress)
        log(
            f"offers seller={seller_id} "
            f"{start + len(chunk)}/{len(seller_offers)}"
        )

log(
    f"run complete products={len(progress['done'])}/{len(products)} "
    f"failed={len(progress['failed'])} offers_pending={len(progress['offers'])}"
)
