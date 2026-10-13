"""Validates the CMS content-type and component schemas under services/cms.

Strapi is not installed in this repository, so a broken reference (a content type pointing at a
component or content type that does not exist) would otherwise fail only at CMS boot. This script
fails closed on:

  1. a component reference (`layout.foo`) with no matching component schema,
  2. a relation target (`api::type.type`) with no matching content type,
  3. a content type missing draftAndPublish or i18n,
  4. a CMS schema that declares a transactional field (price, stock, seller, order, payment, credit),
  5. a duplicate component or content-type identifier.

CMS ownership rule: the CMS owns editorial content only and must never own transactional state.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any, Iterator

ROOT = Path(__file__).resolve().parents[1]
CMS = ROOT / "services" / "cms"

# Fields the CMS must never own, checked case-insensitively against attribute names.
FORBIDDEN_ATTRIBUTE_TOKENS = (
    "price",
    "unitprice",
    "stock",
    "inventory",
    "stocklevel",
    "seller",
    "sellertier",
    "order",
    "orderid",
    "payment",
    "paymentstatus",
    "credit",
    "creditlimit",
    "commission",
    "payout",
    "settlement",
    "invoice",
)

COMPONENT_REF = re.compile(r"^[a-z0-9-]+\.[a-z0-9-]+$")
RELATION_TARGET = re.compile(r"^api::([a-z0-9-]+)\.([a-z0-9-]+)$")


def load(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise AssertionError(f"{path.relative_to(ROOT)} is not valid JSON: {error}") from error


def iter_attributes(schema: dict[str, Any]) -> Iterator[tuple[str, dict[str, Any]]]:
    for name, attribute in (schema.get("attributes") or {}).items():
        if isinstance(attribute, dict):
            yield name, attribute


def declared_components() -> dict[str, Path]:
    """Component identity is its folder-and-file path in Strapi dot notation,
    e.g. layout/offer-collection -> layout.offer-collection."""
    components: dict[str, Path] = {}
    for path in sorted((CMS / "src" / "components").rglob("*.json")):
        relative = path.relative_to(CMS / "src" / "components").with_suffix("")
        key = ".".join(relative.parts)
        if key in components:
            raise AssertionError(f"duplicate component '{key}': {path.relative_to(ROOT)}")
        components[key] = path
    return components


def declared_content_types() -> dict[str, Path]:
    """Content type identity is the schema's own singularName, e.g. category-editorial."""
    types: dict[str, Path] = {}
    # Restrict discovery to the canonical application API tree. A local Strapi installation brings
    # hundreds of dependency-owned `schema.json` files under node_modules; those are not BuildKart
    # content types and must not make repository validation environment-dependent.
    for path in sorted((CMS / "src" / "api").rglob("schema.json")):
        schema = load(path)
        singular = (schema.get("info") or {}).get("singularName")
        if not singular:
            raise AssertionError(f"{path.relative_to(ROOT)} has no info.singularName")
        if singular in types:
            raise AssertionError(
                f"duplicate content type '{singular}': {path.relative_to(ROOT)} and "
                f"{types[singular].relative_to(ROOT)}"
            )
        types[singular] = path
    return types


def assert_app_layout() -> int:
    """A Strapi app only boots if its config, package metadata and per-type API files exist."""
    for name in ("package.json", "tsconfig.json", "Dockerfile", ".dockerignore", ".env.example"):
        assert (CMS / name).exists(), f"services/cms/{name} is required for a runnable Strapi app"

    package = load(CMS / "package.json")
    dependencies = package.get("dependencies") or {}
    assert "@strapi/strapi" in dependencies, "package.json must depend on @strapi/strapi"
    assert "build" in (package.get("scripts") or {}), "package.json must expose a build script"

    for config_name in ("admin", "api", "database", "middlewares", "plugins", "server"):
        config_path = CMS / "config" / f"{config_name}.ts"
        assert config_path.exists(), f"missing Strapi config: config/{config_name}.ts"

    api_root = CMS / "src" / "api"
    assert api_root.exists(), "missing src/api for Strapi content-type APIs"

    checked = 0
    for api_dir in sorted(path for path in api_root.iterdir() if path.is_dir()):
        name = api_dir.name
        for kind in ("routes", "controllers", "services"):
            file = api_dir / kind / f"{name}.ts"
            assert file.exists(), (
                f"missing {kind} file for content type '{name}': {file.relative_to(ROOT)}"
            )
        schema_path = api_dir / "content-types" / name / "schema.json"
        assert schema_path.exists(), (
            f"content type '{name}' must declare content-types/{name}/schema.json"
        )
        checked += 1

    assert checked, "no Strapi content-type APIs found"
    return checked


