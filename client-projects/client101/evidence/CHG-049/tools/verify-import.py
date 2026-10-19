import collections
import concurrent.futures
import json
import re
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://ops-staging.pinakaplay.cloud"
PRODUCTS_PATH = "/opt/buildkart-import/products500.json"
PROGRESS_PATH = "/opt/buildkart-import/progress-500.json"
REPORT_PATH = "/opt/buildkart-import/verification-500.json"
IMPORT_KEY = "CHG-049"


def request_json(path, token):
    request = urllib.request.Request(
        BASE + path,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(
            f"{path}: HTTP {error.code} {error.read().decode('utf-8', 'ignore')[:1000]}"
        ) from error


def paginated(path, key, token, extra=None):
    output = []
    offset = 0
    while True:
        params = {"limit": 100, "offset": offset}
        params.update(extra or {})
        query = urllib.parse.urlencode(params)
        response = request_json(f"{path}?{query}", token)
        page = response.get(key, [])
        output.extend(page)
        offset += len(page)
        if not page or offset >= response.get("count", 0):
            return output


creds = open("/etc/buildkart/secrets/admin-console.txt", encoding="utf-8").read()
email = re.search(r"^Email\s*:\s*(.+)$", creds, re.M).group(1).strip()
password = re.search(r"^Password\s*:\s*(.+)$", creds, re.M).group(1).strip()
login_request = urllib.request.Request(
    BASE + "/auth/user/emailpass",
    data=json.dumps({"email": email, "password": password}).encode(),
    headers={"Content-Type": "application/json"},
)
with urllib.request.urlopen(login_request, timeout=120) as response:
    token = json.load(response)["token"]

manifest = json.load(open(PRODUCTS_PATH, encoding="utf-8"))
progress = json.load(open(PROGRESS_PATH, encoding="utf-8"))
expected_by_uid = {product["uid"]: product for product in manifest}
expected_skus = {
    variant["sku"]: (product, variant)
    for product in manifest
    for variant in product["variants"]
}

assert len(manifest) == 233, len(manifest)
assert len(expected_skus) == 500, len(expected_skus)
assert len(progress["done"]) == len(manifest), len(progress["done"])
assert not progress["failed"], progress["failed"]
assert not progress["offers"], len(progress["offers"])

channels = paginated("/admin/sales-channels", "sales_channels", token)
required_channel_ids = {
    channel["id"]
    for channel in channels
    if channel["name"] in {"B2C Storefront", "B2B Trade Portal"}
}
assert len(required_channel_ids) == 2, required_channel_ids

all_products = paginated("/admin/products", "products", token)
imported_products = [
    product
    for product in all_products
    if (product.get("metadata") or {}).get("catalogue_import") == IMPORT_KEY
]
actual_by_uid = {product["handle"]: product for product in imported_products}
assert set(actual_by_uid) == set(expected_by_uid), (
    sorted(set(expected_by_uid) - set(actual_by_uid))[:10],
    sorted(set(actual_by_uid) - set(expected_by_uid))[:10],
)

seller_ids = {entry["seller_id"] for entry in progress["done"].values()}
seller_products = collections.defaultdict(dict)
product_seller_memberships = collections.defaultdict(set)
for seller_id in seller_ids:
    products = paginated(f"/admin/sellers/{seller_id}/products", "products", token)
    for product in products:
        seller_products[seller_id][product["id"]] = product
        product_seller_memberships[product["id"]].add(seller_id)

category_product_counts = collections.Counter()
category_sku_counts = collections.Counter()
seller_product_counts = collections.Counter()
seller_sku_counts = collections.Counter()
variant_count = 0
traceability_count = 0

for uid, expected in expected_by_uid.items():
    actual = actual_by_uid[uid]
    done = progress["done"][uid]
    expected_product_id = done["product_id"]
    expected_seller_id = done["seller_id"]
    assert actual["id"] == expected_product_id, (uid, actual["id"], expected_product_id)
    assert actual["status"] == "published", uid
    assert actual["thumbnail"] == BASE + "/static/" + expected["image"], uid
    assert (actual.get("metadata") or {}).get("brand") == expected["brand"], uid
    assert (actual.get("metadata") or {}).get("source_url") == expected["source_url"], uid
    category_names = {category["name"] for category in actual.get("categories", [])}
    assert expected["category_l2"] in category_names, (uid, category_names)

    expected_variant_skus = {variant["sku"] for variant in expected["variants"]}
    actual_variant_skus = {variant["sku"] for variant in actual.get("variants", [])}
    assert actual_variant_skus == expected_variant_skus, (uid, actual_variant_skus, expected_variant_skus)
    assert all(not variant.get("manage_inventory") for variant in actual["variants"]), uid

    axes = [
        attribute
        for attribute in actual.get("scoped_attributes", [])
        if attribute.get("is_variant_axis")
    ]
    assert len(axes) == 1, (uid, axes)
    assert axes[0]["name"] == expected["option_title"], (uid, axes[0])
    expected_values = {variant["title"] for variant in expected["variants"]}
    actual_values = {value["name"] for value in axes[0].get("values", [])}
    assert actual_values == expected_values, (uid, actual_values, expected_values)

    assert product_seller_memberships[actual["id"]] == {expected_seller_id}, (
        uid,
        product_seller_memberships[actual["id"]],
        expected_seller_id,
    )
    seller_product = seller_products[expected_seller_id][actual["id"]]
    linked_channels = {
        channel["id"] for channel in seller_product.get("sales_channels", [])
    }
    assert required_channel_ids.issubset(linked_channels), (
        uid,
        required_channel_ids - linked_channels,
    )

    variant_response = request_json(
        f"/admin/products/{actual['id']}/variants?limit=100", token
    )
    variants_by_sku = {
        variant["sku"]: variant for variant in variant_response["variants"]
    }
    assert set(variants_by_sku) == expected_variant_skus, uid
    for expected_variant in expected["variants"]:
        variant = variants_by_sku[expected_variant["sku"]]
        option_values = {option.get("value") for option in variant.get("options", [])}
        assert expected_variant["title"] in option_values, (
            expected_variant["sku"],
            option_values,
        )
        metadata = variant.get("metadata") or {}
        for key in ("sku_source", "price_source", "source_url", "source_file"):
            assert metadata.get(key) == expected_variant["metadata"].get(key), (
                expected_variant["sku"],
                key,
                metadata.get(key),
                expected_variant["metadata"].get(key),
            )
        traceability_count += 1

    category_product_counts[expected["category_l1"]] += 1
    category_sku_counts[expected["category_l1"]] += len(expected["variants"])
    seller_product_counts[expected_seller_id] += 1
    seller_sku_counts[expected_seller_id] += len(expected["variants"])
    variant_count += len(expected["variants"])

all_expected_offers = {}
for uid, done in progress["done"].items():
    expected = expected_by_uid[uid]
    for variant in expected["variants"]:
        all_expected_offers[(done["seller_id"], variant["sku"])] = variant

actual_offer_map = collections.defaultdict(list)
for seller_id in seller_ids:
    offers = paginated(
        "/admin/offers", "offers", token, {"seller_id": seller_id}
    )
    for offer in offers:
        key = (seller_id, offer["sku"])
        if key in all_expected_offers:
            actual_offer_map[key].append(offer)

assert set(actual_offer_map) == set(all_expected_offers), (
    sorted(set(all_expected_offers) - set(actual_offer_map))[:10],
    sorted(set(actual_offer_map) - set(all_expected_offers))[:10],
)
for key, expected_variant in all_expected_offers.items():
    offers = actual_offer_map[key]
    assert len(offers) == 1, (key, len(offers))
    offer = offers[0]
    expected_amount = int(round(float(expected_variant["price"]) * 100))
    prices = {(price["currency_code"], price["amount"]) for price in offer["prices"]}
    assert ("inr", expected_amount) in prices, (key, prices, expected_amount)
    assert offer["shipping_profile_id"] == "sp_01M4EC9C0C9KNZ5RM7RPYY6H4H", key
    assert offer.get("inventory_items"), key
    assert (offer.get("metadata") or {}).get("catalogue_import") == IMPORT_KEY, key
    assert (offer.get("metadata") or {}).get("staging_inventory_fixture") is True, key


def check_image(product):
    url = BASE + "/static/" + product["image"]
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            return product["uid"], response.status
    except Exception as error:  # noqa: BLE001
        return product["uid"], str(error)


with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
    image_results = list(pool.map(check_image, manifest))
image_failures = [result for result in image_results if result[1] != 200]
assert not image_failures, image_failures[:10]

report = {
    "change_id": IMPORT_KEY,
    "result": "pass",
    "products": len(imported_products),
    "variants": variant_count,
    "offers": len(actual_offer_map),
    "unique_skus": len(expected_skus),
    "variant_traceability_records": traceability_count,
    "variant_axis_products": len(imported_products),
    "images_http_200": len(image_results),
    "sales_channels_per_product": 2,
    "seller_product_counts": dict(sorted(seller_product_counts.items())),
    "seller_sku_counts": dict(sorted(seller_sku_counts.items())),
    "category_product_counts": dict(sorted(category_product_counts.items())),
    "category_sku_counts": dict(sorted(category_sku_counts.items())),
    "inventory_fixture_quantity": 50,
    "production_release_authorized": False,
}
with open(REPORT_PATH, "w", encoding="utf-8") as handle:
    json.dump(report, handle, indent=2, sort_keys=True)
print(json.dumps(report, sort_keys=True))
