FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S -G app app
COPY --from=build --chown=app:app /app/build build
COPY --from=build --chown=app:app /app/node_modules node_modules
COPY --from=build --chown=app:app /app/package.json .
COPY --from=build --chown=app:app /app/drizzle drizzle
COPY --from=build --chown=app:app /app/src/lib/server/sync/canonical.js src/lib/server/sync/canonical.js
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
	CMD node -e "fetch('http://localhost:3000/login').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["sh", "-c", "node drizzle/migrate.mjs && node drizzle/backfill-payload.mjs && node build"]
