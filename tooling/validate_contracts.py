"""Lightweight local validation for the CHG-017 API/event contract drafts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator
from yaml.constructor import ConstructorError


ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / "client-projects" / "client101" / "contracts"
OPENAPI_PATH = CONTRACTS / "openapi" / "buildkart-experience-v1.yaml"
MERCHANDISING_PATH = CONTRACTS / "openapi" / "buildkart-merchandising-presets-v1.yaml"
MERCHANDISING_OFFERS_PATH = CONTRACTS / "openapi" / "buildkart-merchandising-offers-v1.yaml"
ASYNCAPI_PATH = CONTRACTS / "asyncapi" / "buildkart-events-v1.yaml"
DATA_CONTRACT_PATH = CONTRACTS / "data-contract.yaml"
FIXTURES = CONTRACTS / "fixtures"


class StrictSafeLoader(yaml.SafeLoader):
    """Safe YAML loader that rejects duplicate mapping keys."""


def construct_unique_mapping(
    loader: StrictSafeLoader, node: yaml.MappingNode, deep: bool = False
) -> dict[str, Any]:
    mapping: dict[str, Any] = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            raise ConstructorError(
                "while constructing a mapping",
                node.start_mark,
                f"found duplicate key {key!r}",
                key_node.start_mark,
            )
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


StrictSafeLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, construct_unique_mapping
)


def load_yaml(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as stream:
        document = yaml.load(stream, Loader=StrictSafeLoader)
    if not isinstance(document, dict):
        raise AssertionError(f"{path} must contain a mapping")
    return document


def assert_local_refs_resolve(document: dict[str, Any]) -> None:
    def walk(value: Any) -> None:
        if isinstance(value, dict):
            ref = value.get("$ref")
            if isinstance(ref, str):
                assert ref.startswith("#/"), f"external reference is not allowed: {ref}"
                target: Any = document
                for part in ref[2:].split("/"):
                    key = part.replace("~1", "/").replace("~0", "~")
                    assert isinstance(target, dict) and key in target, f"unresolved $ref: {ref}"
                    target = target[key]
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(document)


def assert_unique_operation_ids(document: dict[str, Any]) -> None:
    seen: set[str] = set()
    for path, path_item in document["paths"].items():
        for method, operation in path_item.items():
            if method not in {"get", "post", "put", "patch", "delete"}:
                continue
            operation_id = operation.get("operationId")
            assert operation_id, f"{method.upper()} {path} has no operationId"
            assert operation_id not in seen, f"duplicate operationId: {operation_id}"
            seen.add(operation_id)


def validate_fixture(openapi: dict[str, Any], filename: str, schema_name: str) -> None:
    instance = json.loads((FIXTURES / filename).read_text(encoding="utf-8"))
    schema = openapi["components"]["schemas"][schema_name]
    validation_schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "allOf": [schema],
        "components": openapi["components"],
    }
    errors = sorted(
        Draft202012Validator(validation_schema).iter_errors(instance),
        key=lambda error: list(error.path),
    )
    if errors:
        detail = "\n".join(f"- {list(error.path)}: {error.message}" for error in errors)
        raise AssertionError(f"{filename} does not match {schema_name}:\n{detail}")


def main() -> None:
    openapi = load_yaml(OPENAPI_PATH)
    asyncapi = load_yaml(ASYNCAPI_PATH)
    data_contract = load_yaml(DATA_CONTRACT_PATH)

    assert openapi.get("openapi") == "3.1.0"
    assert asyncapi.get("asyncapi") == "3.1.0"
    assert openapi["info"]["version"].endswith("-draft")
    assert asyncapi["info"]["version"].endswith("-draft")
    assert data_contract["change_contract"] == "CHG-017"
    assert data_contract["change_contract_revision"] == 5
    assert data_contract["status"] == "draft"
    assert_local_refs_resolve(openapi)
    assert_local_refs_resolve(asyncapi)

    ownership = {
        entity["name"]: entity["canonical_owner"]
        for entity in data_contract["entities"]
    }
    required_ownership = {
        "order": "commerce",
        "checkout-attempt": "commerce",
        "cart": "commerce",
        "inventory": "erp",
        "inventory-reservation": "erp",
        "payment-execution-evidence": "payment-provider",
        "commerce-payment": "commerce-payment-integration",
        "shipment-execution-evidence": "logistics-provider",
        "commerce-shipment": "commerce-logistics-integration",
        "invoice": "erp-accounting",
        "accounting-record": "erp-accounting",
        "seller": "marketplace",
        "seller-offer": "marketplace",
        "marketplace-order-allocation": "marketplace",
    }
    for entity, owner in required_ownership.items():
        assert ownership.get(entity) == owner, f"unexpected owner for {entity}"

    required_paths = {
        "/v1/auth/otp/challenges",
        "/v1/auth/otp/verify",
        "/v1/products",
        "/v1/products/{productId}",
        "/v1/collections/{collectionKey}",
        "/v1/admin/collections",
        "/v1/content/app-shell",
        "/v1/carts",
        "/v1/carts/{cartId}/lines",
        "/v1/checkouts/{checkoutId}/complete",
        "/v1/checkouts/{checkoutId}/payment-sessions",
        "/v1/orders/{orderId}",
        "/v1/admin/orders/{orderId}",
        "/v1/admin/orders/{orderId}/reconciliation",
        "/v1/admin/recovery-cases/{recoveryCaseId}",
        "/v1/ops/integration-exceptions",
    }
    missing_paths = required_paths - set(openapi["paths"])
    assert not missing_paths, f"missing first-slice paths: {sorted(missing_paths)}"
    assert_unique_operation_ids(openapi)

    required_channels = {
        "orderCreated",
        "marketplaceAllocationCreated",
        "inventoryReservationCreated",
        "paymentStatusChanged",
        "paymentSimulationResultRecorded",
        "shipmentStatusChanged",
        "integrationDeliveryFailed",
    }
    missing_channels = required_channels - set(asyncapi["channels"])
    assert not missing_channels, f"missing first-slice channels: {sorted(missing_channels)}"

    validate_fixture(openapi, "composed-product.json", "ComposedProduct")
    validate_fixture(openapi, "seller-aware-cart.json", "Cart")
    validate_fixture(openapi, "canonical-order.json", "Order")
    validate_fixture(openapi, "integration-exception.json", "IntegrationException")
    validate_fixture(openapi, "checkout-attempt.json", "CheckoutSession")
    validate_fixture(openapi, "recovery-case.json", "RecoveryCase")
    validate_fixture(openapi, "staging-simulated-order.json", "Order")
    validate_fixture(openapi, "staging-order-reconciliation.json", "StagingOrderReconciliation")
    validate_fixture(openapi, "app-content.json", "AppContentBundle")
    validate_fixture(openapi, "storefront-layout.json", "StorefrontLayout")

    # --- CHG-032 storefront layout delivery ---------------------------------------------------
    storefront_layout = json.loads(
        (FIXTURES / "storefront-layout.json").read_text(encoding="utf-8")
    )
    schema = openapi["components"]["schemas"]
    module_types = set(schema["StorefrontLayoutModule"]["properties"]["type"]["enum"])
    membership_modes = set(schema["StorefrontModuleMembership"]["properties"]["mode"]["enum"])

    assert storefront_layout["channel"] in {"b2c", "b2b"}
    assert storefront_layout["locale"] in {"en-IN", "hi-IN"}
    assert storefront_layout["modules"], "a layout must compose at least one module"

    modules = {module["module_key"]: module for module in storefront_layout["modules"]}
    assert len(modules) == len(storefront_layout["modules"]), "duplicate module_key in layout"

    for module in storefront_layout["modules"]:
        assert module["type"] in module_types, f"unknown module type: {module['type']}"
        membership = module.get("membership")
        if membership is not None:
            assert membership["mode"] in membership_modes, (
                f"unknown membership mode: {membership['mode']}"
            )
            if membership["mode"] == "curated-collection":
                assert membership.get("collection_key"), (
                    f"{module['module_key']}: curated membership must reference a collection key"
                )

    # Merchandising labels are editorial and must survive as delivered fields.
    best_deals = modules["home-best-deals"]
    assert best_deals["type"] == "offer-collection"
    assert best_deals["title"] == "Best Deals"
    assert best_deals["tag"], "the Best Deals module must carry its editorial badge"

    # Ownership guard: the layout must never inline priced or transactional product data.
    forbidden = {"price", "amount", "total", "mrp", "stock", "inventory", "seller_id", "commission"}
    leaked: list[str] = []

    def walk(value: object, path: str) -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                if key in forbidden:
                    leaked.append(f"{path}.{key}" if path else key)
                walk(child, f"{path}.{key}" if path else key)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                walk(child, f"{path}[{index}]")

    walk(storefront_layout, "")
    assert not leaked, f"storefront layout must not inline transactional fields: {sorted(set(leaked))}"

    staging_order = json.loads(
        (FIXTURES / "staging-simulated-order.json").read_text(encoding="utf-8")
    )
    assert staging_order["test_order"] is True
    assert staging_order["payment_mode"] == "simulated"
    assert staging_order["payment_status"] == "simulated_accepted"
    assert staging_order["commerce_source"] == "medusa"

    reconciliation = json.loads(
        (FIXTURES / "staging-order-reconciliation.json").read_text(encoding="utf-8")
    )
    assert reconciliation["reconciled"] is True
    assert reconciliation["bank_receipt_claimed"] is False
    assert {reconciliation[key]["system"] for key in ("order", "allocation", "reservation", "movement", "accounting")} == {"medusa", "mercur", "tryton"}

    merchandising = load_yaml(MERCHANDISING_PATH)
    assert merchandising.get("openapi") == "3.1.0"
    assert merchandising["info"]["version"].endswith("-draft")
    assert_local_refs_resolve(merchandising)
    assert_unique_operation_ids(merchandising)
    validate_fixture(
        merchandising, "merchandising-presets.json", "MerchandisingPresetCatalogue"
    )

    presets = json.loads(
        (FIXTURES / "merchandising-presets.json").read_text(encoding="utf-8")
    )
    assert presets["change_id"] == "CHG-029"
    assert presets["funding_source"] == "marketplace"
    assert presets["test_data"] is True
    assert presets["payment_mode"] == "simulated"

    promotion_codes = {promotion["code"] for promotion in presets["promotions"]}
    assert len(promotion_codes) == len(presets["promotions"]), "duplicate promotion code"
    campaign_keys = {campaign["campaign_key"] for campaign in presets["campaigns"]}
    assert len(campaign_keys) == len(presets["campaigns"]), "duplicate campaign key"
    for promotion in presets["promotions"]:
        assert promotion["funding_source"] == "marketplace", "promotion must be marketplace funded"
        assert (
            promotion["value"] <= presets["discount_ceiling_percent"]
        ), f"discount exceeds ceiling: {promotion['code']}"
        assert (
            promotion["campaign_key"] in campaign_keys
        ), f"promotion references unknown campaign: {promotion['code']}"
        for rule in promotion["rules"]:
            assert rule["attribute"], f"rule missing attribute: {promotion['code']}"
            assert rule["operator"] in {"gte", "lte", "gt", "lt", "eq", "in"}, (
                f"unsupported operator: {rule['operator']}"
            )
            assert rule["values"], f"rule missing values: {promotion['code']}"

    free_shipping = next(
        promotion
        for promotion in presets["promotions"]
        if promotion["code"] == "BK-STG-PROMO-FREESHIP"
    )
    subtotal_rule = next(
        (rule for rule in free_shipping["rules"] if rule["attribute"] == "subtotal"), None
    )
    assert subtotal_rule is not None, "free shipping must declare a cart-value gate"
    assert subtotal_rule["operator"] == "gte"
    assert subtotal_rule["values"] == ["10000"], "free shipping gate must be INR 10000"
    assert not free_shipping["deferred_conditions"], (
        "the free-shipping cart-value gate is enforced and must not be deferred"
    )
    for campaign in presets["campaigns"]:
        assert campaign["funding_source"] == "marketplace", "campaign must be marketplace funded"
        for code in campaign["promotion_codes"]:
            assert code in promotion_codes, f"campaign references unknown promotion: {code}"

    collection_keys = {collection["collection_key"] for collection in presets["collections"]}
    assert len(collection_keys) == len(presets["collections"]), "duplicate collection key"
    for collection in presets["collections"]:
        assert collection["categories"], f"collection has no categories: {collection['collection_key']}"
    for element in presets["content"]:
        assert element["locale"] in {"en-IN", "hi-IN"}, f"unknown locale: {element['id']}"

    # --- CHG-030 offer lab -----------------------------------------------------------------
    merchandising_offers = load_yaml(MERCHANDISING_OFFERS_PATH)
    assert merchandising_offers.get("openapi") == "3.1.0"
    assert merchandising_offers["info"]["version"].endswith("-draft")
    assert_local_refs_resolve(merchandising_offers)
    assert_unique_operation_ids(merchandising_offers)
    validate_fixture(
        merchandising_offers, "merchandising-offers.json", "MerchandisingOfferCatalogue"
    )

    offers = json.loads(
        (FIXTURES / "merchandising-offers.json").read_text(encoding="utf-8")
    )
    assert offers["change_id"] == "CHG-030"
    assert offers["funding_source"] == "marketplace"
    assert offers["campaign"]["funding_source"] == "marketplace"

    percentage_mechanics = {"order-percentage", "items-percentage", "shipping-percentage"}
    offer_codes = {offer["code"] for offer in offers["offers"]}
    assert len(offer_codes) == len(offers["offers"]), "duplicate offer code"

    triggers = {offer["trigger"] for offer in offers["offers"]}
    assert triggers <= {"automatic", "code"}, f"unknown trigger: {triggers}"
    assert "automatic" not in triggers, (
        "the seeded offer lab must be code-triggered while the pilot is live"
    )

    for offer in offers["offers"]:
        assert offer["funding_source"] == "marketplace", f"not marketplace funded: {offer['code']}"
        assert offer["mechanic"] in {
            "order-percentage",
            "items-percentage",
            "items-fixed",
            "free-shipping",
            "shipping-percentage",
            "buyget",
        }, f"unknown mechanic: {offer['mechanic']}"
        if offer["mechanic"] in percentage_mechanics:
            assert (
                offer["value"] <= offers["discount_ceiling_percent"]
            ), f"discount exceeds ceiling: {offer['code']}"
        if offer["mechanic"] == "free-shipping":
            assert offer["value"] == 100, (
                f"{offer['code']}: free shipping must be 100, never a fixed zero discount"
            )

    # A promotion-level item-quantity rule is not evaluable; quantity gates must be per line.
    assert not any(
        offer["min_quantity"] is not None and offer["target"]["type"] == "order"
        for offer in offers["offers"]
    ), "quantity gates must target line items, not the order"

    # De-overlap: the ceiling is per-promotion, so the seeded set must not be able to compound
    # past it. At most one order-wide percentage offer, and distinct line-item scopes.
    order_offers = [o for o in offers["offers"] if o["mechanic"] == "order-percentage"]
    assert len(order_offers) <= 1, "at most one order-wide percentage offer is allowed"

    line_scopes = [
        o["target"]["reference"]
        for o in offers["offers"]
        if o["mechanic"] in {"items-percentage", "items-fixed"}
    ]
    assert len(set(line_scopes)) == len(line_scopes), (
        f"line-item offers must target distinct categories: {line_scopes}"
    )

    line_rates = [o["value"] for o in offers["offers"] if o["mechanic"] == "items-percentage"]
    worst_case = (order_offers[0]["value"] if order_offers else 0) + max(line_rates or [0])
    assert worst_case <= offers["discount_ceiling_percent"], (
        f"worst-case cumulative discount {worst_case}% exceeds the "
        f"{offers['discount_ceiling_percent']}% ceiling"
    )

    print(
        "Contract validation passed: "
        f"{len(openapi['paths'])} experience paths, "
        f"{len(merchandising['paths'])} merchandising paths, "
        f"{len(merchandising_offers['paths'])} merchandising offer paths, "
        f"{len(asyncapi['channels'])} event channels, 12 fixtures."
    )


if __name__ == "__main__":
    main()
