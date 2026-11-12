# syntax=docker/dockerfile:1
#
# MedTech World – Produktions-Image
#
#   Stufe 1 (deps):    alle Abhängigkeiten inkl. Build-Werkzeuge installieren
#   Stufe 2 (build):   Frontend bauen (apps/web/dist)
#   Stufe 3 (runtime): nur Produktionsabhängigkeiten + tsx; die API (TypeScript via tsx,
#                      wie in "npm start") liefert REST-API und gebautes Frontend aus.
#
#   docker build -t medtech-world .
#   docker run -p 3001:3001 -v medtech-data:/app/.data medtech-world

ARG NODE_VERSION=22

# ------------------------------------------------------------------ deps
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/data/package.json packages/data/
COPY packages/ui/package.json packages/ui/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

# ------------------------------------------------------------------ build
FROM deps AS build
COPY . .
# Qualitätsgate: fehlerhafte Inhalte erzeugen kein Image
RUN npm run content:check && npm run build

# ------------------------------------------------------------------ runtime
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    DATABASE_PATH=.data/medtech-world.db \
    SEED_ON_START=true \
    SEED_DEMO_USERS=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/data/package.json packages/data/
COPY packages/ui/package.json packages/ui/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# Produktionsabhängigkeiten; tsx (im Repo devDependency) in exakt der Lockfile-Version global,
# da die API – wie bei "npm start" – TypeScript direkt über tsx ausführt.
RUN npm ci --omit=dev --no-audit --no-fund \
 && npm install -g --no-audit --no-fund "tsx@$(node -p "require('./package-lock.json').packages['node_modules/tsx'].version")" \
 && npm cache clean --force

# Quellcode der Laufzeit (TypeScript), Inhalte und gebautes Frontend
COPY packages/core/src packages/core/src
COPY packages/data/src packages/data/src
COPY apps/api/src apps/api/src
COPY tsconfig.base.json tsconfig.json ./
COPY content content
COPY --from=build /app/apps/web/dist apps/web/dist

# Persistente Daten (SQLite-Datenbank mit Nutzerdaten) als Volume, Betrieb ohne Root-Rechte
RUN mkdir -p /app/.data && chown -R node:node /app/.data
VOLUME ["/app/.data"]
USER node

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/apps/api
CMD ["tsx", "src/server.ts"]
