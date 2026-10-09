# BuildKart staging Tryton server + web client.
# Local synthetic environment only — not production.

FROM python:3.12.12-slim-bookworm

# Pinned SAO client; must track the trytond 8.0 series in requirements.txt.
ARG SAO_VERSION=8.0.12

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    TRYTOND_CONFIG=/etc/tryton/trytond.conf

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        postgresql-client \
        libxml2 \
        libxslt1.1 \
        libpq5 \
        curl \
        ca-certificates \
        nodejs \
        npm \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/tryton

COPY requirements.txt /opt/tryton/requirements.txt
RUN pip install --no-cache-dir -r /opt/tryton/requirements.txt \
    && pip freeze > /opt/tryton/requirements-freeze.txt

# Tryton web client (SAO). The release tarball is source; its runtime
# dependencies are installed into node_modules and served by trytond via the
# [web] root setting in trytond.conf.
RUN mkdir -p /opt/tryton/sao \
    && curl -sSL "https://downloads.tryton.org/8.0/tryton-sao-${SAO_VERSION}.tgz" -o /tmp/sao.tgz \
    && tar -xzf /tmp/sao.tgz -C /opt/tryton/sao --strip-components=1 \
    && cd /opt/tryton/sao \
    && npm install --omit=dev --legacy-peer-deps --no-audit --no-fund \
    && rm -f /tmp/sao.tgz

COPY trytond.conf /etc/tryton/trytond.conf
COPY trytond_log.conf /etc/tryton/trytond_log.conf
COPY scripts /opt/tryton/scripts
RUN chmod +x /opt/tryton/scripts/*.sh

EXPOSE 8000

CMD ["/opt/tryton/scripts/start.sh"]
