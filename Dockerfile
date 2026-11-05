# Optional: run TradingWave in a container. Local development does not need Docker.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# DATABASE_URL is only needed so prisma generate can read the schema at build time.
RUN DATABASE_URL="file:/data/tradingwave.db" npm run build
ENV NODE_ENV=production PORT=3000 DATABASE_URL="file:/data/tradingwave.db"
VOLUME ["/data"]
EXPOSE 3000
# Create/update the schema on start, then serve.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js db push --skip-generate && npx next start -p ${PORT}"]
