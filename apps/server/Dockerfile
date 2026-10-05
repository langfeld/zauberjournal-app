# Zauberjournal-Server. Bauen im Repo-Root:
#   docker build -f apps/server/Dockerfile -t zauberjournal-server .
#
# Stufe 1 bündelt den Server mit esbuild zu einer einzelnen Datei,
# das fertige Image enthält nur Node und dieses Bündel.

FROM node:24-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY packages/core/src packages/core/src
COPY apps/server/src apps/server/src
RUN npm run bundle --workspace @zauberjournal/server

FROM node:24-alpine
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000
WORKDIR /app
COPY --from=build /repo/apps/server/dist/ ./
# Der Server liefert das Userscript unter /rewe.user.js aus.
COPY userscript/zauberjournal-rewe.user.js ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO /dev/null http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "index.mjs"]
