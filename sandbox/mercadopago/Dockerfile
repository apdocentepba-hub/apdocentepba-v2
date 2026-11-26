FROM node:22-bookworm-slim AS node
FROM postgres:17-bookworm
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY sandbox/mercadopago/ /app/sandbox/mercadopago/
COPY scripts/apd-commercial-checkout.mjs scripts/apd-commercial-db-fixture.sql scripts/apd-commercial-payment-fixture.sql scripts/apd-commercial-preferences-fixture.sql scripts/apd-commercial-full-pg-fixture.sql /app/scripts/
COPY docs/sql/APD_COMMERCIAL_CONSOLIDATION_CANDIDATE.sql docs/sql/APD_COMMERCIAL_PAYMENT_CANDIDATE.sql docs/sql/APD_COMMERCIAL_CHECKOUT_CANDIDATE.sql docs/sql/APD_COMMERCIAL_PREFERENCES_CANDIDATE.sql docs/sql/APD_COMMERCIAL_ACTIVATE_CATALOG_CANDIDATE.sql /app/docs/sql/
RUN node --check sandbox/mercadopago/lab.mjs && node --check sandbox/mercadopago/server.mjs
EXPOSE 10000
ENTRYPOINT ["bash", "/app/sandbox/mercadopago/start.sh"]
