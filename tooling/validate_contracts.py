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

    print(
        "Contract validation passed: "
        f"{len(openapi['paths'])} API paths, "
        f"{len(asyncapi['channels'])} event channels, 9 fixtures."
    )


if __name__ == "__main__":
    main()
