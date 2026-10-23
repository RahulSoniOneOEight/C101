import collections
import csv
import json
import math
import re
import shutil
from pathlib import Path

MASTER = Path(r"D:\catalogue\product_master.csv")
PAYLOAD = Path(r"D:\catalogue\_import_payload")
IMAGES = PAYLOAD / "images500"
SELECTION = Path(r"D:\catalogue\import_selection_500.csv")
TARGET_SKUS = 500
OPTION_TITLE = "Variant"

SELLER_CATEGORIES = collections.OrderedDict(
    [
        ("BuildMaster Supplies", ["Tools & Hardware"]),
        ("PowerMax Depot", ["Lighting & Electrical"]),
        ("AquaFlow Supplies", ["Bathroom & Plumbing"]),
        ("UrbanBuild Supply", ["Tiles & Building Materials", "Paints & Finishes"]),
        ("BuildKart Direct", ["Agriculture & Seeds", "Automotive & Tyres", "Miscellaneous"]),
    ]
)


def slug(value, limit=70):
    text = value.lower().replace("&", "and")
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:limit]


def clean_title(value):
    text = re.sub(r"\s+", " ", (value or "").strip())
    return text or "Default"


def group_score(key, groups):
    members = groups[key]
    image_score = int(
        members[0].get("image_exists") == "y"
        and bool(members[0].get("image_local"))
    )
    return (int(len(members) > 1), 1, image_score)


def choose_exact(candidates, groups, target):
    """Choose whole product groups totalling target SKUs, preferring variants."""
    if target == 0:
        return []
    # total -> (score tuple, tuple of keys). Product count is the second score,
    # so equally variant-rich solutions favour broader catalogue coverage.
    states = {0: ((0, 0, 0), ())}
    for key in candidates:
        size = len(groups[key])
        if size > target:
            continue
        item_score = group_score(key, groups)
        for used in sorted(list(states), reverse=True):
            new_total = used + size
            if new_total > target:
                continue
            old_score, old_path = states[used]
            new_score = tuple(a + b for a, b in zip(old_score, item_score))
            current = states.get(new_total)
            if current is None or new_score > current[0]:
                states[new_total] = (new_score, old_path + (key,))
    if target not in states:
        raise RuntimeError(f"No whole-product combination totals {target} SKUs")
    return list(states[target][1])


rows = list(csv.DictReader(MASTER.open(encoding="utf-8-sig", newline="")))
groups = collections.OrderedDict()
for row in rows:
    groups.setdefault((row["brand"], row["name"]), []).append(row)

by_l1 = collections.defaultdict(list)
for key, members in groups.items():
    by_l1[members[0]["category_l1"]].append(key)

categories = sorted(by_l1)
if len(categories) != 8:
    raise RuntimeError(f"Expected 8 L1 categories, found {len(categories)}: {categories}")

# Reserve one genuine multi-variant pilot product for each seller.
pilot_keys = []
for seller, seller_categories in SELLER_CATEGORIES.items():
    candidates = [
        key
        for category in seller_categories
        for key in by_l1[category]
        if len(groups[key]) > 1
    ]
    if not candidates:
        raise RuntimeError(f"No multi-variant pilot product for {seller}")
    candidates.sort(
        key=lambda key: (
            len(groups[key]),
            groups[key][0].get("image_exists") != "y",
            key[0].lower(),
            key[1].lower(),
        )
    )
    pilot_keys.append(candidates[0])

# Guarantee all eight L1 categories. Prefer a small multi-variant product, then
# an imaged single-SKU product if the category has no variants.
required = list(pilot_keys)
for category in categories:
    if any(groups[key][0]["category_l1"] == category for key in required):
        continue
    candidates = sorted(
        by_l1[category],
        key=lambda key: (
            len(groups[key]) == 1,
            len(groups[key]),
            groups[key][0].get("image_exists") != "y",
            key[0].lower(),
            key[1].lower(),
        ),
    )
    required.append(candidates[0])

required_by_l1 = collections.defaultdict(list)
for key in required:
    if key not in required_by_l1[groups[key][0]["category_l1"]]:
        required_by_l1[groups[key][0]["category_l1"]].append(key)

# Allocate proportional per-category SKU quotas using largest remainders.
capacity = {category: sum(len(groups[key]) for key in by_l1[category]) for category in categories}
total_capacity = sum(capacity.values())
raw = {category: TARGET_SKUS * capacity[category] / total_capacity for category in categories}
quota = {category: math.floor(raw[category]) for category in categories}
for category in sorted(categories, key=lambda c: (raw[c] - quota[c], c), reverse=True)[: TARGET_SKUS - sum(quota.values())]:
    quota[category] += 1

# A tiny category can have one indivisible group larger than its proportional
# quota. Raise it to the required group size and reclaim the difference from
# categories with the most slack.
for category in categories:
    minimum = sum(len(groups[key]) for key in required_by_l1[category])
    if quota[category] >= minimum:
        continue
    delta = minimum - quota[category]
    quota[category] = minimum
    while delta:
        donors = sorted(
            (
                c
                for c in categories
                if quota[c] > sum(len(groups[key]) for key in required_by_l1[c])
            ),
            key=lambda c: quota[c] - sum(len(groups[key]) for key in required_by_l1[c]),
            reverse=True,
        )
        if not donors:
            raise RuntimeError("Unable to balance category quotas")
        quota[donors[0]] -= 1
        delta -= 1

