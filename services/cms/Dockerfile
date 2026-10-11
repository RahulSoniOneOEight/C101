FROM node:22.22.0-bookworm-slim AS build

WORKDIR /opt/buildkart-cms
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NODE_ENV=production
RUN npm run build

FROM node:22.22.0-bookworm-slim
WORKDIR /opt/buildkart-cms
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY --from=build /opt/buildkart-cms/node_modules ./node_modules
COPY --from=build /opt/buildkart-cms/config ./config
COPY --from=build /opt/buildkart-cms/src ./src
COPY --from=build /opt/buildkart-cms/public ./public
COPY --from=build /opt/buildkart-cms/dist ./dist
COPY --from=build /opt/buildkart-cms/build ./build
EXPOSE 1337
CMD ["npm", "run", "start"]
