FROM oven/bun:1.3.11 AS bun-runtime
FROM node:22.22.0-bookworm-slim

COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN npm run build

WORKDIR /app/packages/api
ENV NODE_ENV=production
EXPOSE 9010
CMD ["npm", "run", "start"]