selected = []
for category in categories:
    base = required_by_l1[category]
    selected.extend(base)
    remaining_target = quota[category] - sum(len(groups[key]) for key in base)
    candidates = [key for key in by_l1[category] if key not in base]
    # Deterministic ordering keeps output stable while DP chooses the most
    # variant-rich exact combination.
    candidates.sort(key=lambda key: (len(groups[key]), key[0].lower(), key[1].lower()))
    selected.extend(choose_exact(candidates, groups, remaining_target))

if len(set(selected)) != len(selected):
    raise RuntimeError("Duplicate product group selected")
if sum(len(groups[key]) for key in selected) != TARGET_SKUS:
    raise RuntimeError("Selection does not contain exactly 500 SKUs")

# Put the five pilot groups first, one per seller, then deterministic category
# order. The import runner's limit=5 therefore validates every seller.
pilot_set = set(pilot_keys)
selected = pilot_keys + sorted(
    (key for key in selected if key not in pilot_set),
    key=lambda key: (
        groups[key][0]["category_l1"],
        key[0].lower(),
        key[1].lower(),
    ),
)

PAYLOAD.mkdir(exist_ok=True)
if IMAGES.exists():
    shutil.rmtree(IMAGES)
IMAGES.mkdir()

products = []
used_uids = set()
selection_rows = []
for key in selected:
    members = groups[key]
    titles = []
    variants = []
    for member in members:
        title = clean_title(member.get("variant"))
        base = title
        suffix = 2
        while title.casefold() in {value.casefold() for value in titles}:
            title = f"{base} ({suffix})"
            suffix += 1
        titles.append(title)
        variants.append(
            {
                "sku": member["sku"].strip(),
                "title": title,
                "price": float(member["price_inr"]) if member.get("price_inr") else None,
                "metadata": {
                    "source_variant": member.get("variant") or "",
                    "sku_source": member.get("sku_source") or "",
                    "price_source": member.get("price_source") or "",
                    "source_file": member.get("source_file") or "",
                    "source_url": member.get("source_url") or "",
                    "source_category": member.get("category") or "",
                    "source_sub_category": member.get("sub_category") or "",
                    "source_product_type": member.get("product_type") or "",
                },
            }
        )

    image_base = f"{slug(members[0]['brand'])}-{slug(members[0]['name'])}"
    uid = image_base
    if uid in used_uids:
        uid = f"{uid}-{len(used_uids) + 1}"
    used_uids.add(uid)

    image = None
    source = Path(members[0].get("image_local") or "")
    if members[0].get("image_exists") == "y" and source.is_file():
        image = f"{uid}{source.suffix.lower() or '.jpg'}"
        shutil.copyfile(source, IMAGES / image)

    product = {
        "uid": uid,
        "brand": members[0]["brand"],
        "name": members[0]["name"],
        "category_l1": members[0]["category_l1"],
        "category_l2": members[0]["category_l2"],
        "source_url": members[0].get("source_url") or "",
        "source_file": members[0].get("source_file") or "",
        "image": image,
        "option_title": OPTION_TITLE,
        "variants": variants,
    }
    products.append(product)
    selection_rows.append(
        {
            "brand": product["brand"],
            "name": product["name"],
            "category_l1": product["category_l1"],
            "category_l2": product["category_l2"],
            "variant_count": len(variants),
            "skus": "|".join(variant["sku"] for variant in variants),
            "pilot": "y" if key in pilot_set else "n",
        }
    )

all_skus = [variant["sku"] for product in products for variant in product["variants"]]
if len(all_skus) != TARGET_SKUS or len(set(all_skus)) != TARGET_SKUS:
    raise RuntimeError("Manifest SKUs are not exactly 500 unique values")
if any(not product["variants"] for product in products):
    raise RuntimeError("Manifest contains a product without variants")

(PAYLOAD / "products500.json").write_text(json.dumps(products, indent=2), encoding="utf-8")
with SELECTION.open("w", encoding="utf-8-sig", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=selection_rows[0].keys())
    writer.writeheader()
    writer.writerows(selection_rows)

print(f"products: {len(products)} | skus: {len(all_skus)}")
for category in categories:
    category_products = [p for p in products if p["category_l1"] == category]
    print(
        f"  {category:<28} {len(category_products):>3} products, "
        f"{sum(len(p['variants']) for p in category_products):>3} skus"
    )
print("multi-variant products:", sum(len(p["variants"]) > 1 for p in products))
print(
    "images:",
    len(list(IMAGES.iterdir())),
    "| products without image:",
    sum(not product["image"] for product in products),
)
print("pilot sellers:")
for seller, product in zip(SELLER_CATEGORIES, products[:5]):
    print(f"  {seller}: {product['brand']} / {product['name']} ({len(product['variants'])} variants)")
