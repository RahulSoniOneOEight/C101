FROM oven/bun:1.3.11-alpine

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY src ./src
COPY tsconfig.json ./

ENV NODE_ENV=production
EXPOSE 9020
CMD ["bun", "run", "start"]
