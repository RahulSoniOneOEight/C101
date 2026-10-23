#!/usr/bin/env python3
"""Verify the governed staging catalogue and its persistent image mount."""

from __future__ import annotations

import argparse
import json
import subprocess
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

EXPECTED_PRODUCTS = 233
EXPECTED_SKUS = 500
EXPECTED_MOUNT = "/app/packages/api/static"
DEFAULT_CONTAINER = "buildkart-hosted-pilot-medusa-api-1"
DEFAULT_API = "https://api-staging.pinakaplay.cloud"


def verify_mount(container: str) -> None:
    completed = subprocess.run(
        ["docker", "inspect", container, "--format", "{{json .Mounts}}"],
        check=True,
        capture_output=True,
        text=True,
    )
    mounts = json.loads(completed.stdout)
    upload_mount = next(
        (mount for mount in mounts if mount.get("Destination") == EXPECTED_MOUNT),
        None,
    )
    if upload_mount is None:
        raise RuntimeError(f"{container} is missing {EXPECTED_MOUNT}")
    name = str(upload_mount.get("Name", ""))
    if upload_mount.get("Type") != "volume" or not name.endswith("_medusa_uploads"):
        raise RuntimeError(
            f"{EXPECTED_MOUNT} is not backed by the governed medusa_uploads volume"
        )
    print(f"mount: pass ({name})")


def request_status(url: str, method: str = "GET", attempts: int = 3) -> tuple[int, bytes]:
    last_status = 0
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(
                url,
                method=method,
                headers={"Accept": "application/json" if method == "GET" else "*/*"},
            )
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            last_status = error.code
        except (TimeoutError, urllib.error.URLError):
            last_status = 0
        if attempt + 1 < attempts:
            time.sleep(0.25 * (attempt + 1))
    return last_status, b""


def verify_catalogue(api_base: str) -> None:
    url = (
        f"{api_base.rstrip('/')}/v1/products"
        "?limit=250&catalogue_import=CHG-049"
    )
    status, payload = request_status(url)
    if status != 200:
        raise RuntimeError(f"catalogue request failed: HTTP {status}")
    body = json.loads(payload)
    products = body.get("products") if isinstance(body.get("products"), list) else []
    sku_count = sum(
        len(product.get("variants", []))
        for product in products
        if isinstance(product, dict) and isinstance(product.get("variants", []), list)
    )
    if body.get("count") != EXPECTED_PRODUCTS or len(products) != EXPECTED_PRODUCTS:
        raise RuntimeError(
            f"expected {EXPECTED_PRODUCTS} products; API reported {body.get('count')} "
            f"and returned {len(products)}"
        )
    if sku_count != EXPECTED_SKUS:
        raise RuntimeError(f"expected {EXPECTED_SKUS} SKUs; received {sku_count}")

    thumbnails = [product.get("thumbnail") for product in products if product.get("thumbnail")]
    if len(thumbnails) != EXPECTED_PRODUCTS or len(set(thumbnails)) != EXPECTED_PRODUCTS:
        raise RuntimeError(
            f"expected {EXPECTED_PRODUCTS} unique thumbnail URLs; "
            f"received {len(set(thumbnails))}"
        )

    def check_thumbnail(thumbnail: str) -> tuple[str, int] | None:
        image_status, _ = request_status(thumbnail, method="HEAD")
        return None if image_status == 200 else (thumbnail, image_status)

    with ThreadPoolExecutor(max_workers=20) as executor:
        failures = [result for result in executor.map(check_thumbnail, thumbnails) if result]
    if failures:
        preview = "\n".join(f"{status} {url}" for url, status in failures[:10])
        raise RuntimeError(
            f"{len(failures)}/{EXPECTED_PRODUCTS} thumbnails failed\n{preview}"
        )

    print(f"catalogue: pass ({EXPECTED_PRODUCTS} products, {EXPECTED_SKUS} SKUs)")
    print(f"thumbnails: pass ({EXPECTED_PRODUCTS}/{EXPECTED_PRODUCTS} HTTP 200)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-base", default=DEFAULT_API)
    parser.add_argument("--container", default=DEFAULT_CONTAINER)
    parser.add_argument("--skip-mount", action="store_true")
    args = parser.parse_args()

    if not args.skip_mount:
        verify_mount(args.container)
    verify_catalogue(args.api_base)


if __name__ == "__main__":
    main()
