FROM oven/bun:1.3.11-alpine

WORKDIR /app
COPY package.json ./
RUN bun install --production
COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
EXPOSE 9040
CMD ["bun", "run", "start"]
