# Litestream replicates the SQLite database to Cloud Storage.
FROM node:24-slim AS litestream
ARG LITESTREAM_VERSION=0.5.17
ARG LITESTREAM_SHA256=cfb371176d164437ae869f8351cfde49bd1804ae71c61923f75c9cba9c9c006d
ADD https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-x86_64.tar.gz /tmp/litestream.tar.gz
RUN echo "${LITESTREAM_SHA256}  /tmp/litestream.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/litestream.tar.gz -C /usr/local/bin litestream

FROM node:24-slim AS build
# better-sqlite3 compiles its native addon when no prebuilt binary matches
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim
ENV NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data \
    QLOO_HARNESS_BIN=/usr/local/lib/node_modules/@qloo/qloo-harness/dist/bin.js
WORKDIR /app
# The official Qloo harness runs as a child process (`qloo mcp`), installed with its own dependencies.
RUN npm install --global @qloo/qloo-harness@0.1.26 --no-fund --no-audit && mkdir -p /data
COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY deploy/litestream.yml /etc/litestream.yml
COPY deploy/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
EXPOSE 8080
ENTRYPOINT ["/app/entrypoint.sh"]