def main() -> None:
    if not CMS.exists():
        print("CMS directory not found; nothing to validate.")
        return

    components = declared_components()
    content_types = declared_content_types()
    if not content_types:
        print("No CMS content types declared; nothing to validate.")
        return

    references: list[str] = []
    forbidden: list[str] = []

    for singular, path in content_types.items():
        schema = load(path)
        relative = path.relative_to(ROOT)

        options = schema.get("options") or {}
        assert options.get("draftAndPublish") is True, (
            f"{relative}: content types must enable draftAndPublish"
        )
        i18n = (schema.get("pluginOptions") or {}).get("i18n") or {}
        assert i18n.get("localized") is True, f"{relative}: content types must enable i18n"

        for name, attribute in iter_attributes(schema):
            attribute_type = attribute.get("type")

            if attribute_type == "component":
                component = attribute.get("component")
                assert component, f"{relative}: attribute '{name}' has no component"
                assert "repeat" not in attribute, (
                    f"{relative}: attribute '{name}' uses invalid Strapi key 'repeat'; "
                    "use 'repeatable'"
                )
                references.append(f"{relative}:{name} -> {component}")
                assert component in components, (
                    f"{relative}: attribute '{name}' references missing component '{component}'"
                )
            elif attribute_type == "dynamiczone":
                zone_components = attribute.get("components") or []
                assert zone_components, (
                    f"{relative}: dynamiczone '{name}' must declare components"
                )
                for component in zone_components:
                    references.append(f"{relative}:{name} -> {component}")
                    assert component in components, (
                        f"{relative}: attribute '{name}' references missing component '{component}'"
                    )
            elif attribute_type == "relation":
                target = attribute.get("target")
                assert target, f"{relative}: relation '{name}' has no target"
                match = RELATION_TARGET.match(str(target))
                assert match, f"{relative}: relation '{name}' has malformed target '{target}'"
                target_type = match.group(1)
                references.append(f"{relative}:{name} -> {target}")
                assert target_type in content_types, (
                    f"{relative}: relation '{name}' targets unknown content type '{target}'"
                )

            normalised = re.sub(r"[^a-z0-9]", "", str(name).lower())
            for token in FORBIDDEN_ATTRIBUTE_TOKENS:
                if token in normalised:
                    forbidden.append(f"{relative}:{name}")

    for component_key, path in components.items():
        schema = load(path)
        relative = path.relative_to(ROOT)
        assert (schema.get("info") or {}).get("displayName"), (
            f"{relative}: component must declare info.displayName"
        )
        if component_key.startswith("layout."):
            module_key = (schema.get("attributes") or {}).get("moduleKey") or {}
            assert module_key.get("type") == "string" and module_key.get("required") is True, (
                f"{relative}: layout components must declare required string moduleKey"
            )
        for name, attribute in iter_attributes(schema):
            if attribute.get("type") == "relation":
                target = attribute.get("target")
                match = RELATION_TARGET.match(str(target))
                assert match, f"{relative}: relation '{name}' has malformed target '{target}'"
                references.append(f"{relative}:{name} -> {target}")
                assert match.group(1) in content_types, (
                    f"{relative}: relation '{name}' targets unknown content type '{target}'"
                )
            normalised = re.sub(r"[^a-z0-9]", "", str(name).lower())
            for token in FORBIDDEN_ATTRIBUTE_TOKENS:
                if token in normalised:
                    forbidden.append(f"{relative}:{name}")

    assert not forbidden, (
        "CMS schemas must not declare transactional fields: " + ", ".join(sorted(forbidden))
    )

    apis = assert_app_layout()

    print(
        "CMS schema validation passed: "
        f"{len(content_types)} content types, {len(components)} components, "
        f"{len(references)} resolved references, {apis} Strapi content-type APIs."
    )


if __name__ == "__main__":
    try:
        main()
    except AssertionError as error:
        print(f"CMS schema validation failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
