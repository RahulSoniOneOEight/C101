# BuildKart staging Tryton server.
# Local synthetic environment only — not production.

FROM python:3.12.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    TRYTOND_CONFIG=/etc/tryton/trytond.conf

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        postgresql-client \
        libxml2 \
        libxslt1.1 \
        libpq5 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/tryton

COPY requirements.txt /opt/tryton/requirements.txt
RUN pip install --no-cache-dir -r /opt/tryton/requirements.txt \
    && pip freeze > /opt/tryton/requirements-freeze.txt

COPY trytond.conf /etc/tryton/trytond.conf
COPY trytond_log.conf /etc/tryton/trytond_log.conf
COPY scripts /opt/tryton/scripts
RUN chmod +x /opt/tryton/scripts/*.sh

EXPOSE 8000

CMD ["/opt/tryton/scripts/start.sh"]
