#!/usr/bin/env sh
set -e

DB_NAME="${TRYTOND_DB_NAME:-buildkart_tryton}"
MODULES="${TRYTOND_MODULES:-stock,sale,stock_supply,account,account_invoice}"

echo "Re-initialising Tryton database '${DB_NAME}' (destructive, staging only)"
trytond-admin -c "${TRYTOND_CONFIG}" -d "${DB_NAME}" --all -vv
