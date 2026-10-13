# BuildKart editorial CMS (Strapi v5).
#
# Builds with Node, not Bun: the Strapi toolchain and its React admin do not run reliably under Bun.
# Content is editorial only; no commerce, marketplace or ERP database is reachable from here.

FROM node:22.22.0-bookworm-slim AS build

WORKDIR /opt/cms

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY tsconfig.json ./
RUN npm install --no-audit --no-fund

COPY config ./config
COPY src ./src
COPY public ./public

RUN npm run build

FROM node:22.22.0-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=1337

WORKDIR /opt/cms

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=build /opt/cms/dist ./dist
COPY --from=build /opt/cms/config ./config
COPY --from=build /opt/cms/src ./src
COPY --from=build /opt/cms/public ./public

EXPOSE 1337

CMD ["npm", "run", "start"]
