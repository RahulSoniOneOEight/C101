import json
import sys
import urllib.error
import urllib.request

EXP = f"http://{open('/tmp/u009-exp-ip').read().strip()}:9020"
API = f"http://{open('/tmp/u009-api-ip').read().strip()}:9010"
OFFER = "offer_01M637Y25X9AETDR0CPAMVNVAW"  # PowerMax published offer

results = []


def call(method, path, token=None, body=None, base=EXP):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(base + path, method=method, data=data)
    request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read() or b"{}")


def check(name, ok, detail):
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + " :: " + json.dumps(detail)[:600])


_, admin_login = call(
    "POST",
    "/auth/user/emailpass",
    body={"email": "u009-qc@buildkart.test", "password": "U009-QC-Passw0rd!"},
    base=API,
)
admin = admin_login.get("token")
call(
    "POST",
    "/admin/buildkart/delivery-rates",
    admin,
    {"seller_id": "sel_01M4EC9CVVHG168X1DHHBY29HY", "pincode": "400001", "fee": 49},
    base=API,
)

_, challenge = call(
    "POST", "/v1/auth/otp/challenges", body={"identifier": "rsoni001@gmail.com"}
)
_, verified = call(
    "POST",
    "/v1/auth/otp/verify",
    body={"challenge_id": challenge.get("challenge_id"), "code": "123456"},
)
b2c_token = verified.get("session_token")

_, b2b_challenge = call(
    "POST",
    "/v1/auth/otp/challenges",
    body={"identifier": "buyer.b2b01@buildkart.test"},
)
_, b2b_verified = call(
    "POST",
    "/v1/auth/otp/verify",
    body={"challenge_id": b2b_challenge.get("challenge_id"), "code": "123456"},
)
b2b_token = b2b_verified.get("session_token")


def fee_cart(token, email, channel):
    _, cart = call("POST", "/v1/carts", token, {"channel": channel})
    cart_id = cart.get("id")
    call("POST", f"/v1/carts/{cart_id}/lines", token, {"offer_id": OFFER, "quantity": 1})
    status, bound = call(
        "POST",
        f"/v1/carts/{cart_id}/customer-details",
        token,
        {
            "email": email,
            "shipping_address": {
                "first_name": "QC",
                "last_name": "Promo",
                "address_1": "12 Test Lane",
                "city": "Mumbai",
                "province": "MH",
                "postal_code": "400001",
                "country_code": "IN",
                "phone": "9999999999",
            },
        },
    )
    return cart_id, bound


scenarios = [
    ("FREESHIP", "rsoni001@gmail.com", "b2c_web", b2c_token),
    ("TRADEVIP", "buyer.b2b01@buildkart.test", "b2b_web", b2b_token),
]

for code, email, channel, token in scenarios:
    cart_id, bound = fee_cart(token, email, channel)
    check(
        f"{code}.fee_before",
        (bound.get("delivery") or {}).get("total") == 4900
        and bound.get("shipping_total") == 4900,
        {"delivery": bound.get("delivery"), "shipping_total": bound.get("shipping_total")},
    )

    status, applied = call(
        "POST", f"/v1/carts/{cart_id}/promotions", token, {"code": code}
    )
    promotions = [row.get("code") for row in (applied.get("promotions") or [])]
    delivery = applied.get("delivery") or {}
    check(
        f"{code}.applied",
        status == 200 and code in promotions,
        {"status": status, "promotions": promotions},
    )
    check(
        f"{code}.shipping_nets_zero",
        applied.get("shipping_total") == 0
        and applied.get("shipping_discount_total") == 4900,
        {
            "shipping_total": applied.get("shipping_total"),
            "shipping_discount_total": applied.get("shipping_discount_total"),
            "discount_total": applied.get("discount_total"),
            "total": applied.get("total"),
        },
    )
    check(
        f"{code}.discount_line_visible",
        (delivery.get("total") == 4900)
        and (delivery.get("lines") or [{}])[0].get("status") == "applied",
        {"delivery": delivery},
    )

print(
    "\nSUMMARY "
    + json.dumps(
        {"codes": ["FREESHIP", "TRADEVIP"], "checks": results},
        indent=2,
    )
)
sys.exit(0 if all(row["ok"] for row in results) else 1)
