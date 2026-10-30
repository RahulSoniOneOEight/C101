import json
import sys
import urllib.error
import urllib.request

IP = open("/tmp/u009-exp-ip").read().strip()
BASE = f"http://{IP}:9020"
OTP = "123456"
OFFER = "offer_01M637Y25X9AETDR0CPAMVNVAW"  # PowerMax Depot, published, stock 50

results = []


def call(method, path, token=None, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, method=method, data=data)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            payload = response.read()
            return response.status, json.loads(payload or b"{}")
    except urllib.error.HTTPError as error:
        payload = error.read()
        try:
            parsed = json.loads(payload or b"{}")
        except Exception:
            parsed = {"raw": payload.decode(errors="replace")}
        return error.code, parsed


def check(name, ok, detail):
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + " :: " + json.dumps(detail)[:400])


# ---------- home page ----------
status, health = call("GET", "/health")
check("home.health", status == 200 and health.get("status") == "ok", health)

status, products = call("GET", "/v1/products?limit=6")
items = products.get("products") or products.get("items") or []
check(
    "home.products",
    status == 200 and len(items) > 0,
    {"status": status, "count": len(items), "first": (items[0].get("title") if items else None)},
)

status, shell = call("GET", "/v1/content/app-shell?locale=en-IN")
check("home.app_shell", status == 200 and bool(shell.get("items")), {"status": status, "items": len(shell.get("items") or [])})

status, presentation = call("GET", "/v1/content/presentation?locale=en-IN")
check("home.presentation", status == 200, {"status": status})

status, collections = call("GET", "/v1/content/curated-collections?locale=en-IN")
check("home.curated_collections", status == 200, {"status": status})


def login(email):
    status, challenge = call("POST", "/v1/auth/otp/challenges", body={"identifier": email})
    if status not in (200, 201) or not challenge.get("challenge_id"):
        return None, {"challenge_status": status, "body": challenge}
    status, verified = call(
        "POST",
        "/v1/auth/otp/verify",
        body={"challenge_id": challenge["challenge_id"], "code": OTP},
    )
    if status != 200 or not verified.get("session_token"):
        return None, {"verify_status": status, "body": verified}
    return verified["session_token"], {"user": verified.get("user", {}).get("id")}


def run_order(label, email, channel):
    token, auth_detail = login(email)
    check(f"{label}.login", token is not None, auth_detail)
    if not token:
        return None

    status, cart = call("POST", "/v1/carts", token, {"channel": channel})
    check(f"{label}.create_cart", status in (200, 201), {"status": status, "cart": cart.get("id"), "channel": cart.get("channel")})
    cart_id = cart.get("id")
    if not cart_id:
        return None

    status, with_line = call("POST", f"/v1/carts/{cart_id}/lines", token, {"offer_id": OFFER, "quantity": 1})
    check(
        f"{label}.add_line",
        status == 200 and len(with_line.get("items") or []) == 1,
        {"status": status, "items": len(with_line.get("items") or []), "subtotal": with_line.get("subtotal")},
    )

    status, bound = call(
        "POST",
        f"/v1/carts/{cart_id}/customer-details",
        token,
        {
            "email": email,
            "shipping_address": {
                "first_name": "U009",
                "last_name": "QC",
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
    lines = delivery.get("lines") or []
    check(
        f"{label}.address_binds_delivery",
        status == 200 and len(lines) == 1 and lines[0].get("status") == "applied",
        {"status": status, "delivery": delivery, "shipping_total": bound.get("shipping_total"), "total": bound.get("total")},
    )
    check(
        f"{label}.delivery_fee_4900",
        delivery.get("total") == 4900 and bound.get("shipping_total") == 4900,
        {"delivery_total": delivery.get("total"), "shipping_total": bound.get("shipping_total")},
    )

    status, refreshed = call("POST", f"/v1/carts/{cart_id}/delivery", token)
    check(
        f"{label}.delivery_refresh",
        status == 200 and (refreshed.get("delivery") or {}).get("total") == 4900,
        {"status": status, "delivery": refreshed.get("delivery")},
    )

    status, completed = call("POST", f"/v1/checkouts/{cart_id}/complete", token)
    order_group = completed.get("order_group") or {}
    check(
        f"{label}.complete",
        status == 200 and completed.get("type") == "order_group",
        {
            "status": status,
            "type": completed.get("type"),
            "order_group": order_group.get("id"),
            "payment": completed.get("payment"),
        },
    )

    status, orders = call("GET", "/v1/me/orders?limit=50", token)
    record = next(
        (
            item
            for item in (orders.get("items") or [])
            if item.get("medusa_order_group_id") == order_group.get("id")
        ),
        None,
    )
    check(
        f"{label}.order_shipping_4900",
        status == 200 and record is not None and record.get("shipping_minor") == 4900,
        {
            "status": status,
            "order_number": (record or {}).get("order_number"),
            "shipping_minor": (record or {}).get("shipping_minor"),
            "total_minor": (record or {}).get("total_minor"),
            "currency": (record or {}).get("currency_code"),
        },
    )
    return {
        "cart_id": cart_id,
        "order_group": order_group.get("id"),
        "order_number": (record or {}).get("order_number"),
        "shipping_minor": (record or {}).get("shipping_minor"),
        "total_minor": (record or {}).get("total_minor"),
        "delivery": delivery,
        "item_price": (with_line.get("items") or [{}])[0].get("unit_price"),
    }


b2c = run_order("b2c", "rsoni001@gmail.com", "b2c_web")
b2b = run_order("b2b", "buyer.b2b01@buildkart.test", "b2b_web")

print("\nSUMMARY " + json.dumps({"b2c": b2c, "b2b": b2b, "checks": results}, indent=2))
failures = [r for r in results if not r["ok"]]
sys.exit(1 if failures else 0)
