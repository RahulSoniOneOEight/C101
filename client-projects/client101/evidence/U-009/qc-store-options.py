import json
import sys
import urllib.error
import urllib.request

API = f"http://{open('/tmp/u009-api-ip').read().strip()}:9010"
EXP = f"http://{open('/tmp/u009-exp-ip').read().strip()}:9020"
KEY = "pk_fee03ec911b430a1cc44fc4c4915a0154120b982557ad0bdac8000b3a6b87f00"
OFFER = "offer_01M637Y25X9AETDR0CPAMVNVAW"  # PowerMax published offer

results = []


def call(method, path, token=None, body=None, headers=None, base=EXP):
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
        return error.code, json.loads(error.read() or b"{}")


def check(name, ok, detail):
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + " :: " + json.dumps(detail)[:500])


_, challenge = call(
    "POST", "/v1/auth/otp/challenges", body={"identifier": "rsoni001@gmail.com"}
)
_, verified = call(
    "POST",
    "/v1/auth/otp/verify",
    body={"challenge_id": challenge.get("challenge_id"), "code": "123456"},
)
token = verified.get("session_token")

_, cart = call("POST", "/v1/carts", token, {"channel": "b2c_web"})
cart_id = cart.get("id")
call("POST", f"/v1/carts/{cart_id}/lines", token, {"offer_id": OFFER, "quantity": 1})
status, bound = call(
    "POST",
    f"/v1/carts/{cart_id}/customer-details",
    token,
    {
        "email": "rsoni001@gmail.com",
        "shipping_address": {
            "first_name": "QC",
            "last_name": "Options",
            "address_1": "12 Test Lane",
            "city": "Mumbai",
            "province": "MH",
            "postal_code": "400001",
            "country_code": "IN",
            "phone": "9999999999",
        },
    },
)
check(
    "cart.delivery_applied",
    status == 200 and (bound.get("delivery") or {}).get("total") == 4900,
    {"delivery": bound.get("delivery")},
)

store_status, store = call(
    "GET",
    f"/store/shipping-options?cart_id={cart_id}",
    headers={"x-publishable-api-key": KEY},
    base=API,
)
grouped = store.get("shipping_options") or {}
flat = [(seller, option) for seller, list in grouped.items() for option in list]
check(
    "store.one_seller_group",
    store_status == 200 and len(grouped) == 1 and list(grouped)[0].startswith("sel_"),
    {"status": store_status, "sellers": list(grouped)},
)
option = flat[0][1] if flat else {}
check(
    "store.calculated_amount_major",
    option.get("amount") == 49
    and (option.get("calculated_price") or {}).get("calculated_amount") == 49,
    {
        "amount": option.get("amount"),
        "calculated_price": option.get("calculated_price"),
        "name": option.get("name"),
        "seller": (option.get("seller") or {}).get("name"),
    },
)
check(
    "store.tax_inclusive_flag",
    (option.get("calculated_price") or {}).get("is_calculated_price_tax_inclusive")
    is True,
    {"calculated_price": option.get("calculated_price")},
)

exp_status, exp = call("GET", f"/v1/carts/{cart_id}/shipping-options", token)
exp_options = exp.get("shipping_options") or []
first = exp_options[0] if exp_options else {}
check(
    "experience.calculated_amount_minor",
    exp_status == 200 and first.get("amount") == 4900,
    {"status": exp_status, "options": exp_options[:1]},
)

print(
    "\nSUMMARY "
    + json.dumps(
        {
            "cart_id": cart_id,
            "store_sellers": list(grouped),
            "store_amount": option.get("amount"),
            "experience_amount": first.get("amount"),
            "checks": results,
        },
        indent=2,
    )
)
sys.exit(0 if all(row["ok"] for row in results) else 1)
