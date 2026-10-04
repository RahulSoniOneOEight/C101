#!/usr/bin/env sh
set -e

DB_NAME="${TRYTOND_DB_NAME:-buildkart_tryton}"
MODULES="${TRYTOND_MODULES:-stock,sale,stock_supply,account,account_invoice}"
PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-buildkart}"
export PGPASSWORD="${PGPASSWORD:-buildkart}"

echo "Ensuring Tryton database '${DB_NAME}' exists"
if psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d postgres -tAc \
     "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1; then
  echo "Database '${DB_NAME}' already exists"
else
  createdb -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" "${DB_NAME}"
  echo "Database '${DB_NAME}' created"
fi

echo "Initialising Tryton database '${DB_NAME}' with modules: ${MODULES}"
# `-u` activates/updates the business modules; `--all` alone only updates already-activated ones.
MODULE_ARGS="$(printf '%s' "${MODULES}" | tr ',' ' ')"
trytond-admin -c "${TRYTOND_CONFIG}" -d "${DB_NAME}" -u ${MODULE_ARGS} --activate-dependencies -vv

echo "Setting admin password"
printf '%s\n' "${TRYTOND_ADMIN_PASSWORD:-buildkart-staging-admin}" > /tmp/admin_pass
TRYTONPASSFILE=/tmp/admin_pass trytond-admin -c "${TRYTOND_CONFIG}" -d "${DB_NAME}" -p -vv

echo "Starting Tryton server"
exec trytond -c "${TRYTOND_CONFIG}" --logconf /etc/tryton/trytond_log.conf
