import json
import sys
import urllib.error
import urllib.request

BASE = "https://api-staging.pinakaplay.cloud"
MEDUSA = "https://ops-staging.pinakaplay.cloud"
KEY = "pk_fee03ec911b430a1cc44fc4c4915a0154120b982557ad0bdac8000b3a6b87f00"
OFFER = "offer_01M637Y25X9AETDR0CPAMVNVAW"
TITLE = "staging"

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
        with urllib.request.urlopen(request, timeout=120) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read() or b"{}")


def check(name, ok, detail):
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + " :: " + json.dumps(detail)[:500])


status, health = call(BASE, "GET", "/health")
check("staging.health", status == 200 and health.get("status") == "ok", health)

status, products = call(BASE, "GET", "/v1/products?limit=6")
items = products.get("products") or products.get("items") or []
check("staging.products", status == 200 and len(items) > 0, {"count": len(items)})

status, shell = call(BASE, "GET", "/v1/content/app-shell?locale=en-IN")
check("staging.home_shell", status == 200 and bool(shell.get("items")), {"items": len(shell.get("items") or [])})


def login(email):
    status, challenge = call(BASE, "POST", "/v1/auth/otp/challenges", body={"identifier": email})
    if status not in (200, 201):
        return None, {"status": status, "body": challenge}
    status, verified = call(
        BASE,
        "POST",
        "/v1/auth/otp/verify",
        body={"challenge_id": challenge.get("challenge_id"), "code": "123456"},
    )
    return verified.get("session_token"), {"status": status, "user": verified.get("user", {}).get("id")}


def address(pincode):
    return {
        "first_name": "U009",
        "last_name": "Staging",
        "address_1": "12 Test Lane",
        "city": "Mumbai",
        "province": "MH",
        "postal_code": pincode,
        "country_code": "IN",
        "phone": "9999999999",
    }


def cart_with_delivery(token, email, channel, pincode):
    status, cart = call(BASE, "POST", "/v1/carts", token, {"channel": channel})
    cart_id = cart.get("id")
    call(BASE, "POST", f"/v1/carts/{cart_id}/lines", token, {"offer_id": OFFER, "quantity": 1})
    status, bound = call(
        BASE,
        "POST",
        f"/v1/carts/{cart_id}/customer-details",
        token,
        {"email": email, "shipping_address": address(pincode)},
    )
    return cart_id, status, bound


def run(label, email, channel, pincode, expected, complete):
    token, detail = login(email)
    check(f"{label}.login", token is not None, detail)
    if not token:
        return None
    cart_id, status, bound = cart_with_delivery(token, email, channel, pincode)
    delivery = bound.get("delivery") or {}
    check(
        f"{label}.delivery_{expected}",
        status == 200
        and delivery.get("total") == expected
        and bound.get("shipping_total") == expected,
        {
            "status": status,
            "delivery": delivery,
            "shipping_total": bound.get("shipping_total"),
            "total": bound.get("total"),
        },
    )

    if pincode == "400001":
        store_status, store = call(
            BASE,
            "GET",
            f"/v1/carts/{cart_id}/shipping-options",
            token,
        )
        options = store.get("shipping_options") or []
        first = options[0] if options else {}
        check(
            f"{label}.options_priced",
            store_status == 200
            and first.get("amount") == 4900
            and first.get("is_tax_inclusive") is True,
            {
                "status": store_status,
                "amount": first.get("amount"),
                "tax_inclusive": first.get("is_tax_inclusive"),
                "seller": (first.get("seller") or {}).get("name"),
            },
        )

    if not complete:
        return cart_id

    status, completed = call(BASE, "POST", f"/v1/checkouts/{cart_id}/complete", token)
    order_group = completed.get("order_group") or {}
    check(
        f"{label}.complete",
        status == 200 and completed.get("type") == "order_group",
        {"status": status, "order_group": order_group.get("id"), "payment": completed.get("payment")},
    )
    status, orders = call(BASE, "GET", "/v1/me/orders?limit=10", token)
    record = next(
        (row for row in (orders.get("items") or []) if row.get("medusa_order_group_id") == order_group.get("id")),
        None,
    )
    check(
        f"{label}.order_shipping",
        status == 200 and record is not None and record.get("shipping_minor") == expected,
        {
            "order_number": (record or {}).get("order_number"),
            "shipping_minor": (record or {}).get("shipping_minor"),
            "total_minor": (record or {}).get("total_minor"),
        },
    )
    return {
        "cart_id": cart_id,
        "order_group": order_group.get("id"),
        "order_number": (record or {}).get("order_number"),
        "shipping_minor": (record or {}).get("shipping_minor"),
        "total_minor": (record or {}).get("total_minor"),
    }


# Default fee check: no row for 999999, so Rs 99.
b2c_default = run("staging.b2c.default", "rsoni001@gmail.com", "b2c_web", "999999", 9900, False)

# Exact rate and real orders.
b2c = run("staging.b2c", "rsoni001@gmail.com", "b2c_web", "400001", 4900, True)
b2b = run("staging.b2b", "buyer.b2b01@buildkart.test", "b2b_web", "400001", 4900, True)

print("\nSUMMARY " + json.dumps({"b2c_default": b2c_default, "b2c": b2c, "b2b": b2b, "checks": results}, indent=2))
sys.exit(0 if all(row["ok"] for row in results) else 1)
